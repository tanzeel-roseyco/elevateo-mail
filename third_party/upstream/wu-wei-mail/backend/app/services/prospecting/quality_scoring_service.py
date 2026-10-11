"""Quality scoring service — multi-factor quality score and readiness bands.

Computes `prospecting_quality_score` (0.0–1.0) from:
- domain_quality: valid domain, not free/disposable
- email_confidence: source reliability score
- role_match: relevance to ICP title/role criteria
- geo_relevance: match against ICP geography
- data_recency: freshness of the data
- duplicate_penalty: collision with existing records

Score components are persisted in ProspectingLead.quality_components for
explainability. Readiness bands are assigned based on score thresholds.

Bands:
- READY_HIGH_CONFIDENCE (>= 0.7): Import-ready with high confidence
- READY_REVIEW (>= 0.4, < 0.7): Needs human review before import
- HOLD (< 0.4): Not ready for import
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import ProspectingLead


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class ReadinessBand:
    READY_HIGH_CONFIDENCE = "READY_HIGH_CONFIDENCE"
    READY_REVIEW = "READY_REVIEW"
    HOLD = "HOLD"

    THRESHOLD_HIGH = 0.7
    THRESHOLD_REVIEW = 0.4


# Known free email providers (subset for scoring)
FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
    "live.com", "msn.com", "gmx.com", "fastmail.com",
}

# Known disposable email domains (subset for scoring)
DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com", "tempmail.com", "throwaway.email", "guerrillamail.com",
    "sharklasers.com", "yopmail.com", "trashmail.com", "10minutemail.com",
}


# ---------------------------------------------------------------------------
# Score components
# ---------------------------------------------------------------------------

@dataclass
class QualityComponents:
    """Breakdown of individual quality score factors."""
    domain_quality: float = 0.0
    email_confidence: float = 0.0
    role_match: float = 0.0
    geo_relevance: float = 0.0
    data_recency: float = 0.0
    duplicate_penalty: float = 0.0

    # Weights for combining
    WEIGHTS: dict[str, float] = field(default_factory=lambda: {
        "domain_quality": 0.20,
        "email_confidence": 0.30,
        "role_match": 0.20,
        "geo_relevance": 0.10,
        "data_recency": 0.10,
        "duplicate_penalty": 0.10,
    })

    def compute_total(self) -> float:
        """Compute weighted total score (0.0–1.0)."""
        scores = {
            "domain_quality": self.domain_quality,
            "email_confidence": self.email_confidence,
            "role_match": self.role_match,
            "geo_relevance": self.geo_relevance,
            "data_recency": self.data_recency,
            "duplicate_penalty": 1.0 - self.duplicate_penalty,  # Inverted: 0 penalty = full score
        }
        total = sum(
            scores[k] * self.WEIGHTS[k]
            for k in self.WEIGHTS
        )
        return max(0.0, min(1.0, total))

    def to_dict(self) -> dict[str, Any]:
        """Serialize for storage in quality_components JSON."""
        return {
            "domain_quality": self.domain_quality,
            "email_confidence": self.email_confidence,
            "role_match": self.role_match,
            "geo_relevance": self.geo_relevance,
            "data_recency": self.data_recency,
            "duplicate_penalty": self.duplicate_penalty,
            "weights": self.WEIGHTS,
        }


# ---------------------------------------------------------------------------
# Scoring service
# ---------------------------------------------------------------------------

class QualityScoringService:
    """Computes quality scores and assigns readiness bands to prospecting leads."""

    def score_lead(
        self,
        lead_data: dict[str, Any],
        icp_criteria: dict[str, Any] | None = None,
        is_duplicate: bool = False,
    ) -> tuple[float, str, QualityComponents]:
        """Score a single lead and assign a readiness band.

        Args:
            lead_data: Dict with lead fields (email, domain, title, city, etc.)
            icp_criteria: ICP criteria to match against (optional).
            is_duplicate: Whether the lead was flagged as a duplicate.

        Returns:
            (score, band, components) tuple.
        """
        criteria = icp_criteria or {}
        components = QualityComponents(
            domain_quality=self._score_domain(lead_data),
            email_confidence=self._score_email_confidence(lead_data),
            role_match=self._score_role_match(lead_data, criteria),
            geo_relevance=self._score_geo_relevance(lead_data, criteria),
            data_recency=self._score_data_recency(lead_data),
            duplicate_penalty=1.0 if is_duplicate else 0.0,
        )

        total = components.compute_total()
        band = self._assign_band(total)
        return total, band, components

    async def score_run(
        self,
        db: AsyncSession,
        run_id: uuid.UUID,
        workspace_id: uuid.UUID,
        icp_criteria: dict[str, Any] | None = None,
    ) -> int:
        """Score all leads in a run and persist results.

        Returns the number of leads scored.
        """
        result = await db.execute(
            select(ProspectingLead).where(
                ProspectingLead.run_id == run_id,
                ProspectingLead.workspace_id == workspace_id,
            )
        )
        leads = list(result.scalars().all())

        for lead in leads:
            lead_data = {
                "email": lead.email,
                "domain": lead.domain,
                "title": lead.title,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "company": lead.company,
                "city": lead.city,
                "state": lead.state,
                "country": lead.country,
                "industry": lead.industry,
                "email_confidence": lead.email_confidence,
                "source_name": lead.source_name,
            }

            score, band, components = self.score_lead(
                lead_data=lead_data,
                icp_criteria=icp_criteria,
                is_duplicate=lead.is_excluded and lead.exclusion_reason and "DUPLICATE" in lead.exclusion_reason,
            )

            lead.quality_score = score
            lead.readiness_band = band
            lead.quality_components = components.to_dict()

        await db.flush()
        return len(leads)

    # --- Component scorers ---

    def _score_domain(self, lead_data: dict[str, Any]) -> float:
        """Score domain quality (0.0–1.0)."""
        email = (lead_data.get("email") or "").lower()
        domain = lead_data.get("domain") or ""

        if not email and not domain:
            return 0.0

        # Extract domain from email if not provided
        if not domain and "@" in email:
            domain = email.split("@")[1].lower()

        if not domain:
            return 0.1

        # Disposable = very bad
        if domain in DISPOSABLE_EMAIL_DOMAINS:
            return 0.0

        # Free email = low for B2B
        if domain in FREE_EMAIL_DOMAINS:
            return 0.2

        # Has a domain = good base
        return 0.8

    def _score_email_confidence(self, lead_data: dict[str, Any]) -> float:
        """Score based on email confidence from enrichment."""
        confidence = lead_data.get("email_confidence")
        if confidence is not None:
            return max(0.0, min(1.0, float(confidence)))

        # Has an email but no confidence score → moderate
        if lead_data.get("email"):
            return 0.5

        # No email at all
        return 0.0

    def _score_role_match(self, lead_data: dict[str, Any], icp_criteria: dict[str, Any]) -> float:
        """Score role/title relevance against ICP criteria."""
        lead_title = (lead_data.get("title") or "").lower()

        if not lead_title:
            return 0.3  # Unknown role gets neutral-low score

        icp_role = (icp_criteria.get("title") or icp_criteria.get("role") or "").lower()
        if not icp_role:
            return 0.6  # No ICP role to match against → moderate

        # Exact substring match
        if icp_role in lead_title or lead_title in icp_role:
            return 1.0

        # Partial match (share significant words)
        icp_words = set(icp_role.split())
        title_words = set(lead_title.split())
        common = icp_words & title_words
        # Filter trivial words
        common -= {"of", "the", "and", "in", "at", "for", "a", "an"}

        if len(common) > 0:
            return 0.7

        return 0.3

    def _score_geo_relevance(self, lead_data: dict[str, Any], icp_criteria: dict[str, Any]) -> float:
        """Score geographic relevance against ICP criteria."""
        icp_geo = (
            icp_criteria.get("geo")
            or icp_criteria.get("location")
            or icp_criteria.get("country")
            or ""
        ).lower()

        if not icp_geo:
            return 0.7  # No geo criteria → moderate default

        lead_country = (lead_data.get("country") or "").lower()
        lead_city = (lead_data.get("city") or "").lower()
        lead_state = (lead_data.get("state") or "").lower()

        if not lead_country and not lead_city and not lead_state:
            return 0.3  # No geo data → low

        # Check match against any lead geo field
        if icp_geo in lead_country or icp_geo in lead_state or icp_geo in lead_city:
            return 1.0

        if lead_country and icp_geo.lower() in lead_country:
            return 0.9

        return 0.4

    def _score_data_recency(self, lead_data: dict[str, Any]) -> float:
        """Score data recency. Fresh data scores higher.

        Currently returns a moderate default since we don't have
        data age metadata from most sources yet.
        """
        # TODO: When sources provide last_verified_at or similar, use it
        source = lead_data.get("source_name") or ""

        # LinkedIn data tends to be more current
        if "linkedin" in source.lower():
            return 0.8

        # Default moderate recency
        return 0.6

    def _assign_band(self, score: float) -> str:
        """Assign readiness band from total score."""
        if score >= ReadinessBand.THRESHOLD_HIGH:
            return ReadinessBand.READY_HIGH_CONFIDENCE
        elif score >= ReadinessBand.THRESHOLD_REVIEW:
            return ReadinessBand.READY_REVIEW
        else:
            return ReadinessBand.HOLD


quality_scoring_service = QualityScoringService()
