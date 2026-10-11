"""Tests for workflow JSON schema v1 — validation, parsing, compilation."""

import copy
import pytest

from app.schemas.workflow import (
    EdgeCondition,
    NodeType,
    WorkflowDefinitionV1,
    WorkflowDefinitionV2,
    WorkflowNode,
    WorkflowConnection,
    WorkflowMeta,
    WorkflowSettings,
    WaitConfig,
    migrate_v1_to_v2,
    NODE_CONFIG_MODELS,
    NODE_DEFAULT_OUTPUTS,
)
from app.services.workflow.schema_validator import (
    validate_workflow_json,
    parse_workflow_json,
    compile_nodes_and_edges,
)


# ---------------------------------------------------------------------------
# Fixtures — minimal valid workflow
# ---------------------------------------------------------------------------

def _minimal_workflow() -> dict:
    """Return the smallest valid workflow JSON dict."""
    return {
        "schema_version": 1,
        "workflow_version": 1,
        "meta": {"name": "Test Workflow", "description": "Minimal test"},
        "settings": {"timezone": "UTC", "max_node_executions_per_lead": 50},
        "nodes": [
            {"id": "n_trigger", "type": "trigger_manual", "name": "Start", "position": {"x": 0, "y": 0}, "config": {}},
            {"id": "n_email", "type": "email_send", "name": "Send Email", "position": {"x": 200, "y": 0}, "config": {}},
            {"id": "n_end", "type": "end", "name": "Done", "position": {"x": 400, "y": 0}, "config": {}},
        ],
        "connections": [
            {"from": "n_trigger", "to": "n_email", "condition": "always", "order": 1},
            {"from": "n_email", "to": "n_end", "condition": "always", "order": 1},
        ],
        "variables": {},
        "credentials_refs": {},
        "canvas_notes": [],
        "trigger_policies": {"dedupe_window_minutes": 10, "max_catch_up_runs": 3},
    }


def _full_workflow() -> dict:
    """Return the complete example from the implementation plan."""
    return {
        "schema_version": 1,
        "workflow_version": 3,
        "meta": {
            "name": "Email then LinkedIn fallback",
            "description": "If no email reply, route to LinkedIn",
            "tags": ["multichannel", "outbound"],
        },
        "settings": {
            "timezone": "UTC",
            "prevent_same_day_cross_channel_touch": True,
            "max_node_executions_per_lead": 50,
        },
        "nodes": [
            {"id": "n_trigger", "type": "trigger_cron", "name": "Daily Launch Window", "position": {"x": 120, "y": 80},
             "config": {"cron_expression": "0 9 * * 1-5", "timezone": "Europe/Copenhagen", "run_missed": "skip", "jitter_seconds": 90,
                        "lead_scope": {"type": "list_ids", "value": ["list_eu_saas"]}}},
            {"id": "n_email_1", "type": "email_send", "name": "Initial Email", "position": {"x": 330, "y": 80},
             "config": {"template_id": "tpl_intro_a", "track_opens": True, "track_clicks": True}},
            {"id": "n_wait_3d", "type": "wait", "name": "Wait 3d", "position": {"x": 540, "y": 80},
             "config": {"days": 3, "hours": 0}},
            {"id": "n_if_reply", "type": "if", "name": "Replied?", "position": {"x": 760, "y": 80},
             "config": {"condition": "email_replied", "lookback_hours": 168}},
            {"id": "n_li_connect", "type": "linkedin_connect", "name": "Connect on LinkedIn", "position": {"x": 980, "y": 220},
             "config": {"message_template": "Hi {{first_name}}, ..."}},
            {"id": "n_add_note", "type": "add_note", "name": "Log branch note", "position": {"x": 1200, "y": 220},
             "config": {"note_text": "LinkedIn fallback branch executed"}},
            {"id": "n_end", "type": "end", "name": "End", "position": {"x": 980, "y": 20},
             "config": {"result": "success"}},
        ],
        "connections": [
            {"from": "n_trigger", "to": "n_email_1", "condition": "always", "order": 1},
            {"from": "n_email_1", "to": "n_wait_3d", "condition": "always", "order": 1},
            {"from": "n_wait_3d", "to": "n_if_reply", "condition": "always", "order": 1},
            {"from": "n_if_reply", "to": "n_end", "condition": "yes", "order": 1},
            {"from": "n_if_reply", "to": "n_li_connect", "condition": "no", "order": 2},
            {"from": "n_li_connect", "to": "n_add_note", "condition": "always", "order": 1},
            {"from": "n_add_note", "to": "n_end", "condition": "always", "order": 1},
        ],
        "variables": {"lead.first_name": "string", "lead.linkedin_url": "string|null"},
        "credentials_refs": {"default_linkedin_account": "cred_linkedin_primary"},
        "trigger_policies": {"dedupe_window_minutes": 10, "max_catch_up_runs": 3},
        "canvas_notes": [{"id": "note_1", "text": "Legal approved this fallback message.", "position": {"x": 880, "y": 300}}],
    }


