"""Campaign builder service — creates campaign drafts from prospecting context.

Integrates with the existing campaign service to create native campaigns:
1. Creates campaign via campaign_service.create_campaign().
2. Adds leads from prospecting import results.
3. Supports optional Instantly adapter path (behind feature flag).
4. Returns unified action contract response.

All campaign creation goes through the same existing campaign tables/services.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import ProspectingConversation, ProspectingAction
from app.config import get_settings


# ---------------------------------------------------------------------------
# Unified action contract
# ---------------------------------------------------------------------------

@dataclass
class CampaignActionResult:
    """Unified response for campaign creation (native or Instantly)."""
    target_type: str  # "native" or "instantly"
    campaign_id: uuid.UUID | None = None
    conversation_id: uuid.UUID | None = None
    source_list_id: uuid.UUID | None = None
    created_by_agent: str = "campaign_builder"
    launch_status: str = "draft"  # draft, pending_approval, launched
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class CampaignBuilderService:
    """Creates campaigns from prospecting conversation context."""

    async def create_campaign_draft(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        campaign_name: str,
        lead_list_id: uuid.UUID,
        copy_variants: list[dict[str, str]],
        target_type: str = "native",
        settings: dict[str, Any] | None = None,
    ) -> CampaignActionResult:
        """Create a campaign draft from prospecting context.

        Args:
            db: Database session.
            workspace_id: Workspace scope.
            conversation_id: Source prospecting conversation.
            campaign_name: Name for the new campaign.
            lead_list_id: Lead list to use (from import bridge).
            copy_variants: List of {subject, body} dicts for sequence steps.
            target_type: "native" (default) or "instantly".
            settings: Campaign settings (schedule, daily_limit, etc.).
        """
        # Verify conversation
        result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == conversation_id,
                ProspectingConversation.workspace_id == workspace_id,
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found in workspace")

        # Check target type
        if target_type == "instantly":
            app_settings = get_settings()
            if not app_settings.PROSPECTING_EXTERNAL_INSTANTLY_ENABLED:
                raise ValueError("Instantly integration is not enabled")
            return await self._create_instantly_campaign(
                db, workspace_id, conversation_id, campaign_name,
                lead_list_id, copy_variants, settings,
            )

        # Native campaign creation via existing campaign service
        return await self._create_native_campaign(
            db, workspace_id, conversation_id, campaign_name,
            lead_list_id, copy_variants, settings,
        )

    async def _create_native_campaign(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        campaign_name: str,
        lead_list_id: uuid.UUID,
        copy_variants: list[dict[str, str]],
        settings: dict[str, Any] | None = None,
    ) -> CampaignActionResult:
        """Create a fully-wired native campaign: leads, steps/variants, accounts."""
        from app.services.campaign_service import campaign_service
        from app.models.lead import LeadListMember
        from app.models.email_account import EmailAccount
        from app.models.sequence import Sequence
        from app.models.step import Step
        from app.models.variant import Variant

        # Build campaign data
        campaign_data: dict[str, Any] = {
            "name": campaign_name,
            "description": f"Created from prospecting conversation {conversation_id}",
            "status": "draft",
        }

        # Apply optional settings
        if settings:
            for key in ("daily_limit", "timezone", "send_days", "send_start_hour", "send_end_hour"):
                if key in settings:
                    campaign_data[key] = settings[key]

        campaign = await campaign_service.create_campaign(
            db=db, workspace_id=workspace_id, data=campaign_data,
        )

        # ── Wire leads from lead list ───────────────────────────────
        lead_result = await db.execute(
            select(LeadListMember.lead_id)
            .where(LeadListMember.lead_list_id == lead_list_id)
            .distinct()
        )
        lead_ids = [row[0] for row in lead_result.all()]
        leads_added = 0
        if lead_ids:
            leads_added = await campaign_service.add_leads(
                db=db, campaign_id=campaign.id, lead_ids=lead_ids, workspace_id=workspace_id,
            )

        # ── Wire sequence steps and variants ────────────────────────
        # Get the auto-created default sequence
        seq_result = await db.execute(
            select(Sequence)
            .where(Sequence.campaign_id == campaign.id)
            .order_by(Sequence.order)
        )
        sequence = seq_result.scalars().first()

        variants_created = 0
        if sequence and copy_variants:
            variant_labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            for i, cv in enumerate(copy_variants):
                step = Step(
                    sequence_id=sequence.id,
                    order=i,
                    step_type="email",
                    wait_days=cv.get("wait_days", 3 if i > 0 else 0),
                    subject=cv.get("subject", ""),
                    body=cv.get("body", ""),
                )
                db.add(step)
                await db.flush()

                variant = Variant(
                    step_id=step.id,
                    name=variant_labels[i % len(variant_labels)],
                    subject=cv.get("subject", ""),
                    body=cv.get("body", ""),
                    weight=100,
                )
                db.add(variant)
                variants_created += 1

            await db.flush()

        # ── Wire sending accounts ───────────────────────────────────
        # Use accounts specified in settings, or fall back to all active workspace accounts
        account_ids_setting = (settings or {}).get("account_ids")
        if account_ids_setting:
            account_ids = [uuid.UUID(a) if isinstance(a, str) else a for a in account_ids_setting]
        else:
            acc_result = await db.execute(
                select(EmailAccount.id).where(
                    EmailAccount.workspace_id == workspace_id,
                    EmailAccount.is_active.is_(True),
                )
            )
            account_ids = [row[0] for row in acc_result.all()]

        accounts_added = 0
        if account_ids:
            accounts_added = await campaign_service.add_accounts(
                db=db, campaign_id=campaign.id, account_ids=account_ids, workspace_id=workspace_id,
            )

        await db.flush()

        return CampaignActionResult(
            target_type="native",
            campaign_id=campaign.id,
            conversation_id=conversation_id,
            source_list_id=lead_list_id,
            created_by_agent="campaign_builder",
            launch_status="draft",
            metadata={
                "campaign_name": campaign_name,
                "leads_added": leads_added,
                "variants_created": variants_created,
                "accounts_added": accounts_added,
                "settings_applied": list((settings or {}).keys()),
            },
        )

    async def _create_instantly_campaign(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        campaign_name: str,
        lead_list_id: uuid.UUID,
        copy_variants: list[dict[str, str]],
        settings: dict[str, Any] | None = None,
    ) -> CampaignActionResult:
        """Create campaign via Instantly adapter (stub).

        This adapter is isolated and does not bypass policy checks.
        Real implementation will call the Instantly API.
        """
        # TODO: Wire actual Instantly API adapter
        return CampaignActionResult(
            target_type="instantly",
            campaign_id=None,  # Instantly campaigns don't have local IDs
            conversation_id=conversation_id,
            source_list_id=lead_list_id,
            created_by_agent="campaign_builder",
            launch_status="pending_external",
            metadata={
                "campaign_name": campaign_name,
                "external_service": "instantly",
                "status": "stub_not_connected",
            },
        )

    async def launch_campaign(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        campaign_id: uuid.UUID,
    ) -> CampaignActionResult:
        """Launch a campaign that was created from prospecting.

        Requires a prior approved action gate (campaign_launch).
        """
        # Verify conversation
        result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == conversation_id,
                ProspectingConversation.workspace_id == workspace_id,
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")

        # Check for approved launch action
        action_result = await db.execute(
            select(ProspectingAction).where(
                ProspectingAction.conversation_id == conversation_id,
                ProspectingAction.workspace_id == workspace_id,
                ProspectingAction.action_type == "campaign_launch",
                ProspectingAction.status == "approved",
            )
        )
        action = action_result.scalar_one_or_none()
        if not action:
            raise ValueError(
                "Campaign launch requires an approved action. "
                "Create and approve a campaign_launch action first."
            )

        # Start campaign via existing service
        from app.services.campaign_service import campaign_service
        campaign = await campaign_service.start_campaign(
            db=db, campaign_id=campaign_id, workspace_id=workspace_id,
        )

        # Mark action as executed
        action.status = "executed"
        action.executed_at = datetime.now(timezone.utc)
        await db.flush()

        return CampaignActionResult(
            target_type="native",
            campaign_id=campaign.id,
            conversation_id=conversation_id,
            created_by_agent="campaign_builder",
            launch_status="launched",
            metadata={
                "launched_at": datetime.now(timezone.utc).isoformat(),
                "action_id": str(action.id),
            },
        )


campaign_builder_service = CampaignBuilderService()
