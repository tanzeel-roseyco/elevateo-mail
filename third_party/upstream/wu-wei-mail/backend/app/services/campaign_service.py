"""Campaign service — business logic for campaign management."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.campaign import Campaign, CampaignLead, CampaignAccount
from app.models.email_account import EmailAccount
from app.models.sequence import Sequence
from app.models.step import Step
from app.models.variant import Variant
from app.models.condition import Condition


class CampaignService:
    @staticmethod
    def _account_sendability_reason(account: EmailAccount) -> str | None:
        """Return None when account is sendable, otherwise a blocker reason."""
        if not account.is_active:
            return "account is inactive"

        if account.provider in ("google", "microsoft"):
            if not account.oauth_access_token:
                return "missing OAuth access token"
            if not account.oauth_refresh_token:
                return "missing OAuth refresh token"
            return None

        if not account.smtp_host:
            return "missing SMTP host"
        if not account.smtp_port:
            return "missing SMTP port"
        if not account.smtp_username:
            return "missing SMTP username"
        if not account.smtp_password:
            return "missing SMTP password"
        return None


    async def list_campaigns(self, db: AsyncSession, workspace_id: UUID) -> list[Campaign]:
        result = await db.execute(
            select(Campaign)
            .where(Campaign.workspace_id == workspace_id)
            .options(selectinload(Campaign.sequences).selectinload(Sequence.steps).selectinload(Step.variants))
            .order_by(Campaign.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_campaign(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> Campaign:
        result = await db.execute(
            select(Campaign)
            .where(Campaign.id == campaign_id, Campaign.workspace_id == workspace_id)
            .options(
                selectinload(Campaign.sequences)
                .selectinload(Sequence.steps)
                .selectinload(Step.variants),
                selectinload(Campaign.campaign_leads),
                selectinload(Campaign.campaign_accounts),
            )
        )
        campaign = result.scalar_one_or_none()
        if not campaign:
            raise ValueError("Campaign not found")
        return campaign

    async def create_campaign(self, db: AsyncSession, workspace_id: UUID, data: dict) -> Campaign:
        campaign = Campaign(workspace_id=workspace_id, **data)
        db.add(campaign)
        await db.flush()

        # Auto-create a default sequence
        sequence = Sequence(campaign_id=campaign.id, name="Main Sequence", order=0)
        db.add(sequence)
        await db.flush()

        return campaign

    async def update_campaign(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID, data: dict) -> Campaign:
        campaign = await self.get_campaign(db, campaign_id, workspace_id)
        for key, value in data.items():
            if value is not None:
                setattr(campaign, key, value)
        campaign.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return campaign

    async def delete_campaign(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> None:
        campaign = await self.get_campaign(db, campaign_id, workspace_id)
        await db.delete(campaign)
        await db.flush()

    async def start_campaign(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> Campaign:
        campaign = await self.get_campaign(db, campaign_id, workspace_id)
        if campaign.status not in ("draft", "paused"):
            raise ValueError(f"Cannot start campaign in '{campaign.status}' status")

        # Validate prerequisites
        leads_result = await db.execute(
            select(func.count()).select_from(CampaignLead).where(CampaignLead.campaign_id == campaign_id)
        )
        lead_count = leads_result.scalar() or 0
        if lead_count == 0:
            raise ValueError("Cannot start campaign with no leads. Add leads before launching.")

        accounts_result = await db.execute(
            select(func.count()).select_from(CampaignAccount).where(CampaignAccount.campaign_id == campaign_id)
        )
        account_count = accounts_result.scalar() or 0
        if account_count == 0:
            raise ValueError("Cannot start campaign with no sending accounts. Add accounts before launching.")

        account_rows = await db.execute(
            select(EmailAccount)
            .join(CampaignAccount, CampaignAccount.account_id == EmailAccount.id)
            .where(CampaignAccount.campaign_id == campaign_id)
        )
        accounts = list(account_rows.scalars().all())
        sendable = []
        blocked = []
        for account in accounts:
            reason = self._account_sendability_reason(account)
            if reason:
                blocked.append(f"{account.email}: {reason}")
            else:
                sendable.append(account)

        if not sendable:
            details = "; ".join(blocked) if blocked else "no valid account configuration found"
            raise ValueError(
                "Cannot start campaign: no sendable accounts are ready. "
                f"Fix account configuration first ({details})."
            )

        # Verify at least one sequence step with a variant exists
        from app.models.variant import Variant
        variant_result = await db.execute(
            select(func.count())
            .select_from(Variant)
            .join(Step, Variant.step_id == Step.id)
            .join(Sequence, Step.sequence_id == Sequence.id)
            .where(Sequence.campaign_id == campaign_id)
        )
        variant_count = variant_result.scalar() or 0
        if variant_count == 0:
            raise ValueError("Cannot start campaign with no email variants. Add sequence steps and variants before launching.")

        campaign.status = "active"
        campaign.updated_at = datetime.now(timezone.utc)

        # Initialize next_send_at for all pending leads so the scheduler can find them
        now = datetime.now(timezone.utc)
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(CampaignLead)
            .where(
                CampaignLead.campaign_id == campaign_id,
                CampaignLead.status == "pending",
                CampaignLead.next_send_at.is_(None),
            )
            .values(next_send_at=now)
        )

        await db.flush()
        return campaign

    async def pause_campaign(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> Campaign:
        campaign = await self.get_campaign(db, campaign_id, workspace_id)
        if campaign.status != "active":
            raise ValueError("Campaign is not active")
        campaign.status = "paused"
        campaign.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return campaign

    async def resume_campaign(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> Campaign:
        campaign = await self.get_campaign(db, campaign_id, workspace_id)
        if campaign.status != "paused":
            raise ValueError("Campaign is not paused")
        campaign.status = "active"
        campaign.updated_at = datetime.now(timezone.utc)

        # Re-initialize next_send_at for pending leads that haven't been scheduled yet
        now = datetime.now(timezone.utc)
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(CampaignLead)
            .where(
                CampaignLead.campaign_id == campaign_id,
                CampaignLead.status == "pending",
                CampaignLead.next_send_at.is_(None),
            )
            .values(next_send_at=now)
        )

        await db.flush()
        return campaign

    # ── Sequence management ──

    async def _verify_sequence_ownership(self, db: AsyncSession, sequence_id: UUID, workspace_id: UUID) -> Sequence:
        """Verify a sequence belongs to a campaign in the given workspace."""
        result = await db.execute(
            select(Sequence)
            .join(Campaign, Sequence.campaign_id == Campaign.id)
            .where(Sequence.id == sequence_id, Campaign.workspace_id == workspace_id)
        )
        sequence = result.scalar_one_or_none()
        if not sequence:
            raise ValueError("Sequence not found")
        return sequence

    async def _verify_step_ownership(self, db: AsyncSession, step_id: UUID, workspace_id: UUID) -> Step:
        """Verify a step belongs to a campaign in the given workspace."""
        result = await db.execute(
            select(Step)
            .join(Sequence, Step.sequence_id == Sequence.id)
            .join(Campaign, Sequence.campaign_id == Campaign.id)
            .where(Step.id == step_id, Campaign.workspace_id == workspace_id)
        )
        step = result.scalar_one_or_none()
        if not step:
            raise ValueError("Step not found")
        return step

    async def add_step(self, db: AsyncSession, sequence_id: UUID, data: dict, workspace_id: UUID = None) -> Step:
        if workspace_id:
            await self._verify_sequence_ownership(db, sequence_id, workspace_id)
        step = Step(sequence_id=sequence_id, **data)
        db.add(step)
        await db.flush()
        return step

    async def add_variant(self, db: AsyncSession, step_id: UUID, data: dict, workspace_id: UUID = None) -> Variant:
        if workspace_id:
            await self._verify_step_ownership(db, step_id, workspace_id)
        variant = Variant(step_id=step_id, **data)
        db.add(variant)
        await db.flush()
        return variant

    async def add_condition(self, db: AsyncSession, step_id: UUID, data: dict, workspace_id: UUID = None) -> Condition:
        if workspace_id:
            await self._verify_step_ownership(db, step_id, workspace_id)
        condition = Condition(step_id=step_id, **data)
        db.add(condition)
        await db.flush()
        return condition

    # ── Lead & Account assignment ──

    async def add_leads(
        self, db: AsyncSession, campaign_id: UUID, lead_ids: list[UUID], workspace_id: UUID | None = None,
    ) -> int:
        # If campaign is already active, new leads should be immediately schedulable
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if not campaign:
            raise ValueError("Campaign not found")

        # Workspace isolation: verify leads belong to the same workspace
        if workspace_id:
            if campaign.workspace_id != workspace_id:
                raise ValueError("Campaign not found")
            from app.models.lead import Lead
            lead_check = await db.execute(
                select(Lead.id).where(
                    Lead.id.in_(lead_ids),
                    Lead.workspace_id == workspace_id,
                )
            )
            valid_lead_ids = {row[0] for row in lead_check.all()}
            lead_ids = [lid for lid in lead_ids if lid in valid_lead_ids]

        now = datetime.now(timezone.utc) if campaign.status == "active" else None

        count = 0
        for lead_id in lead_ids:
            existing = await db.execute(
                select(CampaignLead).where(
                    CampaignLead.campaign_id == campaign_id,
                    CampaignLead.lead_id == lead_id,
                )
            )
            if not existing.scalar_one_or_none():
                cl = CampaignLead(
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    next_send_at=now,
                )
                db.add(cl)
                count += 1
        await db.flush()
        return count

    async def add_accounts(
        self, db: AsyncSession, campaign_id: UUID, account_ids: list[UUID],
        weights: list[int] | None = None, workspace_id: UUID | None = None,
    ) -> int:
        # Workspace isolation: verify accounts belong to the same workspace
        if workspace_id:
            campaign_result = await db.execute(
                select(Campaign).where(Campaign.id == campaign_id, Campaign.workspace_id == workspace_id)
            )
            if not campaign_result.scalar_one_or_none():
                raise ValueError("Campaign not found")

            from app.models.email_account import EmailAccount
            acc_check = await db.execute(
                select(EmailAccount.id).where(
                    EmailAccount.id.in_(account_ids),
                    EmailAccount.workspace_id == workspace_id,
                )
            )
            valid_acc_ids = {row[0] for row in acc_check.all()}
            account_ids = [aid for aid in account_ids if aid in valid_acc_ids]

        count = 0
        for i, account_id in enumerate(account_ids):
            existing = await db.execute(
                select(CampaignAccount).where(
                    CampaignAccount.campaign_id == campaign_id,
                    CampaignAccount.account_id == account_id,
                )
            )
            if not existing.scalar_one_or_none():
                weight = weights[i] if weights and i < len(weights) else 1
                ca = CampaignAccount(campaign_id=campaign_id, account_id=account_id, weight=weight)
                db.add(ca)
                count += 1
        await db.flush()
        return count


campaign_service = CampaignService()