# ===================================================================
# Pydantic model tests
# ===================================================================

class TestWorkflowDefinitionV1Parsing:
    """Test Pydantic model parsing and validation."""

    def test_minimal_workflow_valid(self):
        wf = WorkflowDefinitionV1(**_minimal_workflow())
        assert wf.schema_version == 1
        assert len(wf.nodes) == 3
        assert len(wf.connections) == 2

    def test_full_workflow_valid(self):
        wf = WorkflowDefinitionV1(**_full_workflow())
        assert wf.meta.name == "Email then LinkedIn fallback"
        assert len(wf.nodes) == 7
        assert len(wf.connections) == 7
        assert len(wf.canvas_notes) == 1

    def test_empty_nodes_rejected(self):
        raw = _minimal_workflow()
        raw["nodes"] = []
        with pytest.raises(Exception):
            WorkflowDefinitionV1(**raw)

    def test_no_trigger_rejected(self):
        raw = _minimal_workflow()
        raw["nodes"] = [
            {"id": "n_email", "type": "email_send", "name": "Email", "config": {}},
            {"id": "n_end", "type": "end", "name": "End", "config": {}},
        ]
        raw["connections"] = [{"from": "n_email", "to": "n_end", "condition": "always", "order": 1}]
        with pytest.raises(Exception, match="trigger"):
            WorkflowDefinitionV1(**raw)

    def test_no_end_rejected(self):
        raw = _minimal_workflow()
        raw["nodes"] = [
            {"id": "n_trigger", "type": "trigger_manual", "name": "Start", "config": {}},
            {"id": "n_email", "type": "email_send", "name": "Email", "config": {}},
        ]
        raw["connections"] = [{"from": "n_trigger", "to": "n_email", "condition": "always", "order": 1}]
        with pytest.raises(Exception, match="end"):
            WorkflowDefinitionV1(**raw)

    def test_duplicate_node_ids_rejected(self):
        raw = _minimal_workflow()
        raw["nodes"].append({"id": "n_trigger", "type": "email_send", "name": "Dup", "config": {}})
        with pytest.raises(Exception, match="Duplicate"):
            WorkflowDefinitionV1(**raw)

    def test_connection_references_unknown_node(self):
        raw = _minimal_workflow()
        raw["connections"].append({"from": "n_end", "to": "n_nonexistent", "condition": "always", "order": 1})
        with pytest.raises(Exception, match="unknown node"):
            WorkflowDefinitionV1(**raw)

    def test_schema_version_must_be_1(self):
        raw = _minimal_workflow()
        raw["schema_version"] = 99
        with pytest.raises(Exception):
            WorkflowDefinitionV1(**raw)

    def test_node_id_format_enforced(self):
        """Node IDs must be alphanumeric + underscore."""
        raw = _minimal_workflow()
        raw["nodes"][0]["id"] = "node with spaces"
        with pytest.raises(Exception):
            WorkflowDefinitionV1(**raw)

    def test_max_node_executions_bounds(self):
        raw = _minimal_workflow()
        raw["settings"]["max_node_executions_per_lead"] = 0
        with pytest.raises(Exception):
            WorkflowDefinitionV1(**raw)

        raw["settings"]["max_node_executions_per_lead"] = 100001
        with pytest.raises(Exception):
            WorkflowDefinitionV1(**raw)


