"""Email sender worker: sends individual campaign emails."""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory
from app.models.campaign import Campaign, CampaignAccount, CampaignLead
from app.models.email_account import EmailAccount
from app.models.inbox_message import InboxMessage
from app.models.lead import Lead
from app.models.sent_email import SentEmail
from app.models.sequence import Sequence
from app.models.step import Step
from app.models.variant import Variant
from app.services.ab_splitter import ab_splitter
from app.services.email_sender import email_sender
from app.services.template_engine import template_engine
from app.utils.redis_client import increment_account_sent, increment_campaign_sent
from app.utils.tracking_injector import (
    build_tracking_urls,
    ensure_unsubscribe_footer,
    post_process_email_body,
)
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


async def _reset_campaign_lead(
    db: AsyncSession,
    campaign_lead: CampaignLead | None,
    *,
    backoff_seconds: int = 0,
) -> None:
    """Reset CampaignLead to pending so scheduler can retry later."""
    if campaign_lead and campaign_lead.status == "in_sequence":
        campaign_lead.status = "pending"
        if backoff_seconds > 0:
            campaign_lead.next_send_at = datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
    await db.commit()


async def _recover_campaign_lead(campaign_lead_id: str, *, backoff_seconds: int = 0) -> None:
    """Reset CampaignLead status in a fresh session after rollback."""
    try:
        async with async_session_factory() as recovery_db:
            cl_result = await recovery_db.execute(
                select(CampaignLead).where(CampaignLead.id == uuid.UUID(campaign_lead_id))
            )
            cl = cl_result.scalar_one_or_none()
            if cl and cl.status == "in_sequence":
                cl.status = "pending"
                if backoff_seconds > 0:
                    cl.next_send_at = datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)
                await recovery_db.commit()
    except Exception as exc:
        logger.error("Failed to recover CampaignLead %s: %s", campaign_lead_id, str(exc))


async def _mark_delivery_failed(sent_email_id: uuid.UUID) -> None:
    """Mark a reserved sending attempt as failed."""
    try:
        async with async_session_factory() as db:
            result = await db.execute(select(SentEmail).where(SentEmail.id == sent_email_id))
            sent_email = result.scalar_one_or_none()
            if sent_email and sent_email.status == "sending":
                sent_email.status = "failed"
                await db.commit()
    except Exception as exc:
        logger.warning("Failed to mark SentEmail %s as failed: %s", sent_email_id, str(exc))


async def _load_account(db: AsyncSession, account_id: uuid.UUID) -> EmailAccount | None:
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id))
    return result.scalar_one_or_none()


async def _load_variant(db: AsyncSession, variant_id: uuid.UUID | None) -> Variant | None:
    if not variant_id:
        return None
    result = await db.execute(select(Variant).where(Variant.id == variant_id))
    return result.scalar_one_or_none()


async def _find_existing_delivery(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    lead_id: uuid.UUID,
    step_id: uuid.UUID,
) -> SentEmail | None:
    result = await db.execute(
        select(SentEmail)
        .where(
            SentEmail.campaign_id == campaign_id,
            SentEmail.lead_id == lead_id,
            SentEmail.step_id == step_id,
            SentEmail.status.in_(("sending", "sent")),
        )
        .order_by(SentEmail.sent_at.desc())
    )
    return result.scalars().first()


