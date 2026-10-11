"""Lead enrichment service — waterfall enrichment pipeline with provider fallback.

Enrichment pipeline:
1. Load un-enriched leads from a run.
2. For each lead, try providers in priority order (waterfall).
3. First provider to return a confident result wins.
4. If all fail, mark with reason code.

Provider abstraction allows adding new enrichment sources without
changing the pipeline logic. Each provider returns an EnrichmentResult
with source, confidence, and reason codes.
"""

from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import ProspectingLead, ProspectingRun

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enrichment result
# ---------------------------------------------------------------------------

@dataclass
class EnrichmentResult:
    """Result from a single enrichment attempt."""
    email: str | None = None
    email_confidence: float = 0.0  # 0.0–1.0
    source: str = ""
    success: bool = False
    reason_code: str | None = None  # FOUND, NOT_FOUND, PROVIDER_ERROR, LOW_CONFIDENCE, etc.
    enrichment_data: dict[str, Any] = field(default_factory=dict)


# Reason codes
class ReasonCode:
    FOUND = "FOUND"
    NOT_FOUND = "NOT_FOUND"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    NO_INPUT_DATA = "NO_INPUT_DATA"
    ALL_PROVIDERS_FAILED = "ALL_PROVIDERS_FAILED"


# ---------------------------------------------------------------------------
# Provider abstraction
# ---------------------------------------------------------------------------