class TestNodeTypeEnum:
    def test_all_trigger_types_present(self):
        triggers = [t for t in NodeType if t.value.startswith("trigger_")]
        assert len(triggers) == 5

    def test_all_outreach_types_present(self):
        outreach = {NodeType.EMAIL_SEND, NodeType.LINKEDIN_CONNECT, NodeType.LINKEDIN_MESSAGE}
        for nt in outreach:
            assert nt in NodeType

    def test_all_ai_types_present(self):
        ai = {NodeType.AI_GENERATE_MESSAGE, NodeType.AI_CLASSIFY_REPLY, NodeType.AI_EXTRACT_FIELDS, NodeType.AI_DECISION}
        for nt in ai:
            assert nt in NodeType


class TestEdgeConditionEnum:
    def test_conditions(self):
        assert EdgeCondition.ALWAYS.value == "always"
        assert EdgeCondition.YES.value == "yes"
        assert EdgeCondition.NO.value == "no"
        assert EdgeCondition.TIMEOUT_ELAPSED.value == "timeout_elapsed"
        assert EdgeCondition.ERROR_CODE_MATCH.value == "error_code_match"


class TestConnectionParsing:
    def test_from_alias(self):
        """'from' key maps to from_node field via alias."""
        conn = WorkflowConnection(**{"from": "n_a", "to": "n_b", "condition": "always", "order": 1})
        assert conn.from_node == "n_a"
        assert conn.to == "n_b"


class TestWaitConfig:
    def test_zero_wait_rejected(self):
        with pytest.raises(Exception, match="wait time"):
            WaitConfig(days=0, hours=0)

    def test_positive_days_ok(self):
        wc = WaitConfig(days=3, hours=0)
        assert wc.days == 3

    def test_positive_hours_ok(self):
        wc = WaitConfig(days=0, hours=6)
        assert wc.hours == 6


# ===================================================================
# Validator service tests
# ===================================================================

class TestValidateWorkflowJson:
    def test_valid_minimal(self):
        result = validate_workflow_json(_minimal_workflow())
        assert result.valid is True
        assert len(result.errors) == 0

    def test_valid_full(self):
        result = validate_workflow_json(_full_workflow())
        assert result.valid is True
        assert len(result.errors) == 0
        # LinkedIn warning expected
        assert any("LinkedIn" in w for w in result.warnings)

    def test_invalid_json_returns_errors(self):
        result = validate_workflow_json({"schema_version": 1})
        assert result.valid is False
        assert len(result.errors) > 0

    def test_unreachable_node_detected(self):
        raw = _minimal_workflow()
        raw["nodes"].append({"id": "n_orphan", "type": "wait", "name": "Orphan", "config": {"days": 1}})
        result = validate_workflow_json(raw)
        assert result.valid is False
        assert any("Unreachable" in e.message for e in result.errors)

    def test_logic_node_no_edges(self):
        raw = _minimal_workflow()
        # Add an if node connected to trigger but with no outgoing edges
        raw["nodes"].insert(2, {"id": "n_if", "type": "if", "name": "Check", "config": {}})
        raw["connections"] = [
            {"from": "n_trigger", "to": "n_if", "condition": "always", "order": 1},
            # n_if has no outgoing edges — this should be an error
        ]
        # n_email and n_end are unreachable, plus n_if has no outgoing
        result = validate_workflow_json(raw)
        assert result.valid is False

    def test_non_terminal_no_outgoing_detected(self):
        raw = _minimal_workflow()
        # Remove n_email -> n_end connection
        raw["connections"] = [
            {"from": "n_trigger", "to": "n_email", "condition": "always", "order": 1},
        ]
        result = validate_workflow_json(raw)
        assert result.valid is False
        assert any("no outgoing" in e.message.lower() for e in result.errors)

    def test_cron_invalid_expression(self):
        raw = _minimal_workflow()
        raw["nodes"][0] = {
            "id": "n_trigger", "type": "trigger_cron", "name": "Cron",
            "config": {"cron_expression": "bad cron expression with too many parts"},
        }
        result = validate_workflow_json(raw)
        assert result.valid is False
        assert any("cron" in e.message.lower() for e in result.errors)

    def test_cron_empty_expression(self):
        raw = _minimal_workflow()
        raw["nodes"][0] = {
            "id": "n_trigger", "type": "trigger_cron", "name": "Cron",
            "config": {"cron_expression": ""},
        }
        result = validate_workflow_json(raw)
        assert result.valid is False

    def test_cron_valid_expression(self):
        raw = _minimal_workflow()
        raw["nodes"][0] = {
            "id": "n_trigger", "type": "trigger_cron", "name": "Cron",
            "config": {"cron_expression": "0 9 * * 1-5", "timezone": "UTC"},
        }
        result = validate_workflow_json(raw)
        assert result.valid is True


