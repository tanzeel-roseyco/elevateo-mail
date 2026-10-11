"""Tests for Phase 8: Versioning, Safe Rollout, and Trigger Governance.

Covers:
- Publish workflow increments version and archives previous
- Rollback restores previous version
- Rollout percentage filters leads
- Trigger governance blocks over-cap
- Dedupe window prevents duplicate triggers
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from app.schemas.workflow import TriggerPolicies
from app.services.workflow.trigger_governance import (
    TriggerGovernor,
    TriggerVerdict,
    trigger_governor,
)
from app.services.workflow.runtime import WorkflowRuntime
from app.services.workflow.workflow_service import WorkflowService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_workflow_def(
    *,
    wf_id=None,
    workspace_id=None,
    campaign_id=None,
    name="Test Workflow",
    description=None,
    schema_version=1,
    workflow_version=1,
    status="draft",
    rollout_percentage=100,
    canonical_json=None,
    published_at=None,
):
    """Build a mock WorkflowDefinition."""
    from app.models.workflow import WorkflowDefinition

    wf = MagicMock(spec=WorkflowDefinition)
    wf.id = wf_id or uuid.uuid4()
    wf.workspace_id = workspace_id or uuid.uuid4()
    wf.campaign_id = campaign_id or uuid.uuid4()
    wf.name = name
    wf.description = description
    wf.schema_version = schema_version
    wf.workflow_version = workflow_version
    wf.status = status
    wf.rollout_percentage = rollout_percentage
    wf.published_at = published_at
    wf.canonical_json = canonical_json or _minimal_workflow_json(name)
    return wf


def _minimal_workflow_json(name="Test Workflow"):
    """Return minimal valid workflow JSON."""
    return {
        "schema_version": 1,
        "workflow_version": 1,
        "meta": {"name": name, "description": "", "tags": []},
        "settings": {
            "timezone": "UTC",
            "prevent_same_day_cross_channel_touch": True,
            "max_node_executions_per_lead": 100,
        },
        "nodes": [
            {
                "id": "n_trigger",
                "type": "trigger_manual",
                "name": "Start",
                "position": {"x": 120, "y": 120},
                "config": {},
            },
            {
                "id": "n_end",
                "type": "end",
                "name": "End",
                "position": {"x": 360, "y": 120},
                "config": {},
            },
        ],
        "connections": [
            {"from": "n_trigger", "to": "n_end", "condition": "always", "order": 1},
        ],
        "variables": {},
        "credentials_refs": {},
        "canvas_notes": [],
        "trigger_policies": {"dedupe_window_minutes": 10, "max_catch_up_runs": 3},
    }


# ===================================================================
# 8A. Versioned Publishing
# ===================================================================

class TestPublishWorkflow:
    """Test that publish_workflow archives previous and promotes draft."""

    @pytest.mark.asyncio
    async def test_publish_sets_status_and_published_at(self):
        """Publishing a draft sets status='published' and published_at."""
        service = WorkflowService()
        db = AsyncMock()

        wf = _make_workflow_def(status="draft")

        # Mock get_workflow to return the draft
        with patch.object(service, "get_workflow", return_value=wf):
            # Mock: no previously published versions
            mock_prev = MagicMock()
            mock_prev.scalars.return_value.all.return_value = []
            db.execute = AsyncMock(return_value=mock_prev)

            result = await service.publish_workflow(
                db, wf.campaign_id, wf.workspace_id,
            )

        assert result.status == "published"
        assert result.published_at is not None

    @pytest.mark.asyncio
    async def test_publish_archives_previous_published(self):
        """Publishing archives any previously published version."""
        service = WorkflowService()
        db = AsyncMock()

        draft = _make_workflow_def(status="draft")
        prev_published = _make_workflow_def(status="published")

        with patch.object(service, "get_workflow", return_value=draft):
            mock_prev = MagicMock()
            mock_prev.scalars.return_value.all.return_value = [prev_published]
            db.execute = AsyncMock(return_value=mock_prev)

            await service.publish_workflow(db, draft.campaign_id, draft.workspace_id)

        # The previously published version should now be archived
        assert prev_published.status == "archived"

    @pytest.mark.asyncio
    async def test_publish_already_published_raises(self):
        """Attempting to publish an already-published workflow raises ValueError."""
        service = WorkflowService()
        db = AsyncMock()

        wf = _make_workflow_def(status="published")

        with patch.object(service, "get_workflow", return_value=wf):
            with pytest.raises(ValueError, match="already published"):
                await service.publish_workflow(db, wf.campaign_id, wf.workspace_id)


class TestPublishWorkflowById:
    """Test publish_workflow_by_id for standalone workflows."""

    @pytest.mark.asyncio
    async def test_publish_by_id_sets_status(self):
        """Publishing by ID sets status and published_at."""
        service = WorkflowService()
        db = AsyncMock()

        wf = _make_workflow_def(status="draft")

        with patch.object(service, "get_by_id", return_value=wf):
            mock_prev = MagicMock()
            mock_prev.scalars.return_value.all.return_value = []
            db.execute = AsyncMock(return_value=mock_prev)

            result = await service.publish_workflow_by_id(
                db, wf.id, wf.workspace_id,
            )

        assert result.status == "published"
        assert result.published_at is not None

    @pytest.mark.asyncio
    async def test_publish_by_id_archives_previous(self):
        """Publishing by ID archives previous published with same name."""
        service = WorkflowService()
        db = AsyncMock()

        draft = _make_workflow_def(status="draft", name="My Flow")
        prev = _make_workflow_def(status="published", name="My Flow")

        with patch.object(service, "get_by_id", return_value=draft):
            mock_prev = MagicMock()
            mock_prev.scalars.return_value.all.return_value = [prev]
            db.execute = AsyncMock(return_value=mock_prev)

            await service.publish_workflow_by_id(db, draft.id, draft.workspace_id)

        assert prev.status == "archived"


# ===================================================================
# 8A. Rollback
# ===================================================================

class TestRollbackToVersion:
    """Test rollback_to_version restores a previous version."""

    @pytest.mark.asyncio
    async def test_rollback_creates_new_version(self):
        """Rollback creates a new version with the target's canonical_json."""
        service = WorkflowService()
        db = AsyncMock()

        workspace_id = uuid.uuid4()
        current = _make_workflow_def(
            workspace_id=workspace_id, name="Flow", workflow_version=3, status="published",
        )
        target_json = _minimal_workflow_json("Flow")
        target_json["meta"]["description"] = "Version 1 description"
        target = _make_workflow_def(
            workspace_id=workspace_id, name="Flow", workflow_version=1,
            status="archived", canonical_json=target_json,
        )

        with patch.object(service, "get_by_id", return_value=current):
            # Mock: target version query
            mock_target = MagicMock()
            mock_target.scalar_one_or_none.return_value = target

            # Mock: max version query
            mock_max = MagicMock()
            mock_max.scalar.return_value = 3

            db.execute = AsyncMock(side_effect=[mock_target, mock_max])

            with patch.object(service, "_compile_runtime_tables", new_callable=AsyncMock):
                result = await service.rollback_to_version(
                    db, current.id, workspace_id, target_version=1,
                )

        # Current should be archived
        assert current.status == "archived"
        # db.add should have been called with the new restored workflow
        assert db.add.called

    @pytest.mark.asyncio
    async def test_rollback_to_nonexistent_version_raises(self):
        """Rollback to a version that does not exist raises ValueError."""
        service = WorkflowService()
        db = AsyncMock()

        current = _make_workflow_def(workflow_version=2, status="published")

        with patch.object(service, "get_by_id", return_value=current):
            mock_target = MagicMock()
            mock_target.scalar_one_or_none.return_value = None
            db.execute = AsyncMock(return_value=mock_target)

            with pytest.raises(ValueError, match="not found"):
                await service.rollback_to_version(
                    db, current.id, current.workspace_id, target_version=99,
                )

    @pytest.mark.asyncio
    async def test_rollback_to_same_version_raises(self):
        """Rollback to the same version raises ValueError."""
        service = WorkflowService()
        db = AsyncMock()

        wf_id = uuid.uuid4()
        current = _make_workflow_def(wf_id=wf_id, workflow_version=1, status="published")

        # Target returns the same object (same id)
        target = MagicMock()
        target.id = wf_id

        with patch.object(service, "get_by_id", return_value=current):
            mock_target = MagicMock()
            mock_target.scalar_one_or_none.return_value = target
            db.execute = AsyncMock(return_value=mock_target)

            with pytest.raises(ValueError, match="same version"):
                await service.rollback_to_version(
                    db, wf_id, current.workspace_id, target_version=1,
                )


