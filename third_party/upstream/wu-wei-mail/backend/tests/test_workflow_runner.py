"""Tests for Phase 1: Workflow runner Celery task and EmailSendExecutor wiring."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.workflow.node_executors import (
    EmailSendExecutor,
    NodeResult,
    NodeResultAction,
)
from app.schemas.workflow import ExecutionContext


# ---------------------------------------------------------------------------
# EmailSendExecutor tests
# ---------------------------------------------------------------------------

class TestEmailSendExecutor:
    """Test the EmailSendExecutor — stub mode and real mode."""

    @pytest.mark.asyncio
    async def test_stub_mode_when_no_db(self):
        """When no db in node_meta, falls back to stub mode."""
        executor = EmailSendExecutor()
        result = await executor.execute(
            config={"template_id": "t1", "subject_override": "Hi", "body_override": "Hello"},
            context=ExecutionContext(lead={"email": "test@example.com"}),
            lead_data={"email": "test@example.com"},
            channel_state={},
            node_meta=None,  # No db
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output.get("stub") is True
        assert result.event_type == "email_sent"

    @pytest.mark.asyncio
    async def test_stub_mode_when_empty_meta(self):
        """When node_meta has no db key, falls back to stub mode."""
        executor = EmailSendExecutor()
        result = await executor.execute(
            config={},
            context=ExecutionContext(),
            node_meta={},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output.get("stub") is True


# ---------------------------------------------------------------------------
# WorkflowRuntime lead context population tests
# ---------------------------------------------------------------------------

class TestLeadContextPopulation:
    """Test that dispatch_manual_trigger and dispatch_event_trigger populate lead context."""

    @pytest.mark.asyncio
    async def test_manual_trigger_populates_lead_context(self):
        """dispatch_manual_trigger should populate context_json.lead with lead data."""
        from app.services.workflow.runtime import WorkflowRuntime

        runtime = WorkflowRuntime()
        db = AsyncMock()

        lead_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workflow_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        # Mock: workflow definition for governance
        mock_wf_def = MagicMock()
        mock_wf_def.workspace_id = workspace_id
        mock_wf_def.rollout_percentage = 100
        mock_wf_def.canonical_json = {
            "trigger_policies": {"dedupe_window_minutes": 0},
        }
        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = mock_wf_def

        # Mock: no existing lead state
        mock_no_existing = MagicMock()
        mock_no_existing.scalar_one_or_none.return_value = None

        # Mock: dedupe count = 0 (governance check)
        mock_dedupe = MagicMock()
        mock_dedupe.scalar.return_value = 0

        # Mock: lead found in DB
        mock_lead = MagicMock()
        mock_lead.id = lead_id
        mock_lead.email = "alice@example.com"
        mock_lead.first_name = "Alice"
        mock_lead.last_name = "Smith"
        mock_lead.company = "Acme"
        mock_lead.title = "CEO"
        mock_lead.linkedin_url = "https://linkedin.com/in/alice"
        mock_lead.phone = "+1234567890"
        mock_lead.custom_fields = {"industry": "tech"}

        mock_lead_result = MagicMock()
        mock_lead_result.scalar_one_or_none.return_value = mock_lead

        # Call order: 1=workflow def, 2=existing check, 3=load lead
        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_no_existing, mock_lead_result])

        states = await runtime.dispatch_manual_trigger(
            db=db,
            workflow_id=workflow_id,
            campaign_id=campaign_id,
            lead_ids=[lead_id],
            trigger_node_id="n_trigger",
        )

        assert len(states) == 1
        state = states[0]
        lead_ctx = state.context_json.get("lead", {})
        assert lead_ctx["email"] == "alice@example.com"
        assert lead_ctx["first_name"] == "Alice"
        assert lead_ctx["company"] == "Acme"
        assert lead_ctx["id"] == str(lead_id)

    @pytest.mark.asyncio
    async def test_event_trigger_populates_lead_context(self):
        """dispatch_event_trigger should populate context_json.lead with lead data."""
        from app.services.workflow.runtime import WorkflowRuntime

        runtime = WorkflowRuntime()
        db = AsyncMock()

        lead_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workflow_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        # Mock: no existing lead state
        mock_no_existing = MagicMock()
        mock_no_existing.scalar_one_or_none.return_value = None

        # Mock: workflow definition for governance
        mock_wf_def = MagicMock()
        mock_wf_def.workspace_id = workspace_id
        mock_wf_def.rollout_percentage = 100
        mock_wf_def.canonical_json = {
            "trigger_policies": {"dedupe_window_minutes": 0},
        }
        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = mock_wf_def

        # Mock: lead found
        mock_lead = MagicMock()
        mock_lead.id = lead_id
        mock_lead.email = "bob@example.com"
        mock_lead.first_name = "Bob"
        mock_lead.last_name = "Jones"
        mock_lead.company = "BigCo"
        mock_lead.title = "CTO"
        mock_lead.linkedin_url = ""
        mock_lead.phone = ""
        mock_lead.custom_fields = {}

        mock_lead_result = MagicMock()
        mock_lead_result.scalar_one_or_none.return_value = mock_lead

        # Call order: 1=existing check, 2=workflow def, 3=load lead
        db.execute = AsyncMock(side_effect=[mock_no_existing, mock_wf_result, mock_lead_result])

        state = await runtime.dispatch_event_trigger(
            db=db,
            workflow_id=workflow_id,
            campaign_id=campaign_id,
            lead_id=lead_id,
            trigger_node_id="n_trigger",
            event_data={"source": "new_lead_import"},
        )

        assert state is not None
        assert state.context_json["lead"]["email"] == "bob@example.com"
        assert state.context_json["trigger_event"]["source"] == "new_lead_import"


# ---------------------------------------------------------------------------
# Celery task registration test
# ---------------------------------------------------------------------------

class TestCeleryRegistration:
    """Test that the workflow runner task is properly registered."""

    def test_beat_schedule_includes_workflow_runner(self):
        """Verify the celery beat schedule contains workflow-runner entry."""
        from app.workers.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule
        assert "workflow-runner" in schedule
        entry = schedule["workflow-runner"]
        assert entry["task"] == "app.workers.workflow_runner.process_workflow_leads"
        assert entry["schedule"] == 30.0

    def test_workflow_runner_in_include_list(self):
        """Verify the workflow runner module is in the Celery include list."""
        from app.workers.celery_app import celery_app

        assert "app.workers.workflow_runner" in celery_app.conf.include


# ---------------------------------------------------------------------------
# Runtime passes node_meta test
# ---------------------------------------------------------------------------

class TestRuntimeNodeMeta:
    """Test that runtime passes node_meta with db and workspace_id to executors."""

    @pytest.mark.asyncio
    async def test_execute_lead_step_passes_node_meta(self):
        """Verify that _execute_lead_step passes node_meta dict to executor."""
        from app.services.workflow.runtime import WorkflowRuntime
        from app.models.workflow import WorkflowLeadState, WorkflowDefinition, WorkflowNode

        runtime = WorkflowRuntime()
        db = AsyncMock()

        # Create mock state
        state = MagicMock(spec=WorkflowLeadState)
        state.id = uuid.uuid4()
        state.workflow_id = uuid.uuid4()
        state.campaign_id = uuid.uuid4()
        state.lead_id = uuid.uuid4()
        state.current_node_id = "n_email_1"
        state.execution_count = 0
        state.context_json = {"lead": {"email": "test@test.com"}}
        state.channel_state_json = {}
        state.status = "pending"

        # Mock workflow definition
        mock_wf_def = MagicMock(spec=WorkflowDefinition)
        mock_wf_def.id = state.workflow_id
        mock_wf_def.workspace_id = uuid.uuid4()
        mock_wf_def.canonical_json = {"settings": {"max_node_executions_per_lead": 50}}

        # Mock node
        mock_node = MagicMock(spec=WorkflowNode)
        mock_node.node_id = "n_email_1"
        mock_node.node_type = "email_send"
        mock_node.config_json = {"subject_override": "Test", "body_override": "Hello"}

        # Setup db.execute to return appropriate mocks
        mock_wf_result = MagicMock()
        mock_wf_result.scalar_one_or_none.return_value = mock_wf_def

        mock_node_result = MagicMock()
        mock_node_result.scalar_one_or_none.return_value = mock_node

        mock_ws_result = MagicMock()
        mock_ws_result.scalar_one_or_none.return_value = mock_wf_def.workspace_id

        # We'll capture what the executor receives
        captured_meta = {}

        async def fake_execute(config, context, lead_data=None, channel_state=None, node_meta=None):
            captured_meta.update(node_meta or {})
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={"email_queued": True},
            )

        # Mock compliance engine to allow all
        mock_verdict = MagicMock()
        mock_verdict.allowed = True

        with patch("app.services.workflow.runtime.get_executor") as mock_get_executor, \
             patch("app.services.workflow.compliance_engine.compliance_engine") as mock_compliance:
            mock_executor = MagicMock()
            mock_executor.execute = fake_execute
            mock_get_executor.return_value = mock_executor
            mock_compliance.evaluate = AsyncMock(return_value=mock_verdict)
            mock_compliance.record_touch = AsyncMock()

            # The db.execute calls in order:
            # 1. Load WorkflowDefinition
            # 2. Get node (via _get_node)
            # 3. workspace_id for compliance check
            # 4. idempotency check
            # 5. workspace_id for node_meta
            # 6. Edge evaluation
            mock_idem_result = MagicMock()
            mock_idem_result.scalar_one_or_none.return_value = None  # no existing log

            db.execute = AsyncMock(side_effect=[
                mock_wf_result,      # WorkflowDefinition lookup
                mock_node_result,    # Node lookup
                mock_ws_result,      # workspace_id for compliance
                mock_idem_result,    # idempotency check
                mock_ws_result,      # workspace_id for node_meta
                MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))),  # edges
            ])

            await runtime._execute_lead_step(db, state)

        assert "db" in captured_meta
        assert "workspace_id" in captured_meta
        assert captured_meta["workspace_id"] == mock_wf_def.workspace_id
        assert captured_meta["campaign_id"] == state.campaign_id
