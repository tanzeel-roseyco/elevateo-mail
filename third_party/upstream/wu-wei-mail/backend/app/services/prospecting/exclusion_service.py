"""Exclusion taxonomy and recovery suggestions.

Provides normalized exclusion reasons for prospecting leads and
actionable recovery suggestions that can be surfaced in the conversation UI.

Exclusion reasons:
- NO_DOMAIN: Lead has no domain/company association
- LOW_CONFIDENCE_EMAIL: Email found but below confidence threshold
- NO_EMAIL: No email could be found
- ROLE_MISMATCH: Title/role doesn't match ICP criteria
- GEO_MISMATCH: Location doesn't match ICP geography
- DUPLICATE_EXISTING_CRM: Already exists in the CRM leads table
- DUPLICATE_PROSPECTING: Already found in a previous prospecting run
- DUPLICATE_WITHIN_RUN: Duplicate email within the same run
- DISPOSABLE_EMAIL: Email uses a disposable/temporary domain
- FREE_EMAIL: Email uses a free provider (Gmail, Yahoo, etc.)
- BOUNCE_RISK: Email likely to bounce based on domain/pattern analysis
- MANUALLY_EXCLUDED: User explicitly excluded this lead
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ---------------------------------------------------------------------------
# Exclusion reason constants
# ---------------------------------------------------------------------------

class ExclusionReason:
    NO_DOMAIN = "NO_DOMAIN"
    LOW_CONFIDENCE_EMAIL = "LOW_CONFIDENCE_EMAIL"
    NO_EMAIL = "NO_EMAIL"
    ROLE_MISMATCH = "ROLE_MISMATCH"
    GEO_MISMATCH = "GEO_MISMATCH"
    DUPLICATE_EXISTING_CRM = "DUPLICATE_EXISTING_CRM"
    DUPLICATE_PROSPECTING = "DUPLICATE_PROSPECTING"
    DUPLICATE_WITHIN_RUN = "DUPLICATE_WITHIN_RUN"
    DISPOSABLE_EMAIL = "DISPOSABLE_EMAIL"
    FREE_EMAIL = "FREE_EMAIL"
    BOUNCE_RISK = "BOUNCE_RISK"
    MANUALLY_EXCLUDED = "MANUALLY_EXCLUDED"

    ALL = {
        NO_DOMAIN, LOW_CONFIDENCE_EMAIL, NO_EMAIL,
        ROLE_MISMATCH, GEO_MISMATCH,
        DUPLICATE_EXISTING_CRM, DUPLICATE_PROSPECTING, DUPLICATE_WITHIN_RUN,
        DISPOSABLE_EMAIL, FREE_EMAIL, BOUNCE_RISK,
        MANUALLY_EXCLUDED,
    }


# ---------------------------------------------------------------------------
# Recovery suggestions
# ---------------------------------------------------------------------------

@dataclass
class RecoverySuggestion:
    """Actionable suggestion for recovering an excluded lead."""
    reason: str
    suggestion: str
    action_type: str | None = None  # e.g. "re_enrich", "manual_review", "re_discover"
    severity: str = "medium"  # low, medium, high


# Recovery suggestion mapping
RECOVERY_SUGGESTIONS: dict[str, RecoverySuggestion] = {
    ExclusionReason.NO_DOMAIN: RecoverySuggestion(
        reason=ExclusionReason.NO_DOMAIN,
        suggestion="Try enriching this lead with company data. If you have their LinkedIn profile, we can extract the company domain.",
        action_type="re_enrich",
        severity="medium",
    ),
    ExclusionReason.LOW_CONFIDENCE_EMAIL: RecoverySuggestion(
        reason=ExclusionReason.LOW_CONFIDENCE_EMAIL,
        suggestion="The email we found has low confidence. Try running enrichment again with a different provider, or verify the email manually.",
        action_type="re_enrich",
        severity="low",
    ),
    ExclusionReason.NO_EMAIL: RecoverySuggestion(
        reason=ExclusionReason.NO_EMAIL,
        suggestion="No email found for this contact. Try enrichment with additional providers, or check if they have a public-facing email on their company website.",
        action_type="re_enrich",
        severity="high",
    ),
    ExclusionReason.ROLE_MISMATCH: RecoverySuggestion(
        reason=ExclusionReason.ROLE_MISMATCH,
        suggestion="This person's role doesn't match your ICP. Consider broadening your role criteria, or look for colleagues at the same company who better match.",
        action_type="manual_review",
        severity="low",
    ),
    ExclusionReason.GEO_MISMATCH: RecoverySuggestion(
        reason=ExclusionReason.GEO_MISMATCH,
        suggestion="This contact is outside your target geography. If the company operates in your target region, they might still be a valid contact.",
        action_type="manual_review",
        severity="low",
    ),
    ExclusionReason.DUPLICATE_EXISTING_CRM: RecoverySuggestion(
        reason=ExclusionReason.DUPLICATE_EXISTING_CRM,
        suggestion="This contact already exists in your CRM. Check their existing record for status and engagement history before creating a duplicate.",
        action_type=None,
        severity="low",
    ),
    ExclusionReason.DUPLICATE_PROSPECTING: RecoverySuggestion(
        reason=ExclusionReason.DUPLICATE_PROSPECTING,
        suggestion="This contact was found in a previous prospecting run. Use force refresh mode if you want to re-process them with updated enrichment data.",
        action_type="force_refresh",
        severity="low",
    ),
    ExclusionReason.DUPLICATE_WITHIN_RUN: RecoverySuggestion(
        reason=ExclusionReason.DUPLICATE_WITHIN_RUN,
        suggestion="Multiple sources returned the same contact. The first occurrence has been kept.",
        action_type=None,
        severity="low",
    ),
    ExclusionReason.DISPOSABLE_EMAIL: RecoverySuggestion(
        reason=ExclusionReason.DISPOSABLE_EMAIL,
        suggestion="This email uses a disposable/temporary provider. The contact likely doesn't want to be reached at this address. Try finding their business email instead.",
        action_type="re_enrich",
        severity="high",
    ),
    ExclusionReason.FREE_EMAIL: RecoverySuggestion(
        reason=ExclusionReason.FREE_EMAIL,
        suggestion="This email uses a free provider (Gmail, Yahoo, etc.). For B2B outreach, try finding their company email for better deliverability and professionalism.",
        action_type="re_enrich",
        severity="medium",
    ),
    ExclusionReason.BOUNCE_RISK: RecoverySuggestion(
        reason=ExclusionReason.BOUNCE_RISK,
        suggestion="This email has a high bounce risk. Verify the email address before including in campaigns to protect your sender reputation.",
        action_type="re_enrich",
        severity="high",
    ),
    ExclusionReason.MANUALLY_EXCLUDED: RecoverySuggestion(
        reason=ExclusionReason.MANUALLY_EXCLUDED,
        suggestion="You manually excluded this lead. Re-select it if you've changed your mind.",
        action_type="manual_review",
        severity="low",
    ),
}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ExclusionService:
    """Manages exclusion reasons and recovery suggestions."""

    def get_suggestion(self, reason: str) -> RecoverySuggestion | None:
        """Get recovery suggestion for an exclusion reason."""
        return RECOVERY_SUGGESTIONS.get(reason)

    def get_all_suggestions(self, reasons: list[str]) -> list[RecoverySuggestion]:
        """Get recovery suggestions for multiple exclusion reasons."""
        return [
            RECOVERY_SUGGESTIONS[r]
            for r in reasons
            if r in RECOVERY_SUGGESTIONS
        ]

    def classify_exclusion(self, lead_data: dict[str, Any], icp_criteria: dict[str, Any] | None = None) -> list[str]:
        """Analyze a lead and return all applicable exclusion reasons.

        Does NOT apply exclusions — just identifies which reasons apply.
        Useful for proactive quality gating before import.
        """
        reasons: list[str] = []
        criteria = icp_criteria or {}

        email = (lead_data.get("email") or "").strip()
        domain = lead_data.get("domain") or ""

        # Email checks
        if not email:
            reasons.append(ExclusionReason.NO_EMAIL)
        else:
            email_domain = email.split("@")[1].lower() if "@" in email else ""

            if email_domain in _DISPOSABLE_DOMAINS:
                reasons.append(ExclusionReason.DISPOSABLE_EMAIL)
            elif email_domain in _FREE_DOMAINS:
                reasons.append(ExclusionReason.FREE_EMAIL)

            confidence = lead_data.get("email_confidence")
            if confidence is not None and float(confidence) < 0.5:
                reasons.append(ExclusionReason.LOW_CONFIDENCE_EMAIL)

        # Domain check
        if not domain and not email:
            reasons.append(ExclusionReason.NO_DOMAIN)

        # Role match
        icp_role = (criteria.get("title") or criteria.get("role") or "").lower()
        lead_title = (lead_data.get("title") or "").lower()
        if icp_role and lead_title and icp_role not in lead_title:
            # Check for any word overlap
            icp_words = set(icp_role.split()) - {"of", "the", "and", "in", "at"}
            title_words = set(lead_title.split()) - {"of", "the", "and", "in", "at"}
            if not (icp_words & title_words):
                reasons.append(ExclusionReason.ROLE_MISMATCH)

        # Geo match
        icp_geo = (
            criteria.get("geo") or criteria.get("location") or criteria.get("country") or ""
        ).lower()
        if icp_geo:
            lead_geo = " ".join([
                (lead_data.get("city") or ""),
                (lead_data.get("state") or ""),
                (lead_data.get("country") or ""),
            ]).lower().strip()
            if lead_geo and icp_geo not in lead_geo:
                reasons.append(ExclusionReason.GEO_MISMATCH)

        return reasons

    def format_exclusion_summary(self, reasons: list[str]) -> dict[str, Any]:
        """Format exclusion reasons with suggestions for API response."""
        items = []
        for reason in reasons:
            suggestion = self.get_suggestion(reason)
            items.append({
                "reason": reason,
                "suggestion": suggestion.suggestion if suggestion else None,
                "action_type": suggestion.action_type if suggestion else None,
                "severity": suggestion.severity if suggestion else "medium",
            })

        return {
            "exclusion_count": len(items),
            "exclusions": items,
            "has_recoverable": any(
                i["action_type"] is not None for i in items
            ),
        }


# Private domain sets (imported from quality_scoring_service to avoid duplication)
from app.services.prospecting.quality_scoring_service import (
    FREE_EMAIL_DOMAINS as _FREE_DOMAINS,
    DISPOSABLE_EMAIL_DOMAINS as _DISPOSABLE_DOMAINS,
)


exclusion_service = ExclusionService()
