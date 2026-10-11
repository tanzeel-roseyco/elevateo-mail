"""Email event processor worker — handles opens, clicks, bounces, replies, unsubscribes."""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.exc import OperationalError

from app.config import get_settings
from app.database import async_session_factory
from app.models.campaign import Campaign, CampaignLead
from app.models.lead import Lead
from app.models.email_account import EmailAccount
from app.models.email_event import EmailEvent
from app.models.sent_email import SentEmail
from app.models.variant import Variant
from app.models.suppression import Suppression
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()

# Health score adjustment amounts
BOUNCE_HEALTH_PENALTY = 0.05  # reduce health by 5% per bounce
REPLY_HEALTH_BONUS = 0.01  # increase health by 1% per reply (positive engagement signal)


@celery_app.task(name="app.workers.event_processor.process_events")
def process_events():
    """Process unprocessed email events from the last 5 minutes."""
    asyncio.run(_process_events_async())


async def _process_events_async():
    async with async_session_factory() as db:
        # Only fetch events that haven't been processed yet (idempotent)
        result = await db.execute(
            select(EmailEvent)
            .where(EmailEvent.processed_at.is_(None))
            .order_by(EmailEvent.occurred_at)
            .limit(500)
        )
        events = result.scalars().all()

        if not events:
            logger.debug("No unprocessed events")
            return

        # Transient exceptions — leave event unprocessed so next cycle retries
        _TRANSIENT_ERRORS = (ConnectionError, TimeoutError, OperationalError, OSError)

        processed = 0
        skipped_transient = 0
        for event in events:
            try:
                await _handle_event(db, event)
                # Mark as processed (idempotency key)
                event.processed_at = datetime.now(timezone.utc)
                processed += 1
            except _TRANSIENT_ERRORS as e:
                # Transient failure — leave unprocessed for next processing cycle
                logger.warning(
                    "Transient error processing event %s (type=%s), will retry: %s",
                    event.id, event.event_type, str(e),
                )
                skipped_transient += 1
                # Expunge to prevent SQLAlchemy from flushing partial state
                await db.rollback()
                # Re-fetch remaining events after rollback
                break
            except Exception as e:
                logger.exception(
                    "Permanent error processing event %s (type=%s), marking processed: %s",
                    event.id, event.event_type, str(e),
                )
                # Mark as processed to prevent poison-pill infinite loops
                event.processed_at = datetime.now(timezone.utc)

        await db.commit()
        if skipped_transient:
            logger.info(
                "Processed %d/%d events (%d deferred due to transient errors)",
                processed, len(events), skipped_transient,
            )
        else:
            logger.info("Processed %d/%d events", processed, len(events))


async def _handle_event(db: AsyncSession, event: EmailEvent):
    """Route a single event to the appropriate handler."""
    # Fetch the related SentEmail record
    sent_result = await db.execute(
        select(SentEmail).where(SentEmail.id == event.sent_email_id)
    )
    sent_email = sent_result.scalar_one_or_none()
    if not sent_email:
        logger.warning("SentEmail %s not found for event %s", event.sent_email_id, event.id)
        return

    if event.event_type == "bounce":
        await _handle_bounce(db, event, sent_email)
    elif event.event_type == "reply":
        await _handle_reply(db, event, sent_email)
    elif event.event_type == "open":
        await _handle_open(db, event, sent_email)
    elif event.event_type == "click":
        await _handle_click(db, event, sent_email)
    elif event.event_type == "unsubscribe":
        await _handle_unsubscribe(db, event, sent_email)
    else:
        logger.warning("Unknown event type '%s' for event %s", event.event_type, event.id)


