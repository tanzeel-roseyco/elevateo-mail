"""Trigger governance — volume caps, dedupe windows, and rollout gates.

Enforces per-workflow trigger policies before a lead enters a workflow:
- Dedupe window: prevents the same lead from being triggered multiple times
  within the configured window.
- Volume caps: hourly and daily Redis counters that throttle trigger volume.
- Rollout percentage: probabilistic gate for partial rollouts.
"""

from __future__ import annotations

import logging
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import WorkflowLeadState
from app.schemas.workflow import TriggerPolicies

logger = logging.getLogger(__name__)


@dataclass
class TriggerVerdict:
    """Result of a trigger governance check."""
    allowed: bool = True
    reason: str = ""
    details: dict[str, Any] = field(default_factory=dict)


class TriggerGovernor:
    """Evaluates trigger policies before a lead enters a workflow."""

    async def can_trigger(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        workflow_id: uuid.UUID,
        lead_id: uuid.UUID,
        policies: TriggerPolicies,
    ) -> TriggerVerdict:
        """Check all governance rules. Returns TriggerVerdict.

        Checks performed in order:
        1. Dedupe window — was this lead already triggered recently?
        2. Hourly volume cap (Redis)
        3. Daily volume cap (Redis)
        """

        # 1. Dedupe window check
        if policies.dedupe_window_minutes > 0:
            verdict = await self._check_dedupe_window(
                db, workflow_id, lead_id, policies.dedupe_window_minutes,
            )
            if not verdict.allowed:
                return verdict

        # 2. Hourly volume cap
        if policies.volume_cap_per_hour > 0:
            verdict = self._check_volume_cap(
                workspace_id, workflow_id, "hour", policies.volume_cap_per_hour,
            )
            if not verdict.allowed:
                return verdict

        # 3. Daily volume cap
        if policies.volume_cap_per_day > 0:
            verdict = self._check_volume_cap(
                workspace_id, workflow_id, "day", policies.volume_cap_per_day,
            )
            if not verdict.allowed:
                return verdict

        return TriggerVerdict(allowed=True)

    async def _check_dedupe_window(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        lead_id: uuid.UUID,
        window_minutes: int,
    ) -> TriggerVerdict:
        """Check if the lead was already triggered within the dedupe window."""
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        result = await db.execute(
            select(func.count(WorkflowLeadState.id)).where(
                WorkflowLeadState.workflow_id == workflow_id,
                WorkflowLeadState.lead_id == lead_id,
                WorkflowLeadState.updated_at >= cutoff,
            )
        )
        count = result.scalar() or 0
        if count > 0:
            return TriggerVerdict(
                allowed=False,
                reason=f"Lead already triggered within {window_minutes}m dedupe window",
                details={"dedupe_window_minutes": window_minutes, "existing_count": count},
            )
        return TriggerVerdict(allowed=True)

    def _check_volume_cap(
        self,
        workspace_id: uuid.UUID,
        workflow_id: uuid.UUID,
        period: str,
        cap: int,
    ) -> TriggerVerdict:
        """Check Redis-backed volume counter for hourly/daily caps.

        Uses Redis INCR with auto-expiry to track trigger counts.
        Fails open if Redis is unavailable.
        """
        try:
            from app.utils.redis_client import get_redis
            r = get_redis()
        except Exception:
            # Fail open if Redis is unavailable
            logger.warning("Redis unavailable for volume cap check, allowing trigger")
            return TriggerVerdict(allowed=True)

        if period == "hour":
            key = f"wuweimail:trigger_vol:{workspace_id}:{workflow_id}:hour"
            ttl = 3600
        else:
            key = f"wuweimail:trigger_vol:{workspace_id}:{workflow_id}:day"
            ttl = 90_000  # 25h, same pattern as daily send counters

        try:
            current = r.get(key)
            current_count = int(current) if current else 0

            if current_count >= cap:
                return TriggerVerdict(
                    allowed=False,
                    reason=f"Volume cap exceeded: {current_count}/{cap} per {period}",
                    details={"period": period, "current": current_count, "cap": cap},
                )
            return TriggerVerdict(allowed=True)
        except Exception:
            logger.warning("Redis error during volume cap check, allowing trigger")
            return TriggerVerdict(allowed=True)

    def increment_volume_counter(
        self,
        workspace_id: uuid.UUID,
        workflow_id: uuid.UUID,
    ) -> None:
        """Increment both hourly and daily volume counters after a trigger fires.

        Called after a lead successfully enters the workflow.
        """
        try:
            from app.utils.redis_client import get_redis
            r = get_redis()
        except Exception:
            return

        for period, ttl in [("hour", 3600), ("day", 90_000)]:
            key = f"wuweimail:trigger_vol:{workspace_id}:{workflow_id}:{period}"
            try:
                count = r.incr(key)
                if count == 1:
                    r.expire(key, ttl)
            except Exception:
                pass  # Best-effort

    @staticmethod
    def passes_rollout(rollout_percentage: int) -> bool:
        """Check if the trigger passes the rollout percentage gate.

        Args:
            rollout_percentage: 1-100 inclusive. 100 means all leads enter.

        Returns:
            True if the lead should enter the workflow.
        """
        if rollout_percentage >= 100:
            return True
        if rollout_percentage <= 0:
            return False
        return random.randint(1, 100) <= rollout_percentage


# Singleton
trigger_governor = TriggerGovernor()
