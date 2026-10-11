"""Reliability services — retry, circuit breaker, dead letter queue, timeout, idempotency."""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import WorkflowDeadLetterEntry, WorkflowExecutionLog, WorkflowLeadState

logger = logging.getLogger(__name__)


class RetryManager:
    """Manages retry policy for node execution."""

    def should_retry(
        self,
        retry_policy: dict,
        retry_count: int,
        error: str | None = None,
    ) -> tuple[bool, int]:
        """Check if should retry. Returns (should_retry, delay_ms)."""
        if not retry_policy.get("enabled", False):
            return False, 0

        max_attempts = retry_policy.get("max_attempts", 3)
        if retry_count >= max_attempts:
            return False, 0

        strategy = retry_policy.get("backoff_strategy", "exponential")
        base_ms = retry_policy.get("backoff_base_ms", 1000)

        if strategy == "fixed":
            delay_ms = base_ms
        elif strategy == "linear":
            delay_ms = base_ms * (retry_count + 1)
        elif strategy == "exponential":
            delay_ms = base_ms * (2 ** retry_count)
        else:
            delay_ms = base_ms

        # Cap at 5 minutes
        delay_ms = min(delay_ms, 300_000)
        return True, delay_ms


class CircuitBreaker:
    """Redis-backed circuit breaker. Trips after threshold failures, half-opens after cooldown."""

    def __init__(
        self,
        failure_threshold: int = 10,
        window_seconds: int = 3600,
        cooldown_seconds: int = 300,
    ):
        self.failure_threshold = failure_threshold
        self.window_seconds = window_seconds
        self.cooldown_seconds = cooldown_seconds

    def _key(self, workspace_id: uuid.UUID, node_id: str) -> str:
        return f"wuweimail:circuit:{workspace_id}:{node_id}"

    def _trip_key(self, workspace_id: uuid.UUID, node_id: str) -> str:
        return f"wuweimail:circuit:{workspace_id}:{node_id}:tripped"

    def check(self, workspace_id: uuid.UUID, node_id: str) -> bool:
        """Returns True if circuit is CLOSED (OK to proceed). False if OPEN (tripped)."""
        try:
            from app.utils.redis_client import get_redis
            r = get_redis()
            tripped = r.get(self._trip_key(workspace_id, node_id))
            if tripped:
                return False  # Circuit is open
            return True
        except Exception:
            return True  # Fail open

    def record_success(self, workspace_id: uuid.UUID, node_id: str) -> None:
        """Record a success — windowed counting means we don't need explicit resets."""
        pass  # Success doesn't need explicit recording with windowed counting

    def record_failure(self, workspace_id: uuid.UUID, node_id: str) -> None:
        """Record a failure. If threshold exceeded, trip the circuit."""
        try:
            from app.utils.redis_client import get_redis
            r = get_redis()
            key = self._key(workspace_id, node_id)
            count = r.incr(key)
            if count == 1:
                r.expire(key, self.window_seconds)
            if count >= self.failure_threshold:
                r.setex(self._trip_key(workspace_id, node_id), self.cooldown_seconds, "1")
                logger.warning(
                    "Circuit breaker tripped for node %s in workspace %s",
                    node_id,
                    workspace_id,
                )
        except Exception:
            pass  # Best-effort


class DeadLetterService:
    """Manages the dead letter queue for failed workflow leads."""

    async def move_to_dlq(
        self,
        db: AsyncSession,
        state: WorkflowLeadState,
        node_id: str,
        error: str,
        workspace_id: uuid.UUID,
    ) -> WorkflowDeadLetterEntry:
        """Move a failed lead state to the dead letter queue."""
        entry = WorkflowDeadLetterEntry(
            workspace_id=workspace_id,
            workflow_id=state.workflow_id,
            lead_id=state.lead_id,
            lead_state_id=state.id,
            failed_node_id=node_id,
            failure_count=state.retry_count,
            last_error=error,
            context_snapshot=state.context_json,
            status="pending_review",
        )
        db.add(entry)

        state.status = "dead_lettered"
        state.last_error = f"Moved to DLQ: {error}"
        state.next_run_at = None

        await db.flush()
        logger.info("Lead state %s moved to DLQ for node %s", state.id, node_id)
        return entry

    async def retry_from_dlq(
        self,
        db: AsyncSession,
        dlq_id: uuid.UUID,
    ) -> WorkflowLeadState | None:
        """Retry a dead-lettered entry — restore the lead state."""
        result = await db.execute(
            select(WorkflowDeadLetterEntry).where(WorkflowDeadLetterEntry.id == dlq_id)
        )
        entry = result.scalar_one_or_none()
        if not entry or entry.status != "pending_review":
            return None

        # Find and restore the lead state
        state_result = await db.execute(
            select(WorkflowLeadState).where(WorkflowLeadState.id == entry.lead_state_id)
        )
        state = state_result.scalar_one_or_none()
        if not state:
            return None

        state.status = "pending"
        state.next_run_at = datetime.now(timezone.utc)
        state.retry_count = 0
        state.last_retry_at = None

        entry.status = "retried"
        entry.resolved_at = datetime.now(timezone.utc)

        await db.flush()
        return state

    async def discard_dlq_entry(
        self,
        db: AsyncSession,
        dlq_id: uuid.UUID,
    ) -> bool:
        """Discard a dead-lettered entry — mark it as discarded."""
        result = await db.execute(
            select(WorkflowDeadLetterEntry).where(WorkflowDeadLetterEntry.id == dlq_id)
        )
        entry = result.scalar_one_or_none()
        if not entry or entry.status != "pending_review":
            return False

        entry.status = "discarded"
        entry.resolved_at = datetime.now(timezone.utc)
        await db.flush()
        return True


class TimeoutEnforcer:
    """Wraps executor calls with asyncio timeout."""

    async def execute_with_timeout(self, coro, timeout_ms: int):
        """Execute a coroutine with a timeout. Raises asyncio.TimeoutError on timeout."""
        timeout_s = timeout_ms / 1000
        return await asyncio.wait_for(coro, timeout=timeout_s)


# Singletons
retry_manager = RetryManager()
circuit_breaker = CircuitBreaker()
dead_letter_service = DeadLetterService()
timeout_enforcer = TimeoutEnforcer()
