"""Tests for workflow runtime engine — node executors, edge evaluation, triggers."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.workflow.node_executors import (
    NodeResult,
    NodeResultAction,
    get_executor,
    IfExecutor,
    WaitExecutor,
    EndExecutor,
    EmailSendExecutor,
    AddNoteExecutor,
    TriggerManualExecutor,
    TriggerCronExecutor,
    SwitchExecutor,
    LinkedInConnectExecutor,
    LinkedInMessageExecutor,
    MergeExecutor,
    HttpRequestExecutor,
    OutgoingWebhookExecutor,
    AiGenerateMessageExecutor,
    AiClassifyReplyExecutor,
    AiExtractFieldsExecutor,
    AiDecisionExecutor,
    CreateTaskExecutor,
    ApprovalGateExecutor,
)
from app.services.workflow.runtime import WorkflowRuntime


# ===================================================================
# Node Executor Tests
# ===================================================================

class TestGetExecutor:
    def test_all_trigger_types_registered(self):
        for t in ["trigger_manual", "trigger_new_lead", "trigger_list_membership_added",
                   "trigger_inbound_webhook", "trigger_cron"]:
            assert get_executor(t) is not None, f"Missing executor for {t}"

    def test_core_types_registered(self):
        for t in ["wait", "end", "if", "switch", "email_send", "add_note"]:
            assert get_executor(t) is not None, f"Missing executor for {t}"

    def test_linkedin_types_registered(self):
        for t in ["linkedin_connect", "linkedin_message"]:
            assert get_executor(t) is not None, f"Missing executor for {t}"

    def test_integration_types_registered(self):
        for t in ["http_request", "outgoing_webhook", "merge"]:
            assert get_executor(t) is not None, f"Missing executor for {t}"

    def test_ai_types_registered(self):
        for t in ["ai_generate_message", "ai_classify_reply", "ai_extract_fields", "ai_decision"]:
            assert get_executor(t) is not None, f"Missing executor for {t}"

    def test_collaboration_types_registered(self):
        for t in ["create_task", "approval_gate"]:
            assert get_executor(t) is not None, f"Missing executor for {t}"

    def test_unknown_type_returns_none(self):
        assert get_executor("nonexistent_type") is None


class TestTriggerExecutors:
    @pytest.mark.asyncio
    async def test_manual_trigger(self):
        ex = TriggerManualExecutor()
        result = await ex.execute({}, {}, {}, {})
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["triggered"] == "manual"

    @pytest.mark.asyncio
    async def test_cron_trigger(self):
        ex = TriggerCronExecutor()
        result = await ex.execute({"cron_expression": "0 9 * * 1-5"}, {}, {}, {})
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["triggered"] == "cron"


class TestWaitExecutor:
    @pytest.mark.asyncio
    async def test_wait_days(self):
        ex = WaitExecutor()
        result = await ex.execute({"days": 3, "hours": 0}, {}, {}, {})
        assert result.action == NodeResultAction.WAIT
        assert result.next_run_at is not None
        # Should be approximately 3 days from now
        delta = result.next_run_at - datetime.now(timezone.utc)
        assert 2.9 < delta.total_seconds() / 86400 < 3.1

    @pytest.mark.asyncio
    async def test_wait_hours(self):
        ex = WaitExecutor()
        result = await ex.execute({"days": 0, "hours": 6}, {}, {}, {})
        assert result.action == NodeResultAction.WAIT
        delta = result.next_run_at - datetime.now(timezone.utc)
        assert 5.9 < delta.total_seconds() / 3600 < 6.1


class TestEndExecutor:
    @pytest.mark.asyncio
    async def test_end_success(self):
        ex = EndExecutor()
        result = await ex.execute({"result": "success"}, {}, {}, {})
        assert result.action == NodeResultAction.COMPLETE
        assert result.output["result"] == "success"

    @pytest.mark.asyncio
    async def test_end_default(self):
        ex = EndExecutor()
        result = await ex.execute({}, {}, {}, {})
        assert result.action == NodeResultAction.COMPLETE


class TestIfExecutor:
    @pytest.mark.asyncio
    async def test_email_replied_true(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "email_replied"},
            {"email_replied": True},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["condition_met"] is True

    @pytest.mark.asyncio
    async def test_email_replied_false(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "email_replied"},
            {"email_replied": False},
            {},
            {},
        )
        assert result.output["condition_met"] is False

    @pytest.mark.asyncio
    async def test_has_linkedin_url_true(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "has_linkedin_url"},
            {},
            {"linkedin_url": "https://linkedin.com/in/test"},
            {},
        )
        assert result.output["condition_met"] is True

    @pytest.mark.asyncio
    async def test_has_linkedin_url_false(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "has_linkedin_url"},
            {},
            {"linkedin_url": None},
            {},
        )
        assert result.output["condition_met"] is False

    @pytest.mark.asyncio
    async def test_linkedin_accepted(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "linkedin_accepted"},
            {},
            {},
            {"linkedin_connected": True},
        )
        assert result.output["condition_met"] is True

    @pytest.mark.asyncio
    async def test_unknown_condition(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "some_unknown_condition"},
            {},
            {},
            {},
        )
        assert result.output["condition_met"] is False


class TestEmailSendExecutor:
    @pytest.mark.asyncio
    async def test_email_send(self):
        ex = EmailSendExecutor()
        result = await ex.execute(
            {"template_id": "tpl_1"},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.event_type == "email_sent"


class TestSwitchExecutor:
    @pytest.mark.asyncio
    async def test_switch(self):
        ex = SwitchExecutor()
        result = await ex.execute(
            {"field": "status"},
            {"status": "interested"},
            {},
            {},
        )
        assert result.output["switch_value"] == "interested"


class TestAddNoteExecutor:
    @pytest.mark.asyncio
    async def test_add_note(self):
        ex = AddNoteExecutor()
        result = await ex.execute(
            {"note_text": "Test note"},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["note_added"] == "Test note"


# ===================================================================
# Runtime Engine Tests (with mocked DB)
# ===================================================================

class TestWorkflowRuntimeEdgeEvaluation:
    """Test edge evaluation logic independently."""

    @pytest.mark.asyncio
    async def test_always_edge(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        # Mock edges query
        edge = MagicMock()
        edge.condition = "always"
        edge.to_node_id = "n_next"
        edge.edge_order = 1

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [edge]
        db.execute = AsyncMock(return_value=mock_result)

        state = MagicMock()
        state.workflow_id = uuid.uuid4()
        node = MagicMock()
        node.node_id = "n_current"

        result = NodeResult(action=NodeResultAction.ADVANCE)
        next_id = await runtime._evaluate_edges(db, state, node, result)
        assert next_id == "n_next"

    @pytest.mark.asyncio
    async def test_yes_no_edges(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        yes_edge = MagicMock()
        yes_edge.condition = "yes"
        yes_edge.to_node_id = "n_yes"
        yes_edge.edge_order = 1

        no_edge = MagicMock()
        no_edge.condition = "no"
        no_edge.to_node_id = "n_no"
        no_edge.edge_order = 2

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [yes_edge, no_edge]
        db.execute = AsyncMock(return_value=mock_result)

        state = MagicMock()
        state.workflow_id = uuid.uuid4()
        node = MagicMock()
        node.node_id = "n_if"

        # Condition met = True → yes edge
        result = NodeResult(action=NodeResultAction.ADVANCE, output={"condition_met": True})
        next_id = await runtime._evaluate_edges(db, state, node, result)
        assert next_id == "n_yes"

        # Condition met = False → no edge
        result = NodeResult(action=NodeResultAction.ADVANCE, output={"condition_met": False})
        next_id = await runtime._evaluate_edges(db, state, node, result)
        assert next_id == "n_no"

    @pytest.mark.asyncio
    async def test_no_edges(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        state = MagicMock()
        state.workflow_id = uuid.uuid4()
        node = MagicMock()
        node.node_id = "n_dead_end"

        result = NodeResult(action=NodeResultAction.ADVANCE)
        next_id = await runtime._evaluate_edges(db, state, node, result)
        assert next_id is None


class TestTriggerDispatchers:
    @pytest.mark.asyncio
    async def test_manual_dispatch_creates_states(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        # Mock: no existing state
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        lead_ids = [uuid.uuid4(), uuid.uuid4()]
        workflow_id = uuid.uuid4()
        campaign_id = uuid.uuid4()

        states = await runtime.dispatch_manual_trigger(
            db, workflow_id, campaign_id, lead_ids, "n_trigger",
        )
        assert len(states) == 2
        assert db.add.call_count == 2

    @pytest.mark.asyncio
    async def test_manual_dispatch_skips_existing(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        # Mock: existing state found
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = MagicMock()
        db.execute = AsyncMock(return_value=mock_result)

        states = await runtime.dispatch_manual_trigger(
            db, uuid.uuid4(), uuid.uuid4(), [uuid.uuid4()], "n_trigger",
        )
        assert len(states) == 0

    @pytest.mark.asyncio
    async def test_event_dispatch(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        state = await runtime.dispatch_event_trigger(
            db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), "n_trigger",
            event_data={"source": "webhook"},
        )
        assert state is not None
        assert state.context_json["trigger_event"]["source"] == "webhook"


class TestAdminTools:
    @pytest.mark.asyncio
    async def test_retry_lead(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        state = MagicMock()
        state.status = "failed"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = state
        db.execute = AsyncMock(return_value=mock_result)

        result = await runtime.retry_lead(db, uuid.uuid4())
        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_retry_non_failed_returns_none(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        state = MagicMock()
        state.status = "running"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = state
        db.execute = AsyncMock(return_value=mock_result)

        result = await runtime.retry_lead(db, uuid.uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_jump_to_node(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        state = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = state
        db.execute = AsyncMock(return_value=mock_result)

        result = await runtime.jump_to_node(db, uuid.uuid4(), "n_target")
        assert result.current_node_id == "n_target"
        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_mark_completed(self):
        runtime = WorkflowRuntime()
        db = AsyncMock()

        state = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = state
        db.execute = AsyncMock(return_value=mock_result)

        result = await runtime.mark_completed(db, uuid.uuid4())
        assert result.status == "completed"


# ===================================================================
# LinkedIn Node Executor Tests
# ===================================================================

class TestLinkedInConnectExecutor:
    @pytest.mark.asyncio
    async def test_connect_with_url(self):
        ex = LinkedInConnectExecutor()
        result = await ex.execute(
            {"message_template": "Hi there!"},
            {},
            {"linkedin_url": "https://linkedin.com/in/test"},
            {},
        )
        assert result.action == NodeResultAction.WAIT_FOR_EVENT
        assert result.output["invite_sent"] is True
        assert result.event_type == "invite_sent"
        assert result.next_run_at is not None

    @pytest.mark.asyncio
    async def test_connect_without_url_fails(self):
        ex = LinkedInConnectExecutor()
        result = await ex.execute(
            {"message_template": "Hi"},
            {},
            {"linkedin_url": None},
            {},
        )
        assert result.action == NodeResultAction.FAIL
        assert "linkedin_url" in result.error


class TestLinkedInMessageExecutor:
    @pytest.mark.asyncio
    async def test_message_connected(self):
        ex = LinkedInMessageExecutor()
        result = await ex.execute(
            {"message_template": "Following up"},
            {},
            {},
            {"linkedin_connected": True, "linkedin_chat_id": "chat_123"},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["message_sent"] is True
        assert result.event_type == "linkedin_message_sent"

    @pytest.mark.asyncio
    async def test_message_not_connected_fails(self):
        ex = LinkedInMessageExecutor()
        result = await ex.execute(
            {"message_template": "Hi"},
            {},
            {},
            {"linkedin_connected": False},
        )
        assert result.action == NodeResultAction.FAIL


class TestMergeExecutor:
    @pytest.mark.asyncio
    async def test_merge(self):
        ex = MergeExecutor()
        result = await ex.execute({}, {}, {}, {})
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["merged"] is True


# ===================================================================
# HTTP / Webhook Node Executor Tests
# ===================================================================

class TestHttpRequestExecutor:
    @pytest.mark.asyncio
    async def test_http_request_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"ok": True}
        mock_response.text = '{"ok": true}'
        mock_response.headers = {"content-type": "application/json"}

        mock_client = AsyncMock()
        mock_client.request.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.workflow.node_executors.httpx.AsyncClient", return_value=mock_client):
            ex = HttpRequestExecutor()
            result = await ex.execute(
                {"url": "https://api.example.com/hook", "method": "POST"},
                {},
                {},
                {},
            )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["http_status"] == 200
        assert result.output["response_body"] == {"ok": True}
        assert result.event_type == "http_request_succeeded"

    @pytest.mark.asyncio
    async def test_http_request_no_url_fails(self):
        ex = HttpRequestExecutor()
        result = await ex.execute({"url": ""}, {}, {}, {})
        assert result.action == NodeResultAction.FAIL

    @pytest.mark.asyncio
    async def test_http_request_non_2xx_fails(self):
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.is_success = False
        mock_response.json.side_effect = ValueError("not json")
        mock_response.text = "Not Found"
        mock_response.headers = {}

        mock_client = AsyncMock()
        mock_client.request.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.workflow.node_executors.httpx.AsyncClient", return_value=mock_client):
            ex = HttpRequestExecutor()
            result = await ex.execute(
                {"url": "https://api.example.com/missing", "method": "GET"},
                {},
                {},
                {},
            )
        assert result.action == NodeResultAction.FAIL
        assert "404" in result.error

    @pytest.mark.asyncio
    async def test_http_request_ssrf_blocked(self):
        ex = HttpRequestExecutor()
        result = await ex.execute(
            {"url": "http://192.168.1.1/admin", "method": "GET", "ssrf_protection": True},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.FAIL
        assert "SSRF" in result.error

    @pytest.mark.asyncio
    async def test_http_request_template_rendering(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"received": True}
        mock_response.text = '{"received": true}'
        mock_response.headers = {}

        mock_client = AsyncMock()
        mock_client.request.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.workflow.node_executors.httpx.AsyncClient", return_value=mock_client):
            ex = HttpRequestExecutor()
            result = await ex.execute(
                {
                    "url": "https://api.example.com/leads/{{email}}",
                    "method": "POST",
                    "body_template": '{"name": "{{first_name}}"}',
                },
                {},
                {"email": "test@example.com", "first_name": "Alice"},
                {},
            )
        assert result.action == NodeResultAction.ADVANCE
        # Verify the URL was rendered with lead data
        call_kwargs = mock_client.request.call_args
        assert "test@example.com" in call_kwargs.kwargs.get("url", call_kwargs[1].get("url", ""))


class TestOutgoingWebhookExecutor:
    @pytest.mark.asyncio
    async def test_webhook_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"ok": True}
        mock_response.text = '{"ok": true}'
        mock_response.headers = {}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.workflow.node_executors.httpx.AsyncClient", return_value=mock_client):
            ex = OutgoingWebhookExecutor()
            result = await ex.execute(
                {"url": "https://hooks.example.com/notify"},
                {},
                {},
                {},
            )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["webhook_sent"] is True
        assert result.output["http_status"] == 200

    @pytest.mark.asyncio
    async def test_webhook_no_url_fails(self):
        ex = OutgoingWebhookExecutor()
        result = await ex.execute({"url": ""}, {}, {}, {})
        assert result.action == NodeResultAction.FAIL

    @pytest.mark.asyncio
    async def test_webhook_hmac_signature(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {}
        mock_response.text = "{}"
        mock_response.headers = {}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.workflow.node_executors.httpx.AsyncClient", return_value=mock_client):
            ex = OutgoingWebhookExecutor()
            result = await ex.execute(
                {"url": "https://hooks.example.com/notify", "secret_ref": "my-secret"},
                {},
                {"email": "lead@example.com"},
                {},
            )
        assert result.action == NodeResultAction.ADVANCE
        # Verify signature header was sent
        call_kwargs = mock_client.post.call_args
        headers = call_kwargs.kwargs.get("headers", call_kwargs[1].get("headers", {}))
        assert "X-Webhook-Signature" in headers
        assert "X-Webhook-Timestamp" in headers


# ===================================================================
# AI Node Executor Tests
# ===================================================================

class TestAiGenerateMessageExecutor:
    @pytest.mark.asyncio
    async def test_generate(self):
        ex = AiGenerateMessageExecutor()
        result = await ex.execute(
            {"prompt_template": "Write intro for {{first_name}}"},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert "generated_text" in result.output


class TestAiClassifyReplyExecutor:
    @pytest.mark.asyncio
    async def test_classify_no_reply_text(self):
        """With no reply text in context, returns fallback without event."""
        ex = AiClassifyReplyExecutor()
        result = await ex.execute(
            {"labels": ["interested", "not_interested"], "fallback_label": "other"},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert "label" in result.output
        assert "confidence" in result.output
        assert result.output["label"] == "other"

    @pytest.mark.asyncio
    async def test_classify_with_reply_text(self):
        """With reply text and mocked AI, returns classified label with event."""
        import json
        from app.schemas.workflow import ExecutionContext

        ctx = ExecutionContext(
            node_outputs={"prev": {"reply_text": "I am interested!"}},
        )
        ai_response = json.dumps({"label": "interested", "confidence": 0.9})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            ex = AiClassifyReplyExecutor()
            result = await ex.execute(
                {"labels": ["interested", "not_interested"], "confidence_threshold": 0.5},
                ctx,
            )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["label"] == "interested"
        assert result.event_type == "ai_classified"


class TestAiExtractFieldsExecutor:
    @pytest.mark.asyncio
    async def test_extract(self):
        ex = AiExtractFieldsExecutor()
        result = await ex.execute(
            {"fields": ["company_size", "budget"]},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert "extracted" in result.output
        assert "company_size" in result.output["extracted"]


class TestAiDecisionExecutor:
    @pytest.mark.asyncio
    async def test_decision(self):
        ex = AiDecisionExecutor()
        result = await ex.execute(
            {"branch_labels": ["proceed", "defer"], "confidence_threshold": 0.7},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert "decision_label" in result.output
        assert "condition_met" in result.output


# ===================================================================
# Collaboration Node Executor Tests
# ===================================================================

class TestCreateTaskExecutor:
    @pytest.mark.asyncio
    async def test_create_task(self):
        ex = CreateTaskExecutor()
        result = await ex.execute(
            {"task_title": "Review lead", "assignee_ref": "user_123"},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.ADVANCE
        assert result.output["task_created"] is True


class TestApprovalGateExecutor:
    @pytest.mark.asyncio
    async def test_approval_gate(self):
        ex = ApprovalGateExecutor()
        result = await ex.execute(
            {"timeout_hours": 48},
            {},
            {},
            {},
        )
        assert result.action == NodeResultAction.WAIT_FOR_EVENT
        assert result.next_run_at is not None
        assert result.output["approval_required"] is True


# ===================================================================
# V2 Executor Tests (ExecutionContext support)
# ===================================================================

class TestExecutorWithExecutionContext:
    """Test executors with V2 ExecutionContext envelope."""

    @pytest.mark.asyncio
    async def test_if_executor_with_execution_context(self):
        from app.schemas.workflow import ExecutionContext
        ex = IfExecutor()
        ctx = ExecutionContext(
            lead={"email": "test@example.com", "linkedin_url": "https://linkedin.com/in/test"},
        )
        result = await ex.execute(
            {"condition": "has_linkedin_url"},
            ctx,
            lead_data={"linkedin_url": "https://linkedin.com/in/test"},
        )
        assert result.output["condition_met"] is True

    @pytest.mark.asyncio
    async def test_if_executor_negate(self):
        ex = IfExecutor()
        result = await ex.execute(
            {"condition": "email_replied", "negate": True},
            {"email_replied": False},
            {},
            {},
        )
        assert result.output["condition_met"] is True

    @pytest.mark.asyncio
    async def test_switch_with_execution_context(self):
        from app.schemas.workflow import ExecutionContext
        ex = SwitchExecutor()
        ctx = ExecutionContext(
            lead={"status": "interested"},
            vars={"priority": "high"},
        )
        result = await ex.execute({"field": "priority"}, ctx)
        assert result.output["switch_value"] == "high"

    @pytest.mark.asyncio
    async def test_wait_with_minutes(self):
        ex = WaitExecutor()
        result = await ex.execute({"days": 0, "hours": 0, "minutes": 30}, {})
        assert result.action == NodeResultAction.WAIT
        delta = result.next_run_at - datetime.now(timezone.utc)
        assert 29 < delta.total_seconds() / 60 < 31

    @pytest.mark.asyncio
    async def test_end_with_final_status(self):
        ex = EndExecutor()
        result = await ex.execute({"result": "success", "final_status": "graduated"}, {})
        assert result.output["final_status"] == "graduated"

    @pytest.mark.asyncio
    async def test_linkedin_connect_custom_wait_days(self):
        ex = LinkedInConnectExecutor()
        result = await ex.execute(
            {"message_template": "Hi", "wait_for_acceptance_days": 14},
            {},
            {"linkedin_url": "https://linkedin.com/in/test"},
            {},
        )
        assert result.action == NodeResultAction.WAIT_FOR_EVENT
        delta = result.next_run_at - datetime.now(timezone.utc)
        assert 13.9 < delta.total_seconds() / 86400 < 14.1

    @pytest.mark.asyncio
    async def test_node_result_duration_ms(self):
        """NodeResult should have duration_ms field."""
        result = NodeResult(action=NodeResultAction.ADVANCE, duration_ms=150)
        assert result.duration_ms == 150
