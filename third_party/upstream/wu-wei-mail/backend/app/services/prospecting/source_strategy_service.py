"""Source strategy planner — dynamic source mix selection based on ICP characteristics.

The planner analyzes ICP criteria (industry, geo, role, company size, etc.) and
selects a weighted source mix. The output is stored in ProspectingRun.source_strategy
for full auditability.

Source types:
- google_maps: Local/SMB businesses with physical presence
- healthcare_db: Healthcare-specific provider databases
- linkedin_search: Person/role targeting via LinkedIn-style data
- company_db: Firmographic datasets (Crunchbase, etc.)
- email_finder: Email discovery services (Hunter, etc.)
- web_scraper: General web scraping for niche verticals
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


# ---------------------------------------------------------------------------
# ICP type constants
# ---------------------------------------------------------------------------

class ICPType:
    LOCAL_SMB = "local_smb"
    HEALTHCARE = "healthcare"
    B2B_ROLE = "b2b_role"
    B2B_FIRMOGRAPHIC = "b2b_firmographic"
    GENERIC = "generic"

    ALL = {LOCAL_SMB, HEALTHCARE, B2B_ROLE, B2B_FIRMOGRAPHIC, GENERIC}


# ---------------------------------------------------------------------------
# Source definitions
# ---------------------------------------------------------------------------

class SourceName:
    GOOGLE_MAPS = "google_maps"
    HEALTHCARE_DB = "healthcare_db"
    LINKEDIN_SEARCH = "linkedin_search"
    COMPANY_DB = "company_db"
    EMAIL_FINDER = "email_finder"
    WEB_SCRAPER = "web_scraper"

    ALL = {GOOGLE_MAPS, HEALTHCARE_DB, LINKEDIN_SEARCH, COMPANY_DB, EMAIL_FINDER, WEB_SCRAPER}


# ---------------------------------------------------------------------------
# Strategy output
# ---------------------------------------------------------------------------

@dataclass
class SourceWeight:
    """A single source with its assigned weight and reasoning."""
    source_name: str
    weight: float  # 0.0–1.0 relative priority
    reason: str


@dataclass
class SourceStrategy:
    """Complete source strategy for a discovery run."""
    sources: list[SourceWeight]
    icp_type: str
    reasoning: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize for storage in ProspectingRun.source_strategy."""
        return asdict(self)


# ---------------------------------------------------------------------------
# ICP classification signals
# ---------------------------------------------------------------------------

# Keywords that indicate ICP type from criteria fields
_HEALTHCARE_KEYWORDS = {
    "healthcare", "medical", "hospital", "clinic", "dental", "physician",
    "pharma", "pharmaceutical", "health", "nursing", "therapy", "doctor",
    "chiropractic", "optometry", "veterinary", "mental health",
}

_LOCAL_SMB_KEYWORDS = {
    "local", "restaurant", "retail", "shop", "store", "salon", "gym",
    "plumber", "electrician", "contractor", "landscaping", "cleaning",
    "auto repair", "bakery", "cafe", "bar", "florist", "hvac",
}

_ROLE_KEYWORDS = {
    "cto", "cfo", "ceo", "vp", "director", "manager", "head of",
    "chief", "founder", "owner", "lead", "senior", "principal",
    "engineer", "developer", "marketer", "sales",
}


# ---------------------------------------------------------------------------
# Planner service
# ---------------------------------------------------------------------------