async def _handle_bounce(db: AsyncSession, event: EmailEvent, sent_email: SentEmail):
    """Handle a bounce event: update variant, lead, account health, and suppress future sends."""
    # Update variant bounce_count
    if sent_email.variant_id:
        variant_result = await db.execute(
            select(Variant).where(Variant.id == sent_email.variant_id)
        )
        variant = variant_result.scalar_one_or_none()
        if variant:
            variant.bounce_count += 1

    # Update lead status to bounced
    lead_result = await db.execute(
        select(Lead).where(Lead.id == sent_email.lead_id)
    )
    lead = lead_result.scalar_one_or_none()
    if lead:
        lead.status = "bounced"

    # Reduce account health_score
    account_result = await db.execute(
        select(EmailAccount).where(EmailAccount.id == sent_email.account_id)
    )
    account = account_result.scalar_one_or_none()
    if account:
        account.health_score = max(0.0, account.health_score - BOUNCE_HEALTH_PENALTY)

    # Update sent_email status
    sent_email.status = "bounced"

    # Add to suppression list so scheduler never picks this lead again
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == sent_email.campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign:
        existing_sup = await db.execute(
            select(Suppression).where(
                Suppression.workspace_id == campaign.workspace_id,
                Suppression.email == sent_email.to_email.lower(),
            )
        )
        if not existing_sup.scalar_one_or_none():
            db.add(Suppression(
                workspace_id=campaign.workspace_id,
                email=sent_email.to_email.lower(),
                reason="bounce",
                source=campaign.name,
            ))

    # Stop sequence for this lead in this campaign
    cl_result = await db.execute(
        select(CampaignLead).where(
            CampaignLead.campaign_id == sent_email.campaign_id,
            CampaignLead.lead_id == sent_email.lead_id,
        )
    )
    campaign_lead = cl_result.scalar_one_or_none()
    if campaign_lead:
        campaign_lead.status = "bounced"
        campaign_lead.next_send_at = None

    # Log bounce to warmup timeline if account is enrolled
    try:
        from app.models.warmup import WarmupAccountState, WarmupAction
        warmup_result = await db.execute(
            select(WarmupAccountState).where(
                WarmupAccountState.account_id == sent_email.account_id,
            )
        )
        warmup_state = warmup_result.scalar_one_or_none()
        if warmup_state:
            db.add(WarmupAction(
                workspace_id=warmup_state.workspace_id,
                account_state_id=warmup_state.id,
                action_type="bounce_received",
                source="system",
                detail={"lead_id": str(sent_email.lead_id), "to_email": sent_email.to_email},
            ))
    except Exception:
        pass  # Soft integration — don't fail event processing if warmup logging fails

    # Notify workflow event bus
    try:
        from app.services.workflow.event_bus import workflow_event_bus
        await workflow_event_bus.on_email_bounce(
            db=db,
            workspace_id=campaign.workspace_id if campaign else None,
            lead_id=sent_email.lead_id,
            campaign_id=sent_email.campaign_id,
        )
    except Exception:
        pass  # Don't fail event processing if workflow bus fails

    logger.info(
        "Bounce processed: lead=%s, account=%s, suppressed=%s",
        sent_email.lead_id, sent_email.account_id, sent_email.to_email,
    )


async def _handle_reply(db: AsyncSession, event: EmailEvent, sent_email: SentEmail):
    """Handle a reply event: update variant and optionally stop sequence.

    Auto-replies (is_auto_reply=True in event metadata) are treated differently:
    - Only stop the sequence if campaign.stop_on_auto_reply is True
    - Do not update lead status to "replied" for auto-replies
    - Still boost account health (any reply is a deliverability signal)
    """
    metadata = event.metadata_ or {}
    is_auto_reply = metadata.get("is_auto_reply", False)

    # Update variant reply_count (count all replies including auto)
    if sent_email.variant_id:
        variant_result = await db.execute(
            select(Variant).where(Variant.id == sent_email.variant_id)
        )
        variant = variant_result.scalar_one_or_none()
        if variant:
            variant.reply_count += 1

    # Check campaign stop settings
    campaign = None
    if sent_email.campaign_id:
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == sent_email.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()

    # Determine whether to stop sequence based on reply type
    should_stop = False
    if campaign:
        if is_auto_reply and campaign.stop_on_auto_reply:
            should_stop = True
        elif not is_auto_reply and campaign.stop_on_reply:
            should_stop = True

    if should_stop:
        cl_result = await db.execute(
            select(CampaignLead).where(
                CampaignLead.campaign_id == sent_email.campaign_id,
                CampaignLead.lead_id == sent_email.lead_id,
            )
        )
        campaign_lead = cl_result.scalar_one_or_none()
        if campaign_lead:
            campaign_lead.status = "replied"
            campaign_lead.next_send_at = None

    # Update lead status only for real (non-auto) replies
    if not is_auto_reply:
        lead_result = await db.execute(
            select(Lead).where(Lead.id == sent_email.lead_id)
        )
        lead = lead_result.scalar_one_or_none()
        if lead:
            lead.status = "replied"

    # Boost account health — any reply (including auto) is a deliverability signal
    account_result = await db.execute(
        select(EmailAccount).where(EmailAccount.id == sent_email.account_id)
    )
    account = account_result.scalar_one_or_none()
    if account:
        account.health_score = min(1.0, account.health_score + REPLY_HEALTH_BONUS)

    # Notify workflow event bus
    try:
        from app.services.workflow.event_bus import workflow_event_bus
        ws_id = campaign.workspace_id if campaign else None
        if ws_id:
            await workflow_event_bus.on_email_reply(
                db=db,
                workspace_id=ws_id,
                lead_id=sent_email.lead_id,
                campaign_id=sent_email.campaign_id,
            )
    except Exception:
        pass  # Don't fail event processing if workflow bus fails

    logger.info(
        "Reply processed: lead=%s, campaign=%s, auto_reply=%s",
        sent_email.lead_id, sent_email.campaign_id, is_auto_reply,
    )