class TestParseWorkflowJson:
    def test_parse_valid(self):
        wf = parse_workflow_json(_minimal_workflow())
        assert isinstance(wf, WorkflowDefinitionV1)

    def test_parse_invalid_raises(self):
        with pytest.raises(Exception):
            parse_workflow_json({})


# ===================================================================
# Compilation tests
# ===================================================================

class TestCompileNodesAndEdges:
    def test_compile_minimal(self):
        wf = parse_workflow_json(_minimal_workflow())
        nodes, edges = compile_nodes_and_edges(wf)
        assert len(nodes) == 3
        assert len(edges) == 2

        trigger = next(n for n in nodes if n["node_id"] == "n_trigger")
        assert trigger["node_type"] == "trigger_manual"

    def test_compile_full(self):
        wf = parse_workflow_json(_full_workflow())
        nodes, edges = compile_nodes_and_edges(wf)
        assert len(nodes) == 7
        assert len(edges) == 7

        # Check edge conditions preserved
        if_yes = next(e for e in edges if e["from_node_id"] == "n_if_reply" and e["condition"] == "yes")
        assert if_yes["to_node_id"] == "n_end"

        if_no = next(e for e in edges if e["from_node_id"] == "n_if_reply" and e["condition"] == "no")
        assert if_no["to_node_id"] == "n_li_connect"

    def test_node_positions_preserved(self):
        wf = parse_workflow_json(_full_workflow())
        nodes, _ = compile_nodes_and_edges(wf)
        trigger = next(n for n in nodes if n["node_id"] == "n_trigger")
        assert trigger["position_x"] == 120.0
        assert trigger["position_y"] == 80.0

    def test_edge_order_preserved(self):
        wf = parse_workflow_json(_full_workflow())
        _, edges = compile_nodes_and_edges(wf)
        if_edges = [e for e in edges if e["from_node_id"] == "n_if_reply"]
        assert len(if_edges) == 2
        yes_edge = next(e for e in if_edges if e["condition"] == "yes")
        no_edge = next(e for e in if_edges if e["condition"] == "no")
        assert yes_edge["edge_order"] == 1
        assert no_edge["edge_order"] == 2


# ===================================================================
# Import / export roundtrip
# ===================================================================

class TestRoundtrip:
    def test_parse_then_export(self):
        """Parsing then exporting should produce equivalent JSON."""
        original = _full_workflow()
        wf = parse_workflow_json(original)
        exported = wf.model_dump(by_alias=True)

        assert exported["schema_version"] == original["schema_version"]
        assert exported["meta"]["name"] == original["meta"]["name"]
        assert len(exported["nodes"]) == len(original["nodes"])
        assert len(exported["connections"]) == len(original["connections"])

    def test_connections_use_from_alias_in_export(self):
        """Exported connections should use 'from' key, not 'from_node'."""
        wf = parse_workflow_json(_minimal_workflow())
        exported = wf.model_dump(by_alias=True)
        for conn in exported["connections"]:
            assert "from" in conn
            assert "from_node" not in conn


# ===================================================================
# V2 Schema Tests
# ===================================================================