class SourceStrategyPlanner:
    """Analyzes ICP criteria and produces a weighted source strategy."""

    def classify_icp(self, icp_criteria: dict[str, Any]) -> str:
        """Classify ICP type from criteria fields.

        Looks at industry, title/role, geo, and company_size signals to
        determine the best ICP category.
        """
        if not icp_criteria:
            return ICPType.GENERIC

        # Flatten all string values for keyword scanning
        text = " ".join(
            str(v).lower()
            for v in icp_criteria.values()
            if isinstance(v, str)
        ).strip()

        # Also check list values (e.g. industries: ["healthcare", "pharma"])
        for v in icp_criteria.values():
            if isinstance(v, list):
                text += " " + " ".join(str(item).lower() for item in v)

        # Priority: healthcare > local_smb > b2b_role > b2b_firmographic > generic
        if any(kw in text for kw in _HEALTHCARE_KEYWORDS):
            return ICPType.HEALTHCARE

        if any(kw in text for kw in _LOCAL_SMB_KEYWORDS):
            return ICPType.LOCAL_SMB

        # Check for role-based targeting
        has_role = any(kw in text for kw in _ROLE_KEYWORDS)
        has_company_size = "company_size" in icp_criteria or "employee_count" in icp_criteria

        if has_role and not has_company_size:
            return ICPType.B2B_ROLE

        if has_company_size:
            return ICPType.B2B_FIRMOGRAPHIC

        if has_role:
            return ICPType.B2B_ROLE

        return ICPType.GENERIC

    def plan(self, icp_criteria: dict[str, Any]) -> SourceStrategy:
        """Produce a weighted source strategy for the given ICP criteria.

        Returns a SourceStrategy with ordered sources and weights that sum to ~1.0.
        The output is designed to be stored in ProspectingRun.source_strategy.
        """
        icp_type = self.classify_icp(icp_criteria)
        sources = self._get_source_weights(icp_type, icp_criteria)
        reasoning = self._build_reasoning(icp_type, icp_criteria)

        return SourceStrategy(
            sources=sources,
            icp_type=icp_type,
            reasoning=reasoning,
            metadata={
                "input_criteria": icp_criteria,
                "classified_icp_type": icp_type,
            },
        )

    def _get_source_weights(
        self, icp_type: str, icp_criteria: dict[str, Any],
    ) -> list[SourceWeight]:
        """Select and weight sources based on ICP type."""
        strategies: dict[str, list[SourceWeight]] = {
            ICPType.LOCAL_SMB: [
                SourceWeight(SourceName.GOOGLE_MAPS, 0.45, "Primary for local/SMB with physical presence"),
                SourceWeight(SourceName.WEB_SCRAPER, 0.25, "Supplement with web data for niche verticals"),
                SourceWeight(SourceName.EMAIL_FINDER, 0.20, "Email discovery for scraped contacts"),
                SourceWeight(SourceName.COMPANY_DB, 0.10, "Firmographic enrichment for larger SMBs"),
            ],
            ICPType.HEALTHCARE: [
                SourceWeight(SourceName.HEALTHCARE_DB, 0.40, "Healthcare-specific provider databases"),
                SourceWeight(SourceName.GOOGLE_MAPS, 0.20, "Clinic/practice location data"),
                SourceWeight(SourceName.EMAIL_FINDER, 0.20, "Email discovery for healthcare professionals"),
                SourceWeight(SourceName.LINKEDIN_SEARCH, 0.15, "Professional profiles for decision-makers"),
                SourceWeight(SourceName.WEB_SCRAPER, 0.05, "Supplementary data from practice websites"),
            ],
            ICPType.B2B_ROLE: [
                SourceWeight(SourceName.LINKEDIN_SEARCH, 0.45, "Primary for role/title-based targeting"),
                SourceWeight(SourceName.EMAIL_FINDER, 0.25, "Email discovery for identified contacts"),
                SourceWeight(SourceName.COMPANY_DB, 0.20, "Company context for role matches"),
                SourceWeight(SourceName.WEB_SCRAPER, 0.10, "Supplementary professional data"),
            ],
            ICPType.B2B_FIRMOGRAPHIC: [
                SourceWeight(SourceName.COMPANY_DB, 0.40, "Primary for firmographic-based targeting"),
                SourceWeight(SourceName.LINKEDIN_SEARCH, 0.30, "People at matched companies"),
                SourceWeight(SourceName.EMAIL_FINDER, 0.20, "Email discovery for contacts"),
                SourceWeight(SourceName.WEB_SCRAPER, 0.10, "Supplementary company data"),
            ],
            ICPType.GENERIC: [
                SourceWeight(SourceName.LINKEDIN_SEARCH, 0.30, "Broad person search"),
                SourceWeight(SourceName.COMPANY_DB, 0.25, "Company database search"),
                SourceWeight(SourceName.EMAIL_FINDER, 0.20, "Email discovery"),
                SourceWeight(SourceName.GOOGLE_MAPS, 0.15, "Location-based results"),
                SourceWeight(SourceName.WEB_SCRAPER, 0.10, "Supplementary web data"),
            ],
        }

        return strategies.get(icp_type, strategies[ICPType.GENERIC])

    def _build_reasoning(self, icp_type: str, icp_criteria: dict[str, Any]) -> str:
        """Build a human-readable reasoning string for audit."""
        reasons: dict[str, str] = {
            ICPType.LOCAL_SMB: (
                "ICP targets local/SMB businesses. Prioritizing Google Maps for "
                "location-based discovery with web scraping for niche data."
            ),
            ICPType.HEALTHCARE: (
                "ICP targets healthcare vertical. Prioritizing healthcare-specific "
                "databases with Google Maps for practice locations."
            ),
            ICPType.B2B_ROLE: (
                "ICP targets specific B2B roles/titles. Prioritizing LinkedIn-style "
                "person search with email discovery follow-up."
            ),
            ICPType.B2B_FIRMOGRAPHIC: (
                "ICP targets companies by firmographic attributes. Prioritizing "
                "company databases with LinkedIn for people at matched companies."
            ),
            ICPType.GENERIC: (
                "ICP did not match a specific vertical. Using balanced source mix "
                "across person, company, and location data."
            ),
        }

        base = reasons.get(icp_type, reasons[ICPType.GENERIC])

        # Add context from criteria
        extras = []
        if "industry" in icp_criteria:
            extras.append(f"Industry: {icp_criteria['industry']}")
        if "geo" in icp_criteria or "location" in icp_criteria or "country" in icp_criteria:
            geo = icp_criteria.get("geo") or icp_criteria.get("location") or icp_criteria.get("country")
            extras.append(f"Geo: {geo}")
        if "title" in icp_criteria or "role" in icp_criteria:
            role = icp_criteria.get("title") or icp_criteria.get("role")
            extras.append(f"Role: {role}")

        if extras:
            base += f" Context: {', '.join(extras)}."

        return base


source_strategy_planner = SourceStrategyPlanner()