async def _delivery_already_finalized(
    db: AsyncSession,
    sent_email: SentEmail,
    workspace_id: uuid.UUID,
) -> bool:
    if not sent_email.message_id:
        return False
    result = await db.execute(
        select(InboxMessage.id).where(
            InboxMessage.workspace_id == workspace_id,
            InboxMessage.campaign_id == sent_email.campaign_id,
            InboxMessage.lead_id == sent_email.lead_id,
            InboxMessage.account_id == sent_email.account_id,
            InboxMessage.direction == "outbound",
            InboxMessage.message_id == sent_email.message_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _finalize_delivery(
    db: AsyncSession,
    *,
    campaign: Campaign,
    campaign_lead: CampaignLead,
    lead: Lead,
    steps: list[Step],
    current_step_order: int,
    variant: Variant,
    selected_account: EmailAccount,
    sent_email: SentEmail,
) -> None:
    """Apply post-send side effects exactly once (idempotent via outbound inbox marker)."""
    if await _delivery_already_finalized(db, sent_email, campaign.workspace_id):
        logger.info("SentEmail %s already finalized, skipping side effects", sent_email.id)
        return

    variant.sent_count += 1
    selected_account.sent_today += 1

    next_step = next((step for step in steps if step.order > current_step_order), None)
    if next_step:
        campaign_lead.current_step = next_step.order
        campaign_lead.variant_id = variant.id
        campaign_lead.next_send_at = datetime.now(timezone.utc) + timedelta(days=next_step.wait_days)
        campaign_lead.status = "pending"
    else:
        campaign_lead.status = "completed"
        campaign_lead.next_send_at = None
        campaign_lead.variant_id = variant.id

    try:
        from app.models.workflow import OutreachEvent

        outreach_event = OutreachEvent(
            workspace_id=campaign.workspace_id,
            campaign_id=campaign.id,
            lead_id=lead.id,
            event_type="email_sent",
            channel="email",
            payload={
                "message_id": sent_email.message_id,
                "to_email": lead.email,
                "account_id": str(selected_account.id),
                "sent_email_id": str(sent_email.id),
                "step_order": current_step_order,
            },
        )
        db.add(outreach_event)
    except Exception:
        pass

    outbound = InboxMessage(
        workspace_id=campaign.workspace_id,
        account_id=selected_account.id,
        campaign_id=campaign.id,
        lead_id=lead.id,
        message_id=sent_email.message_id,
        from_email=selected_account.email,
        to_email=lead.email,
        subject=sent_email.subject,
        body_html=sent_email.body,
        direction="outbound",
        is_read=True,
    )
    db.add(outbound)
    await db.commit()

    try:
        increment_account_sent(str(selected_account.id))
        increment_campaign_sent(str(campaign.id))
    except Exception as exc:
        logger.warning("Redis counters update failed after send %s: %s", sent_email.id, str(exc))


@celery_app.task(name="app.workers.sender.send_email_task")
def send_email_task(campaign_id: str, campaign_lead_id: str, lead_id: str):
    """Send one campaign email."""
    asyncio.run(_send_email_async(campaign_id, campaign_lead_id, lead_id))


async def _send_email_async(campaign_id: str, campaign_lead_id: str, lead_id: str):
    async with async_session_factory() as db:
        sent_email: SentEmail | None = None
        try:
            cl_result = await db.execute(
                select(CampaignLead).where(CampaignLead.id == uuid.UUID(campaign_lead_id))
            )
            campaign_lead = cl_result.scalar_one_or_none()
            if not campaign_lead:
                logger.error("CampaignLead %s not found", campaign_lead_id)
                return

            lead_result = await db.execute(select(Lead).where(Lead.id == uuid.UUID(lead_id)))
            lead = lead_result.scalar_one_or_none()
            if not lead:
                logger.error("Lead %s not found", lead_id)
                await _reset_campaign_lead(db, campaign_lead)
                return

            campaign_result = await db.execute(select(Campaign).where(Campaign.id == uuid.UUID(campaign_id)))
            campaign = campaign_result.scalar_one_or_none()
            if not campaign:
                logger.error("Campaign %s not found", campaign_id)
                await _reset_campaign_lead(db, campaign_lead)
                return

            accounts_result = await db.execute(
                select(CampaignAccount).where(CampaignAccount.campaign_id == campaign.id)
            )
            campaign_accounts = accounts_result.scalars().all()
            if not campaign_accounts:
                logger.error("No accounts configured for campaign %s", campaign_id)
                await _reset_campaign_lead(db, campaign_lead)
                return

            for ca in campaign_accounts:
                ca.account = await _load_account(db, ca.account_id)

            seq_result = await db.execute(
                select(Sequence).where(Sequence.campaign_id == campaign.id).order_by(Sequence.order)
            )
            sequence = seq_result.scalars().first()
            if not sequence:
                logger.error("No sequence found for campaign %s", campaign_id)
                await _reset_campaign_lead(db, campaign_lead)
                return

            steps_result = await db.execute(
                select(Step).where(Step.sequence_id == sequence.id).order_by(Step.order)
            )
            steps = steps_result.scalars().all()
            if not steps:
                logger.error("No steps found for sequence %s", sequence.id)
                await _reset_campaign_lead(db, campaign_lead)
                return

            current_step_order = campaign_lead.current_step
            current_step = next((step for step in steps if step.order == current_step_order), None)
            if not current_step:
                campaign_lead.status = "completed"
                await db.commit()
                return

            variants_result = await db.execute(select(Variant).where(Variant.step_id == current_step.id))
            variants = variants_result.scalars().all()
            if not variants:
                logger.error("No variants found for step %s", current_step.id)
                await _reset_campaign_lead(db, campaign_lead)
                return

            existing_delivery = await _find_existing_delivery(db, campaign.id, lead.id, current_step.id)
            if existing_delivery:
                if existing_delivery.status == "sending":
                    # Provider send may have already succeeded before a DB failure.
                    existing_delivery.status = "sent"
                    await db.commit()
                variant = await _load_variant(db, existing_delivery.variant_id)
                selected_account = await _load_account(db, existing_delivery.account_id)
                if not variant or not selected_account:
                    logger.error("Cannot recover existing delivery %s", existing_delivery.id)
                    await _reset_campaign_lead(db, campaign_lead, backoff_seconds=300)
                    return
                await _finalize_delivery(
                    db,
                    campaign=campaign,
                    campaign_lead=campaign_lead,
                    lead=lead,
                    steps=steps,
                    current_step_order=current_step_order,
                    variant=variant,
                    selected_account=selected_account,
                    sent_email=existing_delivery,
                )
                return

            variant = ab_splitter.assign_variant(lead_id, campaign_id, variants)
            selected_account = email_sender.select_account(campaign_accounts)
            if not selected_account:
                logger.warning("No available sending account for campaign %s", campaign_id)
                campaign_lead.status = "pending"
                await db.commit()
                return

            sent_email = SentEmail(
                campaign_id=campaign.id,
                lead_id=lead.id,
                account_id=selected_account.id,
                step_id=current_step.id,
                variant_id=variant.id,
                to_email=lead.email,
                from_email=selected_account.email,
                message_id=email_sender.generate_message_id(selected_account.email),
                subject="",
                body="",
                status="sending",
            )
            db.add(sent_email)
            await db.flush()

            tracking_urls = build_tracking_urls(str(sent_email.id), settings.BASE_URL)
            lead_data = {
                "email": lead.email,
                "first_name": lead.first_name or "",
                "last_name": lead.last_name or "",
                "company": lead.company or "",
                "title": lead.title or "",
                "phone": lead.phone or "",
                "linkedin_url": lead.linkedin_url or "",
                "website": lead.website or "",
                "city": lead.city or "",
                "state": lead.state or "",
                "country": lead.country or "",
                "industry": lead.industry or "",
                "custom_fields": lead.custom_fields or {},
                "unsubscribe_link": tracking_urls["unsubscribe_url"],
            }
            rendered_subject, rendered_body = template_engine.render_subject_and_body(
                variant.subject,
                variant.body,
                lead_data,
            )
            tracked_body = post_process_email_body(
                rendered_body,
                str(sent_email.id),
                settings.BASE_URL,
                track_opens=campaign.track_opens,
                track_clicks=campaign.track_clicks,
                click_signing_secret=settings.CLICK_SIGNING_SECRET,
            )
            tracked_body = ensure_unsubscribe_footer(tracked_body, tracking_urls["unsubscribe_url"])
            sent_email.subject = rendered_subject
            sent_email.body = tracked_body
            await db.commit()

            try:
                provider_message_id = await email_sender.send(
                    to=lead.email,
                    subject=rendered_subject,
                    body=tracked_body,
                    account=selected_account,
                    message_id=sent_email.message_id,
                )
            except ConnectionError as exc:
                logger.error("Provider send failed for lead %s: %s", lead_id, str(exc))
                await _mark_delivery_failed(sent_email.id)
                await _recover_campaign_lead(campaign_lead_id, backoff_seconds=180)
                return

            sent_email.message_id = provider_message_id or sent_email.message_id
            sent_email.status = "sent"
            sent_email.sent_at = datetime.now(timezone.utc)
            try:
                await db.commit()
            except Exception as exc:
                await db.rollback()
                logger.error(
                    "Send succeeded but DB commit failed for SentEmail %s: %s",
                    sent_email.id,
                    str(exc),
                )
                await _recover_campaign_lead(campaign_lead_id, backoff_seconds=120)
                return

            await _finalize_delivery(
                db,
                campaign=campaign,
                campaign_lead=campaign_lead,
                lead=lead,
                steps=steps,
                current_step_order=current_step_order,
                variant=variant,
                selected_account=selected_account,
                sent_email=sent_email,
            )
            logger.info(
                "Sent email to %s for campaign %s (step=%d variant=%s)",
                lead.email,
                campaign.name,
                current_step_order,
                variant.name,
            )
        except Exception as exc:
            logger.exception("Unexpected sender error for lead %s: %s", lead_id, str(exc))
            await db.rollback()
            if sent_email:
                await _mark_delivery_failed(sent_email.id)
            await _recover_campaign_lead(campaign_lead_id, backoff_seconds=180)