class TestWorkflowNodeV2Blocks:
    """Test V2 universal blocks on WorkflowNode."""

    def test_v2_defaults_valid(self):
        """V2 fields have sensible defaults."""
        node = WorkflowNode(id="n_test", type="email_send", name="Test", config={})
        assert node.enabled is True
        assert node.version == 1
        assert node.description == ""
        assert node.input_mapping == []
        assert node.output_mapping == []
        assert node.output_schema == []
        assert node.execution.timeout_ms == 30000
        assert node.rate_limit.enabled is False
        assert node.security.credential_ref == ""
        assert node.observability.log_level.value == "info"

    def test_v2_blocks_round_trip(self):
        from app.schemas.workflow import (
            InputMapping, OutputMapping, OutputDeclaration,
            NodeExecution, RetryPolicy, RateLimit, SecurityPolicy,
            Observability, NodeUI, Position,
        )
        node = WorkflowNode(
            id="n_test", type="email_send", name="Test", config={},
            description="Test node",
            enabled=False,
            input_mapping=[InputMapping(source="lead.email", target="to_email")],
            output_mapping=[OutputMapping(source="message_id", target="msg_id")],
            output_schema=[OutputDeclaration(key="message_id", type="string")],
            execution=NodeExecution(timeout_ms=5000, retry_policy=RetryPolicy(enabled=True, max_attempts=2)),
            rate_limit=RateLimit(enabled=True, max_per_minute=10),
            security=SecurityPolicy(redact_output_keys=["secret_field"]),
            observability=Observability(sample_rate=0.5),
            ui=NodeUI(position=Position(x=100, y=200), color_override="#ff0000"),
        )
        data = node.model_dump()
        restored = WorkflowNode(**data)
        assert restored.description == "Test node"
        assert restored.enabled is False
        assert len(restored.input_mapping) == 1
        assert restored.input_mapping[0].source == "lead.email"
        assert restored.execution.retry_policy.enabled is True
        assert restored.rate_limit.max_per_minute == 10
        assert restored.security.redact_output_keys == ["secret_field"]
        assert restored.ui.color_override == "#ff0000"

    def test_execution_timeout_bounds(self):
        from app.schemas.workflow import NodeExecution
        with pytest.raises(Exception):
            NodeExecution(timeout_ms=500)  # too low (min 1000)
        with pytest.raises(Exception):
            NodeExecution(timeout_ms=500000)  # too high (max 300000)

    def test_rate_limit_bounds(self):
        from app.schemas.workflow import RateLimit
        rl = RateLimit(enabled=True, max_per_minute=60, max_per_hour=1000)
        assert rl.max_per_minute == 60

    def test_output_declaration_version(self):
        from app.schemas.workflow import OutputDeclaration
        od = OutputDeclaration(key="test", type="string", version=2, sample_value="hello")
        assert od.version == 2
        assert od.sample_value == "hello"


