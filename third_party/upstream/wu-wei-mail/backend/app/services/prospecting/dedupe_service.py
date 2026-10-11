"""Workspace-level dedupe memory — cross-run duplicate detection.

Deduplication layers:
1. Run-level: avoid duplicates within a single discovery run.
2. Workspace-level: avoid rediscovering contacts across runs in the same workspace.
3. CRM-level: check against existing leads table before import.

Force refresh mode allows users to explicitly override dedupe and re-process
previously seen contacts (e.g., for re-enrichment after data improvements).

Uses the ix_prospecting_leads_ws_email index for efficient workspace+email lookups.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import ProspectingLead
from app.models.lead import Lead


# ---------------------------------------------------------------------------
# Dedupe result
# ---------------------------------------------------------------------------

@dataclass
class DedupeResult:
    """Result of a duplicate check for a single email."""
    email: str
    is_duplicate: bool
    duplicate_source: str | None = None  # "prospecting_run", "crm"
    duplicate_of_id: uuid.UUID | None = None  # ID of existing record
    source_run_id: uuid.UUID | None = None  # run that owns the existing record


@dataclass
class BatchDedupeResult:
    """Aggregate result of a batch dedupe check."""
    total_checked: int
    duplicates_found: int
    unique_count: int
    results: dict[str, DedupeResult]  # email -> result


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class DedupeService:
    """Workspace-level deduplication across prospecting runs and CRM."""

    async def check_emails(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        emails: list[str],
        exclude_run_id: uuid.UUID | None = None,
        force_refresh: bool = False,
    ) -> BatchDedupeResult:
        """Check a batch of emails for duplicates.

        Args:
            db: Database session.
            workspace_id: Workspace to check within.
            emails: List of email addresses to check.
            exclude_run_id: Exclude leads from this run (useful for self-check).
            force_refresh: If True, skip prospecting dedupe (still check CRM).
        """
        # Normalize emails
        clean_emails = [e.lower().strip() for e in emails if e]
        if not clean_emails:
            return BatchDedupeResult(
                total_checked=0, duplicates_found=0, unique_count=0, results={},
            )

        results: dict[str, DedupeResult] = {}

        # 1. Check against existing CRM leads (always, even in force_refresh)
        crm_dupes = await self._check_crm_duplicates(db, workspace_id, clean_emails)
        results.update(crm_dupes)

        # 2. Check against existing prospecting leads (skip if force_refresh)
        if not force_refresh:
            # Only check emails not already flagged as CRM dupes
            remaining = [e for e in clean_emails if e not in results]
            if remaining:
                prospecting_dupes = await self._check_prospecting_duplicates(
                    db, workspace_id, remaining, exclude_run_id,
                )
                results.update(prospecting_dupes)

        # Fill in non-duplicate results
        for email in clean_emails:
            if email not in results:
                results[email] = DedupeResult(email=email, is_duplicate=False)

        duplicates_found = sum(1 for r in results.values() if r.is_duplicate)

        return BatchDedupeResult(
            total_checked=len(clean_emails),
            duplicates_found=duplicates_found,
            unique_count=len(clean_emails) - duplicates_found,
            results=results,
        )

    async def dedupe_run_leads(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        run_id: uuid.UUID,
        force_refresh: bool = False,
    ) -> BatchDedupeResult:
        """Dedupe all leads in a run against workspace history.

        Marks duplicate leads with is_excluded=True and exclusion_reason.
        Returns the batch result with details.
        """
        # Load leads from this run that have emails
        leads_result = await db.execute(
            select(ProspectingLead).where(
                ProspectingLead.run_id == run_id,
                ProspectingLead.workspace_id == workspace_id,
                ProspectingLead.email.isnot(None),
                ProspectingLead.is_excluded.is_(False),
            )
        )
        leads = list(leads_result.scalars().all())

        if not leads:
            return BatchDedupeResult(
                total_checked=0, duplicates_found=0, unique_count=0, results={},
            )

        # Collect unique emails from this run
        emails = [lead.email for lead in leads if lead.email]

        # Run batch check, excluding current run from prospecting check
        batch_result = await self.check_emails(
            db=db,
            workspace_id=workspace_id,
            emails=emails,
            exclude_run_id=run_id,
            force_refresh=force_refresh,
        )

        # Apply results to leads
        for lead in leads:
            if not lead.email:
                continue

            email_lower = lead.email.lower().strip()
            result = batch_result.results.get(email_lower)
            if result and result.is_duplicate:
                lead.is_excluded = True
                if result.duplicate_source == "crm":
                    lead.exclusion_reason = "DUPLICATE_EXISTING_CRM"
                else:
                    lead.exclusion_reason = "DUPLICATE_PROSPECTING"
                lead.exclusion_detail = (
                    f"Duplicate of {result.duplicate_source} record "
                    f"{result.duplicate_of_id} "
                    f"(run: {result.source_run_id})"
                    if result.source_run_id
                    else f"Duplicate of existing CRM lead {result.duplicate_of_id}"
                )

        # Also dedupe within the run itself (run-level dedupe)
        seen_in_run: dict[str, uuid.UUID] = {}
        for lead in leads:
            if not lead.email or lead.is_excluded:
                continue
            email_lower = lead.email.lower().strip()
            if email_lower in seen_in_run:
                lead.is_excluded = True
                lead.exclusion_reason = "DUPLICATE_WITHIN_RUN"
                lead.exclusion_detail = f"Same email already in this run (lead {seen_in_run[email_lower]})"
                batch_result.duplicates_found += 1
                batch_result.unique_count -= 1
            else:
                seen_in_run[email_lower] = lead.id

        await db.flush()
        return batch_result

    async def _check_crm_duplicates(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        emails: list[str],
    ) -> dict[str, DedupeResult]:
        """Check emails against existing CRM leads table."""
        if not emails:
            return {}

        result = await db.execute(
            select(Lead.email, Lead.id).where(
                Lead.workspace_id == workspace_id,
                Lead.email.in_(emails),
            )
        )
        rows = result.all()

        dupes: dict[str, DedupeResult] = {}
        for row in rows:
            email_lower = row[0].lower().strip()
            dupes[email_lower] = DedupeResult(
                email=email_lower,
                is_duplicate=True,
                duplicate_source="crm",
                duplicate_of_id=row[1],
            )

        return dupes

    async def _check_prospecting_duplicates(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        emails: list[str],
        exclude_run_id: uuid.UUID | None = None,
    ) -> dict[str, DedupeResult]:
        """Check emails against existing prospecting leads (workspace-level)."""
        if not emails:
            return {}

        conditions = [
            ProspectingLead.workspace_id == workspace_id,
            ProspectingLead.email.in_(emails),
            ProspectingLead.is_excluded.is_(False),
        ]
        if exclude_run_id:
            conditions.append(ProspectingLead.run_id != exclude_run_id)

        result = await db.execute(
            select(
                ProspectingLead.email,
                ProspectingLead.id,
                ProspectingLead.run_id,
            ).where(and_(*conditions))
        )
        rows = result.all()

        dupes: dict[str, DedupeResult] = {}
        for row in rows:
            email_lower = row[0].lower().strip()
            if email_lower not in dupes:  # first match wins
                dupes[email_lower] = DedupeResult(
                    email=email_lower,
                    is_duplicate=True,
                    duplicate_source="prospecting_run",
                    duplicate_of_id=row[1],
                    source_run_id=row[2],
                )

        return dupes


dedupe_service = DedupeService()