# ===================================================================
# 8B. Partial Rollout
# ===================================================================

class TestRolloutPercentage:
    """Test rollout_percentage filtering on triggers."""

    def test_passes_rollout_100(self):
        """100% rollout always passes."""
        for _ in range(100):
            assert trigger_governor.passes_rollout(100) is True

    def test_passes_rollout_0(self):
        """0% rollout never passes."""
        for _ in range(100):
            assert trigger_governor.passes_rollout(0) is False

    def test_passes_rollout_50_is_probabilistic(self):
        """50% rollout passes approximately half the time."""
        passed = sum(trigger_governor.passes_rollout(50) for _ in range(1000))
        # With 1000 trials, 50% should give ~500 +/- margin
        assert 350 < passed < 650, f"Expected ~500 passes, got {passed}"

    @pytest.mark.asyncio
    async def test_dispatch_manual_trigger_filters_by_rollout(self):
        """dispatch_manual_trigger skips leads that fail the rollout check."""
        runtime = WorkflowRuntime()
        db = AsyncMock()

        workflow_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        # Build a mock workflow_def with 0% rollout
        wf_def = MagicMock()
        wf_def.workspace_id = workspace_id
        wf_def.rollout_percentage = 0
        wf_def.canonical_json = _minimal_workflow_json()

        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = wf_def

        # Mock: no existing lead states
        mock_no_existing = MagicMock()
        mock_no_existing.scalar_one_or_none.return_value = None

        # First call = workflow def lookup, subsequent = existing state checks
        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_no_existing])

        lead_ids = [uuid.uuid4()]
        states = await runtime.dispatch_manual_trigger(
            db, workflow_id, campaign_id, lead_ids, "n_trigger",
        )

        # 0% rollout means no leads should enter
        assert len(states) == 0

    @pytest.mark.asyncio
    async def test_dispatch_event_trigger_filters_by_rollout(self):
        """dispatch_event_trigger returns None if rollout check fails."""
        runtime = WorkflowRuntime()
        db = AsyncMock()

        workflow_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        wf_def = MagicMock()
        wf_def.workspace_id = workspace_id
        wf_def.rollout_percentage = 0
        wf_def.canonical_json = _minimal_workflow_json()

        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = wf_def

        mock_no_existing = MagicMock()
        mock_no_existing.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[mock_no_existing, mock_wf_result])

        result = await runtime.dispatch_event_trigger(
            db, workflow_id, campaign_id, uuid.uuid4(), "n_trigger",
        )
        assert result is None