class TestV1ToV2Migration:
    """Test V1 -> V2 migration function."""

    def test_migrate_sets_schema_version_2(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        result = migrate_v1_to_v2(raw)
        assert result["schema_version"] == 2

    def test_migrate_adds_max_context_size_bytes(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        result = migrate_v1_to_v2(raw)
        assert result["settings"]["max_context_size_bytes"] == 512_000

    def test_migrate_promotes_position_to_ui(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        raw["nodes"][0]["position"] = {"x": 100, "y": 200}
        result = migrate_v1_to_v2(raw)
        assert result["nodes"][0]["ui"]["position"] == {"x": 100, "y": 200}

    def test_migrate_adds_default_blocks(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        result = migrate_v1_to_v2(raw)
        node = result["nodes"][0]
        assert node["enabled"] is True
        assert node["description"] == ""
        assert node["input_mapping"] == []
        assert node["output_mapping"] == []
        assert "execution" in node
        assert "rate_limit" in node

    def test_migrate_populates_output_schema(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        result = migrate_v1_to_v2(raw)
        email_node = next(n for n in result["nodes"] if n["type"] == "email_send")
        assert len(email_node["output_schema"]) > 0
        assert any(o["key"] == "message_id" for o in email_node["output_schema"])

    def test_migrate_idempotent(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        v2 = migrate_v1_to_v2(raw)
        v2_again = migrate_v1_to_v2(v2)
        assert v2_again["schema_version"] == 2
        # Should not double-wrap
        assert v2_again == v2

    def test_migrate_preserves_config(self):
        from app.schemas.workflow import migrate_v1_to_v2
        raw = _minimal_workflow()
        raw["nodes"][1]["config"] = {"template_id": "tpl_123"}
        result = migrate_v1_to_v2(raw)
        email_node = next(n for n in result["nodes"] if n["type"] == "email_send")
        assert email_node["config"]["template_id"] == "tpl_123"


class TestExecutionContext:
    """Test ExecutionContext envelope."""

    def test_default_construction(self):
        from app.schemas.workflow import ExecutionContext
        ctx = ExecutionContext()
        assert ctx.lead == {}
        assert ctx.vars == {}
        assert ctx.node_outputs == {}
        assert ctx.trigger.type == ""

    def test_with_data(self):
        from app.schemas.workflow import ExecutionContext, TriggerMeta
        ctx = ExecutionContext(
            lead={"email": "test@example.com", "first_name": "Test"},
            trigger=TriggerMeta(type="manual", payload={"source": "ui"}),
            vars={"campaign_type": "outbound"},
            node_outputs={"n_email_1": {"message_id": "msg_123"}},
        )
        assert ctx.lead["email"] == "test@example.com"
        assert ctx.trigger.type == "manual"
        assert ctx.vars["campaign_type"] == "outbound"
        assert ctx.node_outputs["n_email_1"]["message_id"] == "msg_123"

    def test_round_trip(self):
        from app.schemas.workflow import ExecutionContext
        ctx = ExecutionContext(
            lead={"id": "lead_1"},
            node_outputs={"n1": {"key": "value"}},
        )
        data = ctx.model_dump()
        restored = ExecutionContext(**data)
        assert restored.lead["id"] == "lead_1"
        assert restored.node_outputs["n1"]["key"] == "value"


class TestEnrichedConfigs:
    """Test enriched V2 per-type config models."""

    def test_http_request_auth_modes(self):
        from app.schemas.workflow import HttpRequestConfig, AuthMode
        cfg = HttpRequestConfig(url="https://api.example.com", auth_mode=AuthMode.BEARER_TOKEN)
        assert cfg.auth_mode == AuthMode.BEARER_TOKEN
        assert cfg.ssrf_protection is True

    def test_http_request_defaults(self):
        from app.schemas.workflow import HttpRequestConfig
        cfg = HttpRequestConfig(url="https://api.example.com")
        assert cfg.method == "POST"
        assert cfg.ssrf_protection is True
        assert "Authorization" in cfg.redact_request_headers

    def test_email_send_thread_modes(self):
        from app.schemas.workflow import EmailSendConfig
        cfg = EmailSendConfig(template_id="tpl_1", thread_mode="reply")
        assert cfg.thread_mode == "reply"
        assert cfg.unsubscribe_link is True

    def test_ai_generate_config(self):
        from app.schemas.workflow import AiGenerateMessageConfig
        cfg = AiGenerateMessageConfig(
            prompt_template="Write intro",
            system_prompt="You are a sales rep",
            model_ref="gpt-4",
            max_cost_cents=5.0,
        )
        assert cfg.model_ref == "gpt-4"
        assert cfg.max_cost_cents == 5.0

    def test_wait_config_minutes(self):
        wc = WaitConfig(days=0, hours=0, minutes=30)
        assert wc.minutes == 30

    def test_wait_config_until_time(self):
        wc = WaitConfig(days=0, hours=0, minutes=0, until_time="09:00")
        assert wc.until_time == "09:00"

    def test_linkedin_connect_config(self):
        from app.schemas.workflow import LinkedInConnectConfig
        cfg = LinkedInConnectConfig(
            message_template="Hi {{first_name}}!",
            wait_for_acceptance_days=14,
        )
        assert cfg.wait_for_acceptance_days == 14
        assert cfg.skip_if_already_connected is True


class TestNodeConfigTypeValidation:
    """Test NODE_CONFIG_MODELS typed config validation."""

    def test_all_node_types_have_config_model(self):
        from app.schemas.workflow import NODE_CONFIG_MODELS
        expected = {
            "trigger_manual", "trigger_new_lead", "trigger_list_membership_added",
            "trigger_inbound_webhook", "trigger_cron",
            "email_send", "linkedin_connect", "linkedin_message", "auto_respond",
            "wait", "end", "if", "switch", "merge",
            "http_request", "outgoing_webhook",
            "ai_generate_message", "ai_classify_reply", "ai_extract_fields", "ai_decision",
            "add_note", "create_task", "approval_gate",
            "data_campaign", "data_lead_list",
        }
        assert set(NODE_CONFIG_MODELS.keys()) == expected

    def test_config_models_accept_empty_dict(self):
        from app.schemas.workflow import NODE_CONFIG_MODELS
        # All config models except those with required fields should work with {}
        skip = {"trigger_cron", "wait"}  # trigger_cron: required cron_expression; wait: requires >0 time
        for node_type, model_cls in NODE_CONFIG_MODELS.items():
            if node_type in skip:
                continue
            model_cls(**{})  # Should not raise


class TestNodeDefaultOutputs:
    """Test NODE_DEFAULT_OUTPUTS registry."""

    def test_all_node_types_have_defaults(self):
        from app.schemas.workflow import NODE_DEFAULT_OUTPUTS
        expected_types = {
            "email_send", "http_request", "ai_generate_message", "ai_classify_reply",
            "ai_extract_fields", "ai_decision", "linkedin_connect", "linkedin_message",
            "if", "switch", "wait", "add_note", "create_task", "approval_gate",
            "outgoing_webhook", "merge", "end",
            "trigger_manual", "trigger_new_lead", "trigger_list_membership_added",
            "trigger_inbound_webhook", "trigger_cron",
        }
        for t in expected_types:
            assert t in NODE_DEFAULT_OUTPUTS, f"Missing default outputs for {t}"
            assert len(NODE_DEFAULT_OUTPUTS[t]) > 0, f"Empty default outputs for {t}"

    def test_default_outputs_have_required_fields(self):
        from app.schemas.workflow import NODE_DEFAULT_OUTPUTS
        for node_type, outputs in NODE_DEFAULT_OUTPUTS.items():
            for o in outputs:
                assert "key" in o, f"Missing 'key' in {node_type} output"
                assert "type" in o, f"Missing 'type' in {node_type} output"
                assert "description" in o, f"Missing 'description' in {node_type} output"


class TestBackwardCompatibility:
    """Test that V1 workflows still validate as V2."""

    def test_v1_workflow_validates_through_v2_pipeline(self):
        """V1 workflow should pass through validator (which auto-migrates to V2)."""
        result = validate_workflow_json(_minimal_workflow())
        assert result.valid is True

    def test_v1_workflow_parse_roundtrip(self):
        original = _minimal_workflow()
        wf = parse_workflow_json(original)
        exported = wf.model_dump(by_alias=True)
        assert len(exported["nodes"]) == len(original["nodes"])
        # V1 nodes should still have config preserved
        email_node = next(n for n in exported["nodes"] if n["type"] == "email_send")
        assert "config" in email_node

    def test_v2_compile_includes_v2_blocks(self):
        """Compiled nodes should include V2 metadata in config_json."""
        from app.schemas.workflow import WorkflowDefinitionV2, migrate_v1_to_v2
        raw = migrate_v1_to_v2(_minimal_workflow())
        wf = WorkflowDefinitionV2(**raw)
        nodes, edges = compile_nodes_and_edges(wf)
        trigger = next(n for n in nodes if n["node_id"] == "n_trigger")
        assert "_v2" in trigger["config_json"]
        assert "execution" in trigger["config_json"]["_v2"]
        assert "observability" in trigger["config_json"]["_v2"]
