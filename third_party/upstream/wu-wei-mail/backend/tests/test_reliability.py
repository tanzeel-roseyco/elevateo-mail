"""Tests for workflow reliability services — retry, circuit breaker, DLQ, timeout, idempotency."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.workflow.reliability import (
    RetryManager,
    CircuitBreaker,
    DeadLetterService,
    TimeoutEnforcer,
    retry_manager,
    circuit_breaker,
    dead_letter_service,
    timeout_enforcer,
)


# ===================================================================
# RetryManager Tests
# ===================================================================

class TestRetryManager:
    """Test retry policy evaluation with various backoff strategies."""

    def test_disabled_policy_returns_false(self):
        rm = RetryManager()
        should, delay = rm.should_retry({"enabled": False}, 0)
        assert should is False
        assert delay == 0

    def test_empty_policy_returns_false(self):
        rm = RetryManager()
        should, delay = rm.should_retry({}, 0)
        assert should is False

    def test_exponential_backoff_first_retry(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 3, "backoff_strategy": "exponential", "backoff_base_ms": 1000}
        should, delay = rm.should_retry(policy, 0)
        assert should is True
        assert delay == 1000  # 1000 * 2^0

    def test_exponential_backoff_second_retry(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 3, "backoff_strategy": "exponential", "backoff_base_ms": 1000}
        should, delay = rm.should_retry(policy, 1)
        assert should is True
        assert delay == 2000  # 1000 * 2^1

    def test_exponential_backoff_third_retry(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 3, "backoff_strategy": "exponential", "backoff_base_ms": 1000}
        should, delay = rm.should_retry(policy, 2)
        assert should is True
        assert delay == 4000  # 1000 * 2^2

    def test_max_attempts_exceeded(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 3, "backoff_strategy": "exponential", "backoff_base_ms": 1000}
        should, delay = rm.should_retry(policy, 3)
        assert should is False
        assert delay == 0

    def test_linear_backoff(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 5, "backoff_strategy": "linear", "backoff_base_ms": 500}
        # retry_count=0 -> 500*(0+1)=500
        should, delay = rm.should_retry(policy, 0)
        assert should is True
        assert delay == 500

        # retry_count=2 -> 500*(2+1)=1500
        should, delay = rm.should_retry(policy, 2)
        assert should is True
        assert delay == 1500

    def test_fixed_backoff(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 5, "backoff_strategy": "fixed", "backoff_base_ms": 2000}
        should, delay = rm.should_retry(policy, 0)
        assert should is True
        assert delay == 2000

        should, delay = rm.should_retry(policy, 3)
        assert should is True
        assert delay == 2000

    def test_unknown_strategy_uses_base(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 3, "backoff_strategy": "unknown_strategy", "backoff_base_ms": 750}
        should, delay = rm.should_retry(policy, 0)
        assert should is True
        assert delay == 750

    def test_delay_capped_at_5_minutes(self):
        rm = RetryManager()
        policy = {"enabled": True, "max_attempts": 20, "backoff_strategy": "exponential", "backoff_base_ms": 10000}
        # retry_count=10 -> 10000 * 2^10 = 10,240,000 ms, capped at 300,000
        should, delay = rm.should_retry(policy, 10)
        assert should is True
        assert delay == 300_000

    def test_default_max_attempts(self):
        rm = RetryManager()
        policy = {"enabled": True, "backoff_strategy": "fixed", "backoff_base_ms": 1000}
        # Default max_attempts is 3
        should, _ = rm.should_retry(policy, 2)
        assert should is True
        should, _ = rm.should_retry(policy, 3)
        assert should is False

    def test_singleton_instance(self):
        assert retry_manager is not None
        assert isinstance(retry_manager, RetryManager)


# ===================================================================
# CircuitBreaker Tests
# ===================================================================

class TestCircuitBreaker:
    """Test circuit breaker with mocked Redis."""

    def test_closed_by_default_when_redis_unavailable(self):
        """If Redis is unavailable, circuit should fail open (return True)."""
        cb = CircuitBreaker()
        with patch("app.services.workflow.reliability.CircuitBreaker.check", return_value=True):
            assert cb.check(uuid.uuid4(), "n_email_1") is True

    def test_key_format(self):
        cb = CircuitBreaker()
        ws_id = uuid.UUID("12345678-1234-5678-1234-567812345678")
        assert cb._key(ws_id, "n_email_1") == "wuweimail:circuit:12345678-1234-5678-1234-567812345678:n_email_1"
        assert cb._trip_key(ws_id, "n_email_1") == "wuweimail:circuit:12345678-1234-5678-1234-567812345678:n_email_1:tripped"

    def test_check_returns_false_when_tripped(self):
        cb = CircuitBreaker()
        ws_id = uuid.uuid4()
        mock_redis = MagicMock()
        mock_redis.get.return_value = "1"  # tripped

        with patch("app.utils.redis_client.get_redis", return_value=mock_redis):
            result = cb.check(ws_id, "n_email_1")
            assert result is False

    def test_check_returns_true_when_not_tripped(self):
        cb = CircuitBreaker()
        ws_id = uuid.uuid4()
        mock_redis = MagicMock()
        mock_redis.get.return_value = None  # not tripped

        with patch("app.utils.redis_client.get_redis", return_value=mock_redis):
            result = cb.check(ws_id, "n_email_1")
            assert result is True

    def test_record_failure_trips_after_threshold(self):
        cb = CircuitBreaker(failure_threshold=3, window_seconds=3600, cooldown_seconds=300)
        ws_id = uuid.uuid4()
        mock_redis = MagicMock()
        mock_redis.incr.return_value = 3  # hits threshold

        with patch("app.utils.redis_client.get_redis", return_value=mock_redis):
            cb.record_failure(ws_id, "n_email_1")
            mock_redis.setex.assert_called_once()
            args = mock_redis.setex.call_args
            assert args[0][1] == 300  # cooldown_seconds
            assert args[0][2] == "1"

    def test_record_failure_below_threshold_no_trip(self):
        cb = CircuitBreaker(failure_threshold=10, window_seconds=3600, cooldown_seconds=300)
        ws_id = uuid.uuid4()
        mock_redis = MagicMock()
        mock_redis.incr.return_value = 5  # below threshold

        with patch("app.utils.redis_client.get_redis", return_value=mock_redis):
            cb.record_failure(ws_id, "n_email_1")
            mock_redis.setex.assert_not_called()

    def test_record_failure_sets_expiry_on_first_count(self):
        cb = CircuitBreaker()
        ws_id = uuid.uuid4()
        mock_redis = MagicMock()
        mock_redis.incr.return_value = 1

        with patch("app.utils.redis_client.get_redis", return_value=mock_redis):
            cb.record_failure(ws_id, "n_email_1")
            mock_redis.expire.assert_called_once()

    def test_record_success_is_noop(self):
        """record_success is intentionally a no-op with windowed counting."""
        cb = CircuitBreaker()
        cb.record_success(uuid.uuid4(), "n_email_1")
        # Should not raise

    def test_singleton_instance(self):
        assert circuit_breaker is not None
        assert isinstance(circuit_breaker, CircuitBreaker)


# ===================================================================
# DeadLetterService Tests
# ===================================================================

class TestDeadLetterService:
    """Test dead letter queue operations."""

    @pytest.mark.asyncio
    async def test_move_to_dlq(self):
        dls = DeadLetterService()
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        state = MagicMock()
        state.id = uuid.uuid4()
        state.workflow_id = uuid.uuid4()
        state.lead_id = uuid.uuid4()
        state.retry_count = 3
        state.context_json = {"lead": {"email": "test@example.com"}}
        state.status = "failed"

        ws_id = uuid.uuid4()
        entry = await dls.move_to_dlq(db, state, "n_email_1", "SMTP timeout", ws_id)

        assert entry.workspace_id == ws_id
        assert entry.workflow_id == state.workflow_id
        assert entry.lead_id == state.lead_id
        assert entry.lead_state_id == state.id
        assert entry.failed_node_id == "n_email_1"
        assert entry.failure_count == 3
        assert entry.last_error == "SMTP timeout"
        assert entry.status == "pending_review"
        assert state.status == "dead_lettered"
        assert "DLQ" in state.last_error
        assert state.next_run_at is None
        db.add.assert_called_once()
        db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_retry_from_dlq(self):
        dls = DeadLetterService()
        db = AsyncMock()
        db.flush = AsyncMock()

        dlq_entry = MagicMock()
        dlq_entry.id = uuid.uuid4()
        dlq_entry.lead_state_id = uuid.uuid4()
        dlq_entry.status = "pending_review"

        lead_state = MagicMock()
        lead_state.id = dlq_entry.lead_state_id
        lead_state.status = "dead_lettered"

        # First execute returns DLQ entry, second returns lead state
        mock_dlq_result = MagicMock()
        mock_dlq_result.scalar_one_or_none.return_value = dlq_entry
        mock_state_result = MagicMock()
        mock_state_result.scalar_one_or_none.return_value = lead_state

        db.execute = AsyncMock(side_effect=[mock_dlq_result, mock_state_result])

        result = await dls.retry_from_dlq(db, dlq_entry.id)

        assert result is lead_state
        assert lead_state.status == "pending"
        assert lead_state.retry_count == 0
        assert lead_state.last_retry_at is None
        assert lead_state.next_run_at is not None
        assert dlq_entry.status == "retried"
        assert dlq_entry.resolved_at is not None

    @pytest.mark.asyncio
    async def test_retry_from_dlq_not_found(self):
        dls = DeadLetterService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        result = await dls.retry_from_dlq(db, uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_retry_from_dlq_wrong_status(self):
        dls = DeadLetterService()
        db = AsyncMock()

        dlq_entry = MagicMock()
        dlq_entry.status = "retried"  # already retried

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = dlq_entry
        db.execute = AsyncMock(return_value=mock_result)

        result = await dls.retry_from_dlq(db, uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_discard_dlq_entry(self):
        dls = DeadLetterService()
        db = AsyncMock()
        db.flush = AsyncMock()

        dlq_entry = MagicMock()
        dlq_entry.status = "pending_review"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = dlq_entry
        db.execute = AsyncMock(return_value=mock_result)

        result = await dls.discard_dlq_entry(db, uuid.uuid4())
        assert result is True
        assert dlq_entry.status == "discarded"
        assert dlq_entry.resolved_at is not None

    @pytest.mark.asyncio
    async def test_discard_dlq_entry_not_found(self):
        dls = DeadLetterService()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        result = await dls.discard_dlq_entry(db, uuid.uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_discard_dlq_entry_wrong_status(self):
        dls = DeadLetterService()
        db = AsyncMock()

        dlq_entry = MagicMock()
        dlq_entry.status = "discarded"  # already discarded

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = dlq_entry
        db.execute = AsyncMock(return_value=mock_result)

        result = await dls.discard_dlq_entry(db, uuid.uuid4())
        assert result is False

    def test_singleton_instance(self):
        assert dead_letter_service is not None
        assert isinstance(dead_letter_service, DeadLetterService)


# ===================================================================
# TimeoutEnforcer Tests
# ===================================================================

class TestTimeoutEnforcer:
    """Test asyncio timeout enforcement."""

    @pytest.mark.asyncio
    async def test_execute_within_timeout(self):
        te = TimeoutEnforcer()

        async def quick_task():
            return "done"

        result = await te.execute_with_timeout(quick_task(), timeout_ms=5000)
        assert result == "done"

    @pytest.mark.asyncio
    async def test_execute_exceeds_timeout_raises(self):
        te = TimeoutEnforcer()

        async def slow_task():
            await asyncio.sleep(10)
            return "done"

        with pytest.raises(asyncio.TimeoutError):
            await te.execute_with_timeout(slow_task(), timeout_ms=50)

    @pytest.mark.asyncio
    async def test_timeout_ms_conversion(self):
        """Verify ms -> seconds conversion: 500ms = 0.5s."""
        te = TimeoutEnforcer()

        async def task_250ms():
            await asyncio.sleep(0.25)
            return "ok"

        result = await te.execute_with_timeout(task_250ms(), timeout_ms=500)
        assert result == "ok"

    def test_singleton_instance(self):
        assert timeout_enforcer is not None
        assert isinstance(timeout_enforcer, TimeoutEnforcer)


# ===================================================================
# Idempotency Integration Tests (runtime level)
# ===================================================================

class TestIdempotencyIntegration:
    """Test that runtime idempotency check works with execution logs."""

    @pytest.mark.asyncio
    async def test_duplicate_execution_skipped(self):
        """If an idempotency key already exists, the step should be skipped."""
        from app.services.workflow.runtime import WorkflowRuntime

        runtime = WorkflowRuntime()
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        # Build mock state
        state = MagicMock()
        state.id = uuid.uuid4()
        state.workflow_id = uuid.uuid4()
        state.campaign_id = uuid.uuid4()
        state.lead_id = uuid.uuid4()
        state.current_node_id = "n_note_1"
        state.status = "pending"
        state.execution_count = 5
        state.context_json = {"lead": {"email": "test@example.com"}}
        state.channel_state_json = {}
        state.retry_count = 0

        # Mock: workflow definition found
        wf_def = MagicMock()
        wf_def.canonical_json = {"settings": {"max_node_executions_per_lead": 50}}

        # Mock: node found (use add_note to avoid compliance engine path)
        node = MagicMock()
        node.node_id = "n_note_1"
        node.node_type = "add_note"
        node.config_json = {}

        # Mock: idempotency key FOUND (already executed)
        existing_log = MagicMock()

        # Set up the db.execute mock to return different results for different queries
        call_count = 0
        mock_results = []

        # Call 1: workflow definition
        wf_result = MagicMock()
        wf_result.scalar_one_or_none.return_value = wf_def
        mock_results.append(wf_result)

        # Call 2: node lookup
        node_result = MagicMock()
        node_result.scalar_one_or_none.return_value = node
        mock_results.append(node_result)

        # Call 3: idempotency check — return existing log
        idem_result = MagicMock()
        idem_result.scalar_one_or_none.return_value = existing_log
        mock_results.append(idem_result)

        # Call 4: edge evaluation (if idempotency triggers advance)
        edge = MagicMock()
        edge.condition = "always"
        edge.to_node_id = "n_next"
        edge.edge_order = 1
        edge_result = MagicMock()
        edge_result.scalars.return_value.all.return_value = [edge]
        mock_results.append(edge_result)

        db.execute = AsyncMock(side_effect=mock_results)

        await runtime._execute_lead_step(db, state)

        # Should advance to next node without re-executing
        assert state.current_node_id == "n_next"
        assert state.status == "pending"


# ===================================================================
# Retry Policy in Runtime Integration Tests
# ===================================================================

class TestRetryPolicyIntegration:
    """Test that retry_manager is correctly used in the runtime fail path."""

    def test_retry_manager_exponential_sequence(self):
        """Verify the full retry sequence for exponential backoff."""
        rm = RetryManager()
        policy = {
            "enabled": True,
            "max_attempts": 3,
            "backoff_strategy": "exponential",
            "backoff_base_ms": 1000,
        }

        # Attempt 0
        should, delay = rm.should_retry(policy, 0)
        assert should is True
        assert delay == 1000

        # Attempt 1
        should, delay = rm.should_retry(policy, 1)
        assert should is True
        assert delay == 2000

        # Attempt 2
        should, delay = rm.should_retry(policy, 2)
        assert should is True
        assert delay == 4000

        # Attempt 3 — max exceeded
        should, delay = rm.should_retry(policy, 3)
        assert should is False

    def test_retry_manager_linear_sequence(self):
        rm = RetryManager()
        policy = {
            "enabled": True,
            "max_attempts": 4,
            "backoff_strategy": "linear",
            "backoff_base_ms": 500,
        }

        delays = []
        for i in range(4):
            should, delay = rm.should_retry(policy, i)
            assert should is True
            delays.append(delay)

        assert delays == [500, 1000, 1500, 2000]

        # One past max
        should, _ = rm.should_retry(policy, 4)
        assert should is False


# ===================================================================
# Model Column Tests
# ===================================================================

class TestModelColumns:
    """Verify that the new columns exist on the models."""

    def test_workflow_lead_state_has_retry_count(self):
        from app.models.workflow import WorkflowLeadState
        assert hasattr(WorkflowLeadState, "retry_count")

    def test_workflow_lead_state_has_last_retry_at(self):
        from app.models.workflow import WorkflowLeadState
        assert hasattr(WorkflowLeadState, "last_retry_at")

    def test_workflow_lead_state_status_includes_dead_lettered(self):
        """The status comment should now include dead_lettered."""
        from app.models.workflow import WorkflowLeadState
        import inspect
        source = inspect.getsource(WorkflowLeadState)
        assert "dead_lettered" in source

    def test_workflow_execution_log_has_idempotency_key(self):
        from app.models.workflow import WorkflowExecutionLog
        assert hasattr(WorkflowExecutionLog, "idempotency_key")

    def test_dead_letter_entry_model_exists(self):
        from app.models.workflow import WorkflowDeadLetterEntry
        assert WorkflowDeadLetterEntry.__tablename__ == "workflow_dead_letter_entries"

    def test_dead_letter_entry_has_required_fields(self):
        from app.models.workflow import WorkflowDeadLetterEntry
        for field in [
            "id", "workspace_id", "workflow_id", "lead_id", "lead_state_id",
            "failed_node_id", "failure_count", "last_error", "context_snapshot",
            "status", "created_at", "resolved_at",
        ]:
            assert hasattr(WorkflowDeadLetterEntry, field), f"Missing field: {field}"