# ===================================================================
# 8C. Trigger Governance
# ===================================================================

class TestTriggerGovernorDedupeWindow:
    """Test dedupe window prevents duplicate triggers."""

    @pytest.mark.asyncio
    async def test_dedupe_blocks_recent_trigger(self):
        """If lead was triggered within window, should be blocked."""
        governor = TriggerGovernor()
        db = AsyncMock()

        # Mock: count returns 1 (lead exists within window)
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        db.execute = AsyncMock(return_value=mock_result)

        policies = TriggerPolicies(dedupe_window_minutes=10)
        verdict = await governor.can_trigger(
            db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
        )

        assert verdict.allowed is False
        assert "dedupe window" in verdict.reason

    @pytest.mark.asyncio
    async def test_dedupe_allows_when_no_recent_trigger(self):
        """If no recent trigger within window, should be allowed."""
        governor = TriggerGovernor()
        db = AsyncMock()

        # Mock: count returns 0
        mock_result = MagicMock()
        mock_result.scalar.return_value = 0
        db.execute = AsyncMock(return_value=mock_result)

        policies = TriggerPolicies(dedupe_window_minutes=10)
        verdict = await governor.can_trigger(
            db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
        )

        assert verdict.allowed is True

    @pytest.mark.asyncio
    async def test_dedupe_disabled_when_zero(self):
        """If dedupe_window_minutes=0, dedupe check is skipped."""
        governor = TriggerGovernor()
        db = AsyncMock()

        # Should not even call db.execute for dedupe
        policies = TriggerPolicies(dedupe_window_minutes=0)
        verdict = await governor.can_trigger(
            db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
        )

        assert verdict.allowed is True