class EnrichmentProvider(ABC):
    """Abstract base for enrichment data providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""

    @property
    def priority(self) -> int:
        """Lower = higher priority in waterfall. Default 100."""
        return 100

    @property
    def min_confidence_threshold(self) -> float:
        """Minimum confidence to accept result. Default 0.7."""
        return 0.7

    @abstractmethod
    async def enrich(self, lead_data: dict[str, Any]) -> EnrichmentResult:
        """Attempt to enrich a lead. Returns EnrichmentResult."""


# ---------------------------------------------------------------------------
# AnyMailFinder provider (real integration)
# ---------------------------------------------------------------------------

class AnyMailFinderProvider(EnrichmentProvider):
    """Email discovery via AnyMailFinder API."""

    @property
    def name(self) -> str:
        return "anymailfinder"

    @property
    def priority(self) -> int:
        return 10

    async def enrich(self, lead_data: dict[str, Any]) -> EnrichmentResult:
        """Find email using AnyMailFinder API."""
        first_name = lead_data.get("first_name", "")
        last_name = lead_data.get("last_name", "")
        domain = lead_data.get("domain", "")
        company = lead_data.get("company", "")

        full_name = f"{first_name} {last_name}".strip()

        if not full_name or not domain:
            return EnrichmentResult(
                source=self.name,
                success=False,
                reason_code=ReasonCode.NO_INPUT_DATA,
                enrichment_data={"provider": self.name, "message": "Missing name or domain"},
            )

        try:
            from app.utils.anymailfinder_client import find_email

            result = await find_email(
                full_name=full_name,
                domain=domain,
                company_name=company or None,
            )

            if result.success and result.email:
                return EnrichmentResult(
                    email=result.email,
                    email_confidence=result.confidence,
                    source=self.name,
                    success=True,
                    reason_code=ReasonCode.FOUND,
                    enrichment_data={
                        "provider": self.name,
                        "raw_response": result.raw_response,
                    },
                )
            else:
                return EnrichmentResult(
                    source=self.name,
                    success=False,
                    reason_code=ReasonCode.NOT_FOUND,
                    enrichment_data={
                        "provider": self.name,
                        "error": result.error,
                    },
                )

        except Exception as e:
            logger.warning("AnyMailFinder enrichment failed: %s", str(e))
            return EnrichmentResult(
                source=self.name,
                success=False,
                reason_code=ReasonCode.PROVIDER_ERROR,
                enrichment_data={"provider": self.name, "error": str(e)},
            )


class EmailFinderProvider(EnrichmentProvider):
    """Legacy email finder stub — kept as fallback."""

    @property
    def name(self) -> str:
        return "email_finder"

    @property
    def priority(self) -> int:
        return 50

    async def enrich(self, lead_data: dict[str, Any]) -> EnrichmentResult:
        return EnrichmentResult(
            source=self.name,
            success=False,
            reason_code=ReasonCode.PROVIDER_ERROR,
            enrichment_data={"provider": self.name, "message": "fallback_not_connected"},
        )


class LinkedInEnrichmentProvider(EnrichmentProvider):
    """Person enrichment via LinkedIn-style data (stub)."""

    @property
    def name(self) -> str:
        return "linkedin_enrichment"

    @property
    def priority(self) -> int:
        return 20

    async def enrich(self, lead_data: dict[str, Any]) -> EnrichmentResult:
        return EnrichmentResult(
            source=self.name,
            success=False,
            reason_code=ReasonCode.PROVIDER_ERROR,
            enrichment_data={"provider": self.name, "message": "stub_not_connected"},
        )


class CompanyDomainProvider(EnrichmentProvider):
    """Domain-based email pattern detection (stub)."""

    @property
    def name(self) -> str:
        return "company_domain"

    @property
    def priority(self) -> int:
        return 30

    async def enrich(self, lead_data: dict[str, Any]) -> EnrichmentResult:
        return EnrichmentResult(
            source=self.name,
            success=False,
            reason_code=ReasonCode.PROVIDER_ERROR,
            enrichment_data={"provider": self.name, "message": "stub_not_connected"},
        )


# Default provider chain — AnyMailFinder is now primary
DEFAULT_PROVIDERS: list[EnrichmentProvider] = [
    AnyMailFinderProvider(),
    LinkedInEnrichmentProvider(),
    CompanyDomainProvider(),
    EmailFinderProvider(),
]


# ---------------------------------------------------------------------------
# Waterfall pipeline
# ---------------------------------------------------------------------------

class WaterfallEnrichmentPipeline:
    """Runs enrichment providers in priority order until one succeeds."""

    def __init__(self, providers: list[EnrichmentProvider] | None = None):
        self.providers = sorted(
            providers or DEFAULT_PROVIDERS,
            key=lambda p: p.priority,
        )

    async def enrich_lead(self, lead_data: dict[str, Any]) -> EnrichmentResult:
        """Enrich a single lead through the waterfall."""
        if not lead_data:
            return EnrichmentResult(
                success=False,
                reason_code=ReasonCode.NO_INPUT_DATA,
            )

        best_fallback: EnrichmentResult | None = None

        for provider in self.providers:
            try:
                result = await provider.enrich(lead_data)
            except Exception:
                # Provider crashed — skip to next
                continue

            if result.success and result.email_confidence >= provider.min_confidence_threshold:
                # High-confidence match — accept immediately
                return result

            if result.success and result.email:
                # Low confidence but has data — store as fallback
                if best_fallback is None or result.email_confidence > best_fallback.email_confidence:
                    best_fallback = EnrichmentResult(
                        email=result.email,
                        email_confidence=result.email_confidence,
                        source=result.source,
                        success=True,
                        reason_code=ReasonCode.LOW_CONFIDENCE,
                        enrichment_data=result.enrichment_data,
                    )

        # All providers tried — use fallback or fail
        if best_fallback:
            return best_fallback

        return EnrichmentResult(
            success=False,
            reason_code=ReasonCode.ALL_PROVIDERS_FAILED,
            enrichment_data={"providers_tried": [p.name for p in self.providers]},
        )

    async def enrich_batch(
        self, leads_data: list[dict[str, Any]],
    ) -> list[EnrichmentResult]:
        """Enrich a batch of leads. Returns results in same order."""
        return [await self.enrich_lead(data) for data in leads_data]


# ---------------------------------------------------------------------------
# Lead enrichment service (works with DB)
# ---------------------------------------------------------------------------

class LeadEnrichmentService:
    """Enriches ProspectingLead records using the waterfall pipeline."""

    def __init__(self, pipeline: WaterfallEnrichmentPipeline | None = None):
        self.pipeline = pipeline or WaterfallEnrichmentPipeline()

    async def enrich_run(
        self,
        db: AsyncSession,
        run_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> list[EnrichmentResult]:
        """Enrich all un-enriched leads in a run."""
        # Verify run
        run_result = await db.execute(
            select(ProspectingRun).where(
                ProspectingRun.id == run_id,
                ProspectingRun.workspace_id == workspace_id,
            )
        )
        run = run_result.scalar_one_or_none()
        if not run:
            raise ValueError(f"Run {run_id} not found in workspace")

        # Load leads needing enrichment
        leads_result = await db.execute(
            select(ProspectingLead).where(
                ProspectingLead.run_id == run_id,
                ProspectingLead.workspace_id == workspace_id,
            )
        )
        leads = list(leads_result.scalars().all())

        results: list[EnrichmentResult] = []

        for lead in leads:
            # Build lead data dict for the pipeline
            lead_data = {
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "company": lead.company,
                "domain": lead.domain,
                "title": lead.title,
                "linkedin_url": lead.linkedin_url,
                "email": lead.email,
            }

            result = await self.pipeline.enrich_lead(lead_data)
            results.append(result)

            # Apply enrichment result to lead
            self._apply_enrichment(lead, result)

        await db.flush()
        return results

    def _apply_enrichment(self, lead: ProspectingLead, result: EnrichmentResult) -> None:
        """Apply enrichment result to a ProspectingLead record."""
        if result.success and result.email:
            lead.email = result.email
            lead.email_confidence = result.email_confidence

        # Always store enrichment metadata
        existing = lead.enrichment_data or {}
        existing["last_enrichment"] = {
            "source": result.source,
            "success": result.success,
            "reason_code": result.reason_code,
            "confidence": result.email_confidence,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        lead.enrichment_data = existing

        # Update source if enrichment found something
        if result.success and result.source:
            lead.source_name = result.source


lead_enrichment_service = LeadEnrichmentService()
