"""Campaign scheduler — runs periodically, enqueues leads due for sending."""

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory
from app.models.campaign import Campaign, CampaignLead, CampaignAccount
from app.models.email_account import EmailAccount
from app.models.lead import Lead
from app.models.suppression import Suppression
from app.utils.redis_client import get_campaign_sent_today, reset_all_daily_counters
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

settings = get_settings()


@celery_app.task(name="app.workers.scheduler.run_scheduler")
def run_scheduler():
    """Find leads due for sending and enqueue send tasks."""
    asyncio.run(_run_scheduler_async())


async def _run_scheduler_async():
    async with async_session_factory() as db:
        now = datetime.now(timezone.utc)

        # Find active campaigns (skip workflow-mode campaigns — they use the workflow engine)
        result = await db.execute(
            select(Campaign).where(
                Campaign.status == "active",
                Campaign.execution_mode != "workflow",
            )
        )
        campaigns = result.scalars().all()

        for campaign in campaigns:
            # Check schedule in the campaign's timezone
            day_map = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
            try:
                campaign_tz = ZoneInfo(campaign.timezone or "UTC")
            except (KeyError, ValueError):
                campaign_tz = ZoneInfo("UTC")

            local_now = now.astimezone(campaign_tz)
            current_day = local_now.weekday()
            if campaign.send_days:
                day_name = [k for k, v in day_map.items() if v == current_day]
                if day_name and not campaign.send_days.get(day_name[0], False):
                    continue

            current_hour = local_now.hour
            if current_hour < campaign.send_start_hour or current_hour >= campaign.send_end_hour:
                continue

            # Find leads due for sending with row locking to prevent double-enqueue
            leads_result = await db.execute(
                select(CampaignLead).where(
                    CampaignLead.campaign_id == campaign.id,
                    CampaignLead.status == "pending",
                    CampaignLead.next_send_at <= now,
                ).with_for_update(skip_locked=True)
            )
            due_leads = leads_result.scalars().all()

            # Check daily limit via Redis atomic counter
            sent_today = get_campaign_sent_today(str(campaign.id))
            remaining = campaign.daily_limit - sent_today
            if remaining <= 0:
                logger.debug(
                    "Campaign %s hit daily limit (%d/%d), skipping",
                    campaign.name, sent_today, campaign.daily_limit,
                )
                continue

            # Build suppression set for this workspace (once per campaign)
            sup_result = await db.execute(
                select(Suppression.email).where(
                    Suppression.workspace_id == campaign.workspace_id,
                )
            )
            suppressed_emails = {row[0].lower() for row in sup_result.all()}

            for cl in due_leads[:remaining]:
                # Fetch lead email to check against suppression list
                lead_result = await db.execute(
                    select(Lead.email).where(Lead.id == cl.lead_id)
                )
                lead_row = lead_result.first()
                if not lead_row:
                    logger.warning("Lead %s not found, skipping", cl.lead_id)
                    continue

                lead_email = lead_row[0].lower()

                # Skip suppressed leads
                if lead_email in suppressed_emails:
                    logger.info(
                        "Skipping suppressed lead %s (%s) for campaign %s",
                        cl.lead_id, lead_email, campaign.name,
                    )
                    continue

                # Enqueue send task
                from app.workers.sender import send_email_task
                send_email_task.delay(
                    campaign_id=str(campaign.id),
                    campaign_lead_id=str(cl.id),
                    lead_id=str(cl.lead_id),
                )

                # Update status
                cl.status = "in_sequence"
                await db.flush()

        await db.commit()


@celery_app.task(name="app.workers.scheduler.reset_daily_counts")
def reset_daily_counts():
    """Reset sent_today counters on all email accounts. Runs at midnight UTC."""
    asyncio.run(_reset_daily_counts_async())


async def _reset_daily_counts_async():
    # Reset Redis atomic counters (primary source of truth)
    reset_all_daily_counters()

    # Also reset DB column as a fallback display value
    async with async_session_factory() as db:
        await db.execute(
            update(EmailAccount).values(sent_today=0)
        )
        await db.commit()
    logger.info("Daily send counters reset")