class TestTriggerGovernorVolumeCaps:
    """Test hourly and daily volume caps."""

    @pytest.mark.asyncio
    async def test_hourly_cap_blocks_over_limit(self):
        """If hourly volume exceeds cap, trigger is blocked."""
        governor = TriggerGovernor()
        db = AsyncMock()

        # No dedupe check needed
        mock_count = MagicMock()
        mock_count.scalar.return_value = 0
        db.execute = AsyncMock(return_value=mock_count)

        # Mock Redis to return count above cap
        mock_redis = MagicMock()
        mock_redis.get.return_value = "50"

        policies = TriggerPolicies(
            dedupe_window_minutes=0,
            volume_cap_per_hour=50,
        )

        with patch(
            "app.utils.redis_client.get_redis",
            return_value=mock_redis,
        ):
            verdict = await governor.can_trigger(
                db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
            )

        assert verdict.allowed is False
        assert "Volume cap exceeded" in verdict.reason
        assert "hour" in verdict.details.get("period", "")

    @pytest.mark.asyncio
    async def test_daily_cap_blocks_over_limit(self):
        """If daily volume exceeds cap, trigger is blocked."""
        governor = TriggerGovernor()
        db = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 0
        db.execute = AsyncMock(return_value=mock_count)

        mock_redis = MagicMock()
        # Hourly cap returns under limit, daily returns over
        def redis_get(key):
            if "hour" in key:
                return "5"
            if "day" in key:
                return "200"
            return None
        mock_redis.get.side_effect = redis_get

        policies = TriggerPolicies(
            dedupe_window_minutes=0,
            volume_cap_per_hour=100,
            volume_cap_per_day=200,
        )

        with patch(
            "app.utils.redis_client.get_redis",
            return_value=mock_redis,
        ):
            verdict = await governor.can_trigger(
                db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
            )

        assert verdict.allowed is False
        assert "day" in verdict.details.get("period", "")

    @pytest.mark.asyncio
    async def test_volume_cap_allows_under_limit(self):
        """If volume is under cap, trigger is allowed."""
        governor = TriggerGovernor()
        db = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 0
        db.execute = AsyncMock(return_value=mock_count)

        mock_redis = MagicMock()
        mock_redis.get.return_value = "10"

        policies = TriggerPolicies(
            dedupe_window_minutes=0,
            volume_cap_per_hour=100,
            volume_cap_per_day=1000,
        )

        with patch(
            "app.utils.redis_client.get_redis",
            return_value=mock_redis,
        ):
            verdict = await governor.can_trigger(
                db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
            )

        assert verdict.allowed is True

    @pytest.mark.asyncio
    async def test_volume_cap_zero_means_unlimited(self):
        """If volume caps are 0, they are treated as unlimited."""
        governor = TriggerGovernor()
        db = AsyncMock()

        policies = TriggerPolicies(
            dedupe_window_minutes=0,
            volume_cap_per_hour=0,
            volume_cap_per_day=0,
        )

        verdict = await governor.can_trigger(
            db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
        )
        assert verdict.allowed is True

    @pytest.mark.asyncio
    async def test_redis_failure_fails_open(self):
        """If Redis is unavailable, volume check should fail open (allow)."""
        governor = TriggerGovernor()
        db = AsyncMock()

        mock_count = MagicMock()
        mock_count.scalar.return_value = 0
        db.execute = AsyncMock(return_value=mock_count)

        policies = TriggerPolicies(
            dedupe_window_minutes=0,
            volume_cap_per_hour=50,
        )

        with patch(
            "app.utils.redis_client.get_redis",
            side_effect=Exception("Redis down"),
        ):
            verdict = await governor.can_trigger(
                db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), policies,
            )

        assert verdict.allowed is True


class TestTriggerGovernorVolumeCounters:
    """Test volume counter increment after successful trigger."""

    def test_increment_volume_counter(self):
        """increment_volume_counter calls Redis INCR for hour and day keys."""
        governor = TriggerGovernor()
        mock_redis = MagicMock()
        mock_redis.incr.return_value = 1

        workspace_id = uuid.uuid4()
        workflow_id = uuid.uuid4()

        with patch(
            "app.utils.redis_client.get_redis",
            return_value=mock_redis,
        ):
            governor.increment_volume_counter(workspace_id, workflow_id)

        # Should have called incr twice (hour + day)
        assert mock_redis.incr.call_count == 2
        # Should set expiry on first increment
        assert mock_redis.expire.call_count == 2


