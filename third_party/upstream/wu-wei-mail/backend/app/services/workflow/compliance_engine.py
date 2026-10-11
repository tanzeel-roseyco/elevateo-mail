"""Compliance engine — centralized enforcement middleware for workflow runtime.

Check pipeline (first denial wins):
1. Suppression list — HARD BLOCK
2. Stop-on-reply — HARD BLOCK
3. Quiet hours — SOFT DEFER
4. Channel cooldown — SOFT DEFER
5. Contact pressure (max touches per 7d/30d) — SOFT DEFER
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import ContactTouch, FrequencyControlConfig
from app.models.suppression import Suppression
from app.models.workflow import OutreachEvent

logger = logging.getLogger(__name__)

# Node types that require compliance checks (outreach nodes only)
OUTREACH_NODE_TYPES = {"email_send", "linkedin_connect", "linkedin_message", "auto_respond"}


@dataclass
class ComplianceVerdict:
    allowed: bool
    reason: str = ""
    defer_until: Optional[datetime] = None


def node_type_to_channel(node_type: str) -> str:
    if node_type in ("email_send", "auto_respond"):
        return "email"
    if node_type in ("linkedin_connect", "linkedin_message"):
        return "linkedin"
    return "internal"


class ComplianceEngine:

    async def evaluate(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_id: uuid.UUID,
        lead_email: str,
        node_type: str,
        channel: str,
        context: dict | None = None,
    ) -> ComplianceVerdict:
        """Run the compliance check pipeline. First denial wins."""

        # Only outreach nodes need compliance
        if node_type not in OUTREACH_NODE_TYPES:
            return ComplianceVerdict(allowed=True)

        # 1. Suppression list
        verdict = await self._check_suppression(db, workspace_id, lead_email)
        if not verdict.allowed:
            return verdict

        # 2. Stop-on-reply
        verdict = await self._check_stop_on_reply(db, workspace_id, lead_id)
        if not verdict.allowed:
            return verdict

        # 3. Quiet hours
        verdict = await self._check_quiet_hours(db, workspace_id)
        if not verdict.allowed:
            return verdict

        # 4. Channel cooldown
        verdict = await self._check_channel_cooldown(db, workspace_id, lead_id, channel)
        if not verdict.allowed:
            return verdict

        # 5. Contact pressure
        verdict = await self._check_contact_pressure(db, workspace_id, lead_id)
        if not verdict.allowed:
            return verdict

        return ComplianceVerdict(allowed=True)

    async def _check_suppression(self, db, workspace_id, lead_email) -> ComplianceVerdict:
        result = await db.execute(
            select(func.count()).where(
                Suppression.workspace_id == workspace_id,
                Suppression.email == lead_email.lower(),
            )
        )
        count = result.scalar() or 0
        if count > 0:
            return ComplianceVerdict(allowed=False, reason="Email is on suppression list")
        return ComplianceVerdict(allowed=True)

    async def _check_stop_on_reply(self, db, workspace_id, lead_id) -> ComplianceVerdict:
        result = await db.execute(
            select(func.count()).where(
                OutreachEvent.workspace_id == workspace_id,
                OutreachEvent.lead_id == lead_id,
                OutreachEvent.event_type == "email_reply",
            )
        )
        count = result.scalar() or 0
        if count > 0:
            return ComplianceVerdict(allowed=False, reason="Lead has already replied")
        return ComplianceVerdict(allowed=True)

    async def _check_quiet_hours(self, db, workspace_id) -> ComplianceVerdict:
        """Check workspace quiet hours. Returns defer verdict if in quiet period."""
        try:
            from app.models.workspace import Workspace
            result = await db.execute(
                select(Workspace).where(Workspace.id == workspace_id)
            )
            workspace = result.scalar_one_or_none()
            if not workspace:
                return ComplianceVerdict(allowed=True)

            quiet_start = getattr(workspace, "quiet_hours_start", None)
            quiet_end = getattr(workspace, "quiet_hours_end", None)

            if quiet_start is None or quiet_end is None:
                return ComplianceVerdict(allowed=True)

            tz_name = getattr(workspace, "timezone", "UTC") or "UTC"
            try:
                tz = ZoneInfo(tz_name)
            except (KeyError, ValueError):
                tz = ZoneInfo("UTC")

            local_now = datetime.now(tz)
            current_hour = local_now.hour

            if quiet_start <= quiet_end:
                in_quiet = quiet_start <= current_hour < quiet_end
            else:
                in_quiet = current_hour >= quiet_start or current_hour < quiet_end

            if in_quiet:
                if quiet_start <= quiet_end:
                    resume_hour = quiet_end
                else:
                    resume_hour = quiet_end
                tomorrow = local_now.replace(hour=resume_hour, minute=0, second=0, microsecond=0)
                if tomorrow <= local_now:
                    tomorrow += timedelta(days=1)
                defer_until = tomorrow.astimezone(timezone.utc)
                return ComplianceVerdict(
                    allowed=False, reason=f"Quiet hours ({quiet_start}:00-{quiet_end}:00)", defer_until=defer_until
                )
        except Exception as e:
            logger.warning("Quiet hours check failed: %s", e)

        return ComplianceVerdict(allowed=True)

    async def _check_channel_cooldown(self, db, workspace_id, lead_id, channel) -> ComplianceVerdict:
        result = await db.execute(
            select(FrequencyControlConfig).where(FrequencyControlConfig.workspace_id == workspace_id)
        )
        config = result.scalar_one_or_none()
        if not config or not config.min_channel_gap_hours:
            return ComplianceVerdict(allowed=True)

        gap_hours = config.min_channel_gap_hours
        other_channel = "linkedin" if channel == "email" else "email"
        gap_key = f"{other_channel}_to_{channel}"
        min_gap = gap_hours.get(gap_key, 0)

        if min_gap <= 0:
            return ComplianceVerdict(allowed=True)

        since = datetime.now(timezone.utc) - timedelta(hours=min_gap)
        count_result = await db.execute(
            select(func.count()).where(
                ContactTouch.workspace_id == workspace_id,
                ContactTouch.lead_id == lead_id,
                ContactTouch.channel == other_channel,
                ContactTouch.touched_at >= since,
            )
        )
        count = count_result.scalar() or 0
        if count > 0:
            defer_until = datetime.now(timezone.utc) + timedelta(hours=min_gap)
            return ComplianceVerdict(
                allowed=False, reason=f"Channel cooldown: {min_gap}h gap after {other_channel}", defer_until=defer_until
            )
        return ComplianceVerdict(allowed=True)

    async def _check_contact_pressure(self, db, workspace_id, lead_id) -> ComplianceVerdict:
        result = await db.execute(
            select(FrequencyControlConfig).where(FrequencyControlConfig.workspace_id == workspace_id)
        )
        config = result.scalar_one_or_none()
        if not config:
            return ComplianceVerdict(allowed=True)

        now = datetime.now(timezone.utc)

        # 7-day check
        since_7d = now - timedelta(days=7)
        count_7d = (await db.execute(
            select(func.count()).where(
                ContactTouch.workspace_id == workspace_id,
                ContactTouch.lead_id == lead_id,
                ContactTouch.touched_at >= since_7d,
            )
        )).scalar() or 0

        if count_7d >= config.max_touches_per_7d:
            defer_until = now + timedelta(days=1)
            return ComplianceVerdict(
                allowed=False, reason=f"Contact pressure: {count_7d}/{config.max_touches_per_7d} touches in 7d", defer_until=defer_until
            )

        # 30-day check
        since_30d = now - timedelta(days=30)
        count_30d = (await db.execute(
            select(func.count()).where(
                ContactTouch.workspace_id == workspace_id,
                ContactTouch.lead_id == lead_id,
                ContactTouch.touched_at >= since_30d,
            )
        )).scalar() or 0

        if count_30d >= config.max_touches_per_30d:
            defer_until = now + timedelta(days=7)
            return ComplianceVerdict(
                allowed=False, reason=f"Contact pressure: {count_30d}/{config.max_touches_per_30d} touches in 30d", defer_until=defer_until
            )

        return ComplianceVerdict(allowed=True)

    async def record_touch(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_id: uuid.UUID,
        channel: str,
        touch_type: str,
        workflow_id: uuid.UUID | None = None,
        campaign_id: uuid.UUID | None = None,
        node_id: str | None = None,
    ) -> None:
        touch = ContactTouch(
            workspace_id=workspace_id,
            lead_id=lead_id,
            channel=channel,
            touch_type=touch_type,
            workflow_id=workflow_id,
            campaign_id=campaign_id,
            node_id=node_id,
        )
        db.add(touch)
        await db.flush()


compliance_engine = ComplianceEngine()