async def _handle_open(db: AsyncSession, event: EmailEvent, sent_email: SentEmail):
    """Handle an open event: update variant open_count."""
    if sent_email.variant_id:
        variant_result = await db.execute(
            select(Variant).where(Variant.id == sent_email.variant_id)
        )
        variant = variant_result.scalar_one_or_none()
        if variant:
            variant.open_count += 1

    # Notify workflow event bus
    try:
        from app.services.workflow.event_bus import workflow_event_bus
        from app.models.campaign import Campaign
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == sent_email.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if campaign:
            await workflow_event_bus.on_email_open(
                db=db,
                workspace_id=campaign.workspace_id,
                lead_id=sent_email.lead_id,
                campaign_id=sent_email.campaign_id,
            )
    except Exception:
        pass

    logger.debug("Open processed: sent_email=%s", sent_email.id)


async def _handle_click(db: AsyncSession, event: EmailEvent, sent_email: SentEmail):
    """Handle a click event: update variant click_count."""
    if sent_email.variant_id:
        variant_result = await db.execute(
            select(Variant).where(Variant.id == sent_email.variant_id)
        )
        variant = variant_result.scalar_one_or_none()
        if variant:
            variant.click_count += 1

    # Notify workflow event bus
    try:
        from app.services.workflow.event_bus import workflow_event_bus
        from app.models.campaign import Campaign
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == sent_email.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if campaign:
            await workflow_event_bus.on_email_click(
                db=db,
                workspace_id=campaign.workspace_id,
                lead_id=sent_email.lead_id,
                campaign_id=sent_email.campaign_id,
            )
    except Exception:
        pass

    logger.debug("Click processed: sent_email=%s", sent_email.id)


async def _handle_unsubscribe(db: AsyncSession, event: EmailEvent, sent_email: SentEmail):
    """Handle an unsubscribe event: add to suppression list and update lead."""
    # Fetch campaign for workspace_id
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == sent_email.campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        logger.warning("Campaign %s not found for unsubscribe event", sent_email.campaign_id)
        return

    # Add to suppression list (idempotent — skip if already exists)
    existing_sup = await db.execute(
        select(Suppression).where(
            Suppression.workspace_id == campaign.workspace_id,
            Suppression.email == sent_email.to_email.lower(),
        )
    )
    if not existing_sup.scalar_one_or_none():
        db.add(Suppression(
            workspace_id=campaign.workspace_id,
            email=sent_email.to_email.lower(),
            reason="unsubscribe",
            source=campaign.name,
        ))

    # Update lead status
    lead_result = await db.execute(
        select(Lead).where(Lead.id == sent_email.lead_id)
    )
    lead = lead_result.scalar_one_or_none()
    if lead:
        lead.status = "unsubscribed"

    # Stop the sequence for this lead
    cl_result = await db.execute(
        select(CampaignLead).where(
            CampaignLead.campaign_id == sent_email.campaign_id,
            CampaignLead.lead_id == sent_email.lead_id,
        )
    )
    campaign_lead = cl_result.scalar_one_or_none()
    if campaign_lead:
        campaign_lead.status = "unsubscribed"
        campaign_lead.next_send_at = None

    logger.info(
        "Unsubscribe processed: lead=%s, email=%s",
        sent_email.lead_id, sent_email.to_email,
    )