class TestTriggerGovernorIntegration:
    """Test governance integration with runtime dispatchers."""

    @pytest.mark.asyncio
    async def test_governance_blocks_in_manual_dispatch(self):
        """Manual dispatch respects governance verdict."""
        runtime = WorkflowRuntime()
        db = AsyncMock()

        workflow_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        wf_def = MagicMock()
        wf_def.workspace_id = workspace_id
        wf_def.rollout_percentage = 100
        wf_def.canonical_json = {
            **_minimal_workflow_json(),
            "trigger_policies": {
                "dedupe_window_minutes": 10,
                "volume_cap_per_hour": 1,
            },
        }

        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = wf_def

        mock_no_existing = MagicMock()
        mock_no_existing.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_no_existing])

        # Governance blocks: can_trigger returns False
        blocked_verdict = TriggerVerdict(allowed=False, reason="Volume cap")
        with patch.object(trigger_governor, "can_trigger", return_value=blocked_verdict):
            states = await runtime.dispatch_manual_trigger(
                db, workflow_id, uuid.uuid4(), [uuid.uuid4()], "n_trigger",
            )

        assert len(states) == 0

    @pytest.mark.asyncio
    async def test_governance_blocks_in_event_dispatch(self):
        """Event dispatch respects governance verdict."""
        runtime = WorkflowRuntime()
        db = AsyncMock()

        workflow_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        wf_def = MagicMock()
        wf_def.workspace_id = workspace_id
        wf_def.rollout_percentage = 100
        wf_def.canonical_json = {
            **_minimal_workflow_json(),
            "trigger_policies": {"dedupe_window_minutes": 10},
        }

        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = wf_def

        mock_no_existing = MagicMock()
        mock_no_existing.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[mock_no_existing, mock_wf_result])

        blocked_verdict = TriggerVerdict(allowed=False, reason="Dedupe window")
        with patch.object(trigger_governor, "can_trigger", return_value=blocked_verdict):
            result = await runtime.dispatch_event_trigger(
                db, workflow_id, uuid.uuid4(), uuid.uuid4(), "n_trigger",
            )

        assert result is None


# ===================================================================
# 8C. TriggerPolicies Schema Extensions
# ===================================================================

class TestTriggerPoliciesSchema:
    """Test the extended TriggerPolicies schema fields."""

    def test_default_values(self):
        """TriggerPolicies should have correct defaults for new fields."""
        policies = TriggerPolicies()
        assert policies.backlog_policy == "skip"
        assert policies.max_catch_up_batch_size == 100
        assert policies.volume_cap_per_hour == 0
        assert policies.volume_cap_per_day == 0
        assert policies.priority == 0

    def test_custom_values(self):
        """TriggerPolicies should accept custom values."""
        policies = TriggerPolicies(
            backlog_policy="catch_up_sequential",
            max_catch_up_batch_size=50,
            volume_cap_per_hour=200,
            volume_cap_per_day=5000,
            priority=10,
        )
        assert policies.backlog_policy == "catch_up_sequential"
        assert policies.max_catch_up_batch_size == 50
        assert policies.volume_cap_per_hour == 200
        assert policies.volume_cap_per_day == 5000
        assert policies.priority == 10

    def test_from_workflow_json(self):
        """TriggerPolicies can be constructed from workflow JSON trigger_policies."""
        raw = {
            "dedupe_window_minutes": 30,
            "max_catch_up_runs": 5,
            "backlog_policy": "catch_up_batch",
            "volume_cap_per_hour": 100,
            "volume_cap_per_day": 2000,
            "priority": 5,
        }
        policies = TriggerPolicies(**raw)
        assert policies.dedupe_window_minutes == 30
        assert policies.backlog_policy == "catch_up_batch"
        assert policies.volume_cap_per_hour == 100


# ===================================================================
# 8B. Model Column
# ===================================================================

class TestWorkflowDefinitionRollout:
    """Test the rollout_percentage column on WorkflowDefinition model."""

    def test_default_rollout_percentage(self):
        """WorkflowDefinition.rollout_percentage defaults to 100."""
        from app.models.workflow import WorkflowDefinition
        # Verify the column exists and has correct default
        col = WorkflowDefinition.__table__.columns["rollout_percentage"]
        assert col.default.arg == 100

    def test_rollout_percentage_is_integer(self):
        """rollout_percentage column should be an Integer type."""
        from app.models.workflow import WorkflowDefinition
        from sqlalchemy import Integer
        col = WorkflowDefinition.__table__.columns["rollout_percentage"]
        assert isinstance(col.type, Integer)
