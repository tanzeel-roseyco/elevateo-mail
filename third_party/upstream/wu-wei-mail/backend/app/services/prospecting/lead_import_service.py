"""Lead import bridge — imports prospecting leads into existing CRM leads/lists.

Import flow:
1. Validate that the leads are selected and ready for import.
2. Default: only import READY_HIGH_CONFIDENCE and READY_REVIEW bands.
3. Dedupe against existing CRM leads by (workspace_id, email).
4. Create Lead records in the CRM leads table.
5. Optionally add to a lead list.
6. Store provenance in Lead.custom_fields.
7. Link back to ProspectingLead via imported_lead_id.

This service requires an approved action gate for bulk imports.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import ProspectingLead
from app.models.lead import Lead, LeadList, LeadListMember


# ---------------------------------------------------------------------------
# Import result
# ---------------------------------------------------------------------------

class LeadImportResult:
    """Result of a lead import operation."""

    def __init__(self):
        self.imported_count: int = 0
        self.duplicate_count: int = 0
        self.skipped_count: int = 0
        self.imported_lead_ids: list[uuid.UUID] = []
        self.lead_list_id: uuid.UUID | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "imported_count": self.imported_count,
            "duplicate_count": self.duplicate_count,
            "skipped_count": self.skipped_count,
            "imported_lead_ids": [str(lid) for lid in self.imported_lead_ids],
            "lead_list_id": str(self.lead_list_id) if self.lead_list_id else None,
        }


# Bands eligible for import by default
DEFAULT_IMPORT_BANDS = {"READY_HIGH_CONFIDENCE", "READY_REVIEW"}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class LeadImportService:
    """Imports prospecting leads into existing CRM leads and lead lists."""

    async def import_leads(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_ids: list[uuid.UUID],
        target_list_id: uuid.UUID | None = None,
        new_list_name: str | None = None,
        allowed_bands: set[str] | None = None,
    ) -> LeadImportResult:
        """Import selected prospecting leads into the CRM.

        Args:
            db: Database session.
            workspace_id: Workspace scope.
            lead_ids: IDs of ProspectingLead records to import.
            target_list_id: Existing lead list to add to (optional).
            new_list_name: Create a new list with this name (optional).
            allowed_bands: Readiness bands to allow. Defaults to HIGH and REVIEW.
        """
        bands = allowed_bands or DEFAULT_IMPORT_BANDS
        result = LeadImportResult()

        # Load prospecting leads
        leads_result = await db.execute(
            select(ProspectingLead).where(
                ProspectingLead.id.in_(lead_ids),
                ProspectingLead.workspace_id == workspace_id,
            )
        )
        prospect_leads = list(leads_result.scalars().all())

        if not prospect_leads:
            return result

        # Resolve or create target list
        lead_list = await self._resolve_lead_list(
            db, workspace_id, target_list_id, new_list_name,
        )
        if lead_list:
            result.lead_list_id = lead_list.id

        # Collect emails for batch dedupe check
        emails_to_check = [
            pl.email.lower().strip()
            for pl in prospect_leads
            if pl.email
        ]

        # Check existing CRM leads for duplicates
        existing_emails: set[str] = set()
        if emails_to_check:
            existing_result = await db.execute(
                select(Lead.email).where(
                    Lead.workspace_id == workspace_id,
                    Lead.email.in_(emails_to_check),
                )
            )
            existing_emails = {
                row[0].lower().strip() for row in existing_result.all()
            }

        # Process each lead
        for pl in prospect_leads:
            # Skip excluded leads
            if pl.is_excluded:
                result.skipped_count += 1
                continue

            # Skip leads without email
            if not pl.email:
                result.skipped_count += 1
                continue

            # Check readiness band
            if pl.readiness_band and pl.readiness_band not in bands:
                result.skipped_count += 1
                continue

            # Check CRM dedupe
            email_lower = pl.email.lower().strip()
            if email_lower in existing_emails:
                result.duplicate_count += 1
                continue

            # Create CRM lead
            crm_lead = Lead(
                workspace_id=workspace_id,
                email=pl.email,
                first_name=pl.first_name,
                last_name=pl.last_name,
                company=pl.company,
                title=pl.title,
                phone=pl.phone,
                linkedin_url=pl.linkedin_url,
                website=pl.website,
                city=pl.city,
                state=pl.state,
                country=pl.country,
                industry=pl.industry,
                status="active",
                custom_fields={
                    "prospecting_source": pl.source_name,
                    "prospecting_run_id": str(pl.run_id),
                    "prospecting_lead_id": str(pl.id),
                    "quality_score": pl.quality_score,
                    "readiness_band": pl.readiness_band,
                    "imported_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            db.add(crm_lead)
            await db.flush()

            # Link back
            pl.imported_lead_id = crm_lead.id
            pl.is_selected = True

            # Add to existing emails to prevent within-batch duplicates
            existing_emails.add(email_lower)

            result.imported_count += 1
            result.imported_lead_ids.append(crm_lead.id)

            # Add to lead list if specified
            if lead_list:
                membership = LeadListMember(
                    lead_list_id=lead_list.id,
                    lead_id=crm_lead.id,
                )
                db.add(membership)

        await db.flush()

        # Notify workflow event bus about imported leads
        if result.imported_lead_ids:
            try:
                from app.services.workflow.event_bus import workflow_event_bus
                await workflow_event_bus.on_leads_imported(
                    db=db,
                    workspace_id=workspace_id,
                    lead_ids=result.imported_lead_ids,
                    trigger_data={"source": "prospecting_import"},
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    "Failed to notify workflow event bus on prospecting import: %s", e
                )

        return result

    async def _resolve_lead_list(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        target_list_id: uuid.UUID | None,
        new_list_name: str | None,
    ) -> LeadList | None:
        """Resolve or create the target lead list."""
        if target_list_id:
            result = await db.execute(
                select(LeadList).where(
                    LeadList.id == target_list_id,
                    LeadList.workspace_id == workspace_id,
                )
            )
            lead_list = result.scalar_one_or_none()
            if not lead_list:
                raise ValueError(f"Lead list {target_list_id} not found in workspace")
            return lead_list

        if new_list_name:
            lead_list = LeadList(
                workspace_id=workspace_id,
                name=new_list_name,
                description="Created from prospecting import",
            )
            db.add(lead_list)
            await db.flush()
            return lead_list

        return None


lead_import_service = LeadImportService()
