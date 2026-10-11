"""Email warmup workers — orchestrator, provider sync, and health recompute.

Replaces the old naive run_warmup_cycle with three dedicated tasks that
integrate with the warmup policy engine, provider adapters, and health scorer.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory
from app.models.email_account import EmailAccount
from app.models.warmup import (
    WarmupAccountState, WarmupProviderLink, WarmupDailyMetric,
    WarmupAction, WarmupProgram, WarmupPhase,
)
from app.services import warmup_health_scorer, warmup_policy_engine
from app.services.warmup_providers.base import WarmupProviderAdapter
from app.services.warmup_providers.mailreach_adapter import MailReachAdapter
from app.services.warmup_providers.noop_adapter import NoopWarmupAdapter
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


def _resolve_adapter(provider_name: str) -> WarmupProviderAdapter:
    """Resolve a warmup adapter by provider name (for Celery tasks without DB context)."""
    if provider_name == "mailreach" and settings.MAILREACH_API_KEY:
        return MailReachAdapter(api_key=settings.MAILREACH_API_KEY)
    if provider_name == "none":
        return NoopWarmupAdapter()
    # Unknown provider or missing key — fall back to noop
    return NoopWarmupAdapter()


# ---------------------------------------------------------------------------
# Task 1: Warmup Orchestrator (every 15 min)
# ---------------------------------------------------------------------------

@celery_app.task(name="app.workers.warmup.warmup_orchestrator")
def warmup_orchestrator():
    """For each enrolled account: compute volume, check guardrails, graduate if ready."""
    if not settings.WARMUP_ENABLED:
        return
    asyncio.run(_warmup_orchestrator_async())


async def _warmup_orchestrator_async():
    async with async_session_factory() as db:
        # Get all active warmup states
        result = await db.execute(
            select(WarmupAccountState).where(
                WarmupAccountState.phase.in_([
                    WarmupPhase.RAMPING, WarmupPhase.STEADY, WarmupPhase.GRADUATING,
                ])
            )
        )
        states = list(result.scalars().all())

        if not states:
            logger.debug("No active warmup accounts")
            return

        for state in states:
            try:
                await _orchestrate_single(db, state)
            except Exception as e:
                logger.exception("Orchestrator error for account_state %s: %s", state.id, e)

        await db.commit()
        logger.info("Warmup orchestrator completed for %d accounts", len(states))


async def _orchestrate_single(db: AsyncSession, state: WarmupAccountState):
    """Run orchestration for a single account."""
    # Get program
    program_result = await db.execute(
        select(WarmupProgram).where(WarmupProgram.id == state.program_id)
    )
    program = program_result.scalar_one_or_none()
    if not program:
        return

    # Get recent metrics
    metrics_result = await db.execute(
        select(WarmupDailyMetric)
        .where(WarmupDailyMetric.account_state_id == state.id)
        .order_by(WarmupDailyMetric.date.desc())
        .limit(14)
    )
    metrics = list(metrics_result.scalars().all())
    metrics.reverse()
    metrics_dicts = [
        {
            "sent": m.sent, "delivered": m.delivered, "opened": m.opened,
            "replied": m.replied, "bounced": m.bounced, "spam_reported": m.spam_reported,
            "inbox_placed": m.inbox_placed, "spam_placed": m.spam_placed,
        }
        for m in metrics
    ]

    # Check safety guardrails → auto-pause
    violations = warmup_policy_engine.check_safety_guardrails(state, program, metrics_dicts)
    if violations:
        state.phase = WarmupPhase.PAUSED
        state.paused_at = datetime.now(timezone.utc)
        state.pause_reason = f"auto-pause: {', '.join(violations)}"

        account = await _get_account(db, state.account_id)
        if account:
            account.warmup_enabled = False

        db.add(WarmupAction(
            workspace_id=state.workspace_id,
            account_state_id=state.id,
            action_type="pause",
            source="system",
            detail={"reason": "auto_pause", "violations": violations},
        ))
        logger.info("Auto-paused account_state %s: %s", state.id, violations)
        return

    # Check graduation
    if warmup_policy_engine.should_graduate(state, metrics_dicts):
        state.phase = WarmupPhase.GRADUATED
        state.graduated_at = datetime.now(timezone.utc)

        account = await _get_account(db, state.account_id)
        if account:
            account.warmup_enabled = False
            account.warmup_level = account.daily_limit

        db.add(WarmupAction(
            workspace_id=state.workspace_id,
            account_state_id=state.id,
            action_type="graduate",
            source="system",
        ))
        logger.info("Graduated account_state %s", state.id)
        return

    # Compute new volume
    new_volume = warmup_policy_engine.compute_daily_volume(state, program, metrics_dicts)
    old_volume = state.current_allowed_volume
    state.current_allowed_volume = new_volume

    # Transition to steady if at target
    if new_volume >= state.target_volume and state.phase == WarmupPhase.RAMPING:
        state.phase = WarmupPhase.STEADY
        state.phase_started_at = datetime.now(timezone.utc)

    # Sync warmup_level to EmailAccount
    effective = warmup_policy_engine.compute_effective_send_limit(None, state)
    account = await _get_account(db, state.account_id)
    if account:
        account.warmup_level = effective

    if new_volume != old_volume:
        logger.info(
            "Account_state %s volume: %d -> %d (phase=%s)",
            state.id, old_volume, new_volume, state.phase,
        )


# ---------------------------------------------------------------------------
# Task 2: Provider Sync (every 5 min)
# ---------------------------------------------------------------------------

@celery_app.task(name="app.workers.warmup.warmup_provider_sync")
def warmup_provider_sync():
    """Fetch status + metrics from external providers and update local state."""
    if not settings.WARMUP_ENABLED:
        return
    asyncio.run(_warmup_provider_sync_async())


async def _warmup_provider_sync_async():
    async with async_session_factory() as db:
        result = await db.execute(
            select(WarmupProviderLink).where(
                WarmupProviderLink.sync_status != "removed"
            )
        )
        links = list(result.scalars().all())

        if not links:
            return

        for link in links:
            try:
                adapter = _resolve_adapter(link.provider_name)

                # Fetch status
                status = await adapter.fetch_status(link.provider_account_id)
                link.provider_status = status.get("status")
                link.provider_metadata = status.get("metadata")

                # Fetch metrics since last sync
                since = link.last_synced_at or (datetime.now(timezone.utc) - timedelta(days=7))
                metrics = await adapter.fetch_metrics(link.provider_account_id, since)

                for m in metrics:
                    await _upsert_daily_metric(db, link, m)

                link.sync_status = "synced"
                link.last_synced_at = datetime.now(timezone.utc)
            except Exception as e:
                link.sync_status = "error"
                logger.warning("Provider sync failed for link %s: %s", link.id, e)

        await db.commit()
        logger.info("Provider sync completed for %d links", len(links))


async def _upsert_daily_metric(
    db: AsyncSession, link: WarmupProviderLink, metric_data: dict
):
    """Insert or update a daily metric row."""
    from datetime import date as date_type
    metric_date = metric_data.get("date")
    if isinstance(metric_date, str):
        metric_date = date_type.fromisoformat(metric_date)

    existing = await db.execute(
        select(WarmupDailyMetric).where(
            WarmupDailyMetric.account_state_id == link.account_state_id,
            WarmupDailyMetric.date == metric_date,
        )
    )
    row = existing.scalar_one_or_none()

    if row:
        for field in ("sent", "delivered", "opened", "replied", "bounced", "spam_reported", "inbox_placed", "spam_placed"):
            setattr(row, field, metric_data.get(field, 0))
    else:
        # Get workspace_id from the link
        row = WarmupDailyMetric(
            workspace_id=link.workspace_id,
            account_state_id=link.account_state_id,
            date=metric_date,
            sent=metric_data.get("sent", 0),
            delivered=metric_data.get("delivered", 0),
            opened=metric_data.get("opened", 0),
            replied=metric_data.get("replied", 0),
            bounced=metric_data.get("bounced", 0),
            spam_reported=metric_data.get("spam_reported", 0),
            inbox_placed=metric_data.get("inbox_placed", 0),
            spam_placed=metric_data.get("spam_placed", 0),
        )
        db.add(row)


# ---------------------------------------------------------------------------
# Task 3: Health Recompute (every hour)
# ---------------------------------------------------------------------------

@celery_app.task(name="app.workers.warmup.warmup_health_recompute")
def warmup_health_recompute():
    """Recompute blended health scores from last 7 days of metrics."""
    if not settings.WARMUP_ENABLED:
        return
    asyncio.run(_warmup_health_recompute_async())


async def _warmup_health_recompute_async():
    async with async_session_factory() as db:
        result = await db.execute(
            select(WarmupAccountState).where(
                WarmupAccountState.phase.notin_([WarmupPhase.GRADUATED])
            )
        )
        states = list(result.scalars().all())

        for state in states:
            try:
                metrics_result = await db.execute(
                    select(WarmupDailyMetric)
                    .where(WarmupDailyMetric.account_state_id == state.id)
                    .order_by(WarmupDailyMetric.date.desc())
                    .limit(7)
                )
                metrics = list(metrics_result.scalars().all())
                metrics.reverse()

                metrics_dicts = [
                    {
                        "sent": m.sent, "delivered": m.delivered, "opened": m.opened,
                        "replied": m.replied, "bounced": m.bounced, "spam_reported": m.spam_reported,
                        "inbox_placed": m.inbox_placed, "spam_placed": m.spam_placed,
                    }
                    for m in metrics
                ]

                health = warmup_health_scorer.compute(metrics_dicts)
                state.warmup_health_score = health

                placement = warmup_health_scorer.compute_placement_rate(metrics_dicts)
                state.inbox_placement_rate = placement

                # Also update EmailAccount.health_score
                account = await _get_account(db, state.account_id)
                if account:
                    account.health_score = health

            except Exception as e:
                logger.warning("Health recompute error for state %s: %s", state.id, e)

        await db.commit()
        logger.info("Health recompute completed for %d accounts", len(states))


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

async def _get_account(db: AsyncSession, account_id) -> EmailAccount | None:
    result = await db.execute(
        select(EmailAccount).where(EmailAccount.id == account_id)
    )
    return result.scalar_one_or_none()
