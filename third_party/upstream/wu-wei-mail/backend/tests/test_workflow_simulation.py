"""Tests for workflow simulation (Section 20 Item #12)."""

import pytest

from app.services.workflow.simulator import (
    simulate_workflow,
    ScenarioAssumptions,
    SimulationResult,
)


# ── Helper to build minimal workflow JSON ─────────────────────

def _workflow(*nodes, connections=None):
    """Build a minimal workflow JSON dict."""
    return {
        "schema_version": 1,
        "workflow_version": 1,
        "meta": {"name": "Test", "description": "", "tags": []},
        "settings": {"timezone": "UTC", "prevent_same_day_cross_channel_touch": False, "max_node_executions_per_lead": 50},
        "nodes": list(nodes),
        "connections": connections or [],
        "variables": {},
        "credentials_refs": {},
        "canvas_notes": [],
        "trigger_policies": {"dedupe_window_minutes": 60, "max_catch_up_runs": 10},
    }


def _node(id: str, type: str, name: str = "", config: dict | None = None):
    return {"id": id, "type": type, "name": name or type, "position": {"x": 0, "y": 0}, "config": config or {}}


def _conn(from_id: str, to_id: str, condition: str = "always", order: int = 0):
    return {"from": from_id, "to": to_id, "condition": condition, "order": order}


# ── Tests ─────────────────────────────────────────────────────

class TestSimulationBasic:
    def test_simple_linear_workflow(self):
        wf = _workflow(
            _node("t", "trigger_manual", "Start"),
            _node("e", "email_send", "Send Email"),
            _node("w", "wait", "Wait 2d", {"days": 2, "hours": 0}),
            _node("end", "end", "End"),
            connections=[
                _conn("t", "e"), _conn("e", "w"), _conn("w", "end"),
            ],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        assert len(result.steps) == 4
        assert result.steps[0].action == "execute"
        assert result.steps[1].action == "execute"
        assert result.steps[2].action == "wait"
        assert result.steps[2].detail == "Wait 2d"
        assert result.steps[3].action == "end"

    def test_no_trigger_node(self):
        wf = _workflow(
            _node("e", "email_send"),
            _node("end", "end"),
            connections=[_conn("e", "end")],
        )
        result = simulate_workflow(wf)
        assert result.error == "No trigger node found"

    def test_empty_workflow(self):
        wf = _workflow()
        result = simulate_workflow(wf)
        assert result.error == "No trigger node found"

    def test_max_steps_cap(self):
        # Create a loop: trigger -> email -> trigger (would loop)
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("e", "email_send"),
            connections=[_conn("t", "e"), _conn("e", "t")],
        )
        result = simulate_workflow(wf, max_steps=5)
        # Loop detection should catch this before max_steps
        assert "Loop detected" in result.warnings[0]

    def test_dead_end_warning(self):
        """Node with no outgoing edges and not an end node."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("e", "email_send"),
            connections=[_conn("t", "e")],
        )
        result = simulate_workflow(wf)
        assert not result.reached_end
        assert any("end node" in w.lower() for w in result.warnings)


class TestSimulationBranching:
    def test_if_yes_branch(self):
        """Email replied → takes yes branch."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("check", "if", "Check Reply", {"condition": "email_replied"}),
            _node("reply", "email_send", "Reply Handler"),
            _node("followup", "email_send", "Follow Up"),
            _node("end", "end"),
            connections=[
                _conn("t", "check"),
                _conn("check", "reply", "yes"),
                _conn("check", "followup", "no"),
                _conn("reply", "end"),
                _conn("followup", "end"),
            ],
        )
        scenario = ScenarioAssumptions(email_replied=True)
        result = simulate_workflow(wf, scenario)
        assert result.reached_end
        assert result.steps[1].action == "branch_yes"
        assert result.steps[2].node_id == "reply"

    def test_if_no_branch(self):
        """Email not replied → takes no branch."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("check", "if", "Check Reply", {"condition": "email_replied"}),
            _node("reply", "email_send", "Reply Handler"),
            _node("followup", "email_send", "Follow Up"),
            _node("end", "end"),
            connections=[
                _conn("t", "check"),
                _conn("check", "reply", "yes"),
                _conn("check", "followup", "no"),
                _conn("reply", "end"),
                _conn("followup", "end"),
            ],
        )
        scenario = ScenarioAssumptions(email_replied=False)
        result = simulate_workflow(wf, scenario)
        assert result.reached_end
        assert result.steps[1].action == "branch_no"
        assert result.steps[2].node_id == "followup"

    def test_linkedin_condition(self):
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("check", "if", "Has LI?", {"condition": "has_linkedin_url"}),
            _node("li", "linkedin_connect", "Connect"),
            _node("email", "email_send", "Email Only"),
            _node("end", "end"),
            connections=[
                _conn("t", "check"),
                _conn("check", "li", "yes"),
                _conn("check", "email", "no"),
                _conn("li", "end"),
                _conn("email", "end"),
            ],
        )
        # With LinkedIn URL
        result1 = simulate_workflow(wf, ScenarioAssumptions(has_linkedin_url=True))
        assert result1.steps[2].node_id == "li"

        # Without LinkedIn URL
        result2 = simulate_workflow(wf, ScenarioAssumptions(has_linkedin_url=False))
        assert result2.steps[2].node_id == "email"


class TestSimulationNodeTypes:
    def test_linkedin_nodes(self):
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("connect", "linkedin_connect", "Connect"),
            _node("msg", "linkedin_message", "Message"),
            _node("end", "end"),
            connections=[_conn("t", "connect"), _conn("connect", "msg"), _conn("msg", "end")],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        assert result.steps[1].node_type == "linkedin_connect"
        assert result.steps[2].node_type == "linkedin_message"

    def test_ai_nodes(self):
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("gen", "ai_generate_message", "Generate"),
            _node("classify", "ai_classify_reply", "Classify"),
            _node("end", "end"),
            connections=[_conn("t", "gen"), _conn("gen", "classify"), _conn("classify", "end")],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        assert "AI" in result.steps[1].detail
        assert "AI" in result.steps[2].detail

    def test_http_request_node(self):
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("http", "http_request", "API Call"),
            _node("end", "end"),
            connections=[_conn("t", "http"), _conn("http", "end")],
        )
        result = simulate_workflow(wf, ScenarioAssumptions(http_success=True))
        assert result.reached_end
        assert "succeeds" in result.steps[1].detail

    def test_collaboration_nodes(self):
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("note", "add_note", "Add Note"),
            _node("task", "create_task", "Create Task"),
            _node("end", "end"),
            connections=[_conn("t", "note"), _conn("note", "task"), _conn("task", "end")],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        assert result.steps[1].node_type == "add_note"
        assert result.steps[2].node_type == "create_task"

    def test_merge_node(self):
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("m", "merge", "Merge"),
            _node("end", "end"),
            connections=[_conn("t", "m"), _conn("m", "end")],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        assert "passthrough" in result.steps[1].detail.lower()


class TestScenarioAssumptions:
    def test_default_scenario(self):
        s = ScenarioAssumptions()
        assert s.email_replied is False
        assert s.email_opened is True
        assert s.linkedin_accepted is True
        assert s.has_linkedin_url is True

    def test_evaluate_conditions(self):
        s = ScenarioAssumptions(email_replied=True, linkedin_accepted=False)
        assert s.evaluate_condition("email_replied") is True
        assert s.evaluate_condition("email_not_replied") is False
        assert s.evaluate_condition("linkedin_accepted") is False
        assert s.evaluate_condition("linkedin_not_accepted") is True

    def test_unknown_condition_defaults_true(self):
        s = ScenarioAssumptions()
        assert s.evaluate_condition("some_unknown_condition") is True


class TestSimulationMultichannel:
    def test_email_then_linkedin_with_condition(self):
        """Realistic flow: email → check reply → if no: wait → linkedin → end."""
        wf = _workflow(
            _node("t", "trigger_manual", "Start"),
            _node("email", "email_send", "Initial Email"),
            _node("wait1", "wait", "Wait 3d", {"days": 3}),
            _node("check", "if", "Got Reply?", {"condition": "email_replied"}),
            _node("end_replied", "end", "Done (replied)"),
            _node("li_check", "if", "Has LinkedIn?", {"condition": "has_linkedin_url"}),
            _node("connect", "linkedin_connect", "Connect on LI"),
            _node("wait2", "wait", "Wait 5d", {"days": 5}),
            _node("li_msg", "linkedin_message", "LI Message"),
            _node("end_done", "end", "Done"),
            connections=[
                _conn("t", "email"),
                _conn("email", "wait1"),
                _conn("wait1", "check"),
                _conn("check", "end_replied", "yes"),
                _conn("check", "li_check", "no"),
                _conn("li_check", "connect", "yes"),
                _conn("li_check", "end_done", "no"),
                _conn("connect", "wait2"),
                _conn("wait2", "li_msg"),
                _conn("li_msg", "end_done"),
            ],
        )

        # Scenario: no reply, has linkedin
        result = simulate_workflow(
            wf,
            ScenarioAssumptions(email_replied=False, has_linkedin_url=True),
        )
        assert result.reached_end
        node_types = [s.node_type for s in result.steps]
        assert "email_send" in node_types
        assert "linkedin_connect" in node_types
        assert "linkedin_message" in node_types

        # Scenario: replied → short circuit
        result2 = simulate_workflow(
            wf,
            ScenarioAssumptions(email_replied=True),
        )
        assert result2.reached_end
        assert result2.total_nodes_visited < result.total_nodes_visited
        assert result2.steps[-1].node_id == "end_replied"


class TestSimulationV2Features:
    """Test V2 simulation features."""

    def test_disabled_node_skipped(self):
        """Disabled nodes should be skipped with 'skip' action."""
        wf = _workflow(
            _node("t", "trigger_manual", "Start"),
            {"id": "e", "type": "email_send", "name": "Disabled Email", "position": {"x": 0, "y": 0}, "config": {}, "enabled": False},
            _node("end", "end", "End"),
            connections=[_conn("t", "e"), _conn("e", "end")],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        assert any(s.action == "skip" for s in result.steps)
        skipped = next(s for s in result.steps if s.action == "skip")
        assert skipped.node_id == "e"

    def test_wait_minutes(self):
        """Wait node with minutes field."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("w", "wait", "Wait 30m", {"days": 0, "hours": 0, "minutes": 30}),
            _node("end", "end"),
            connections=[_conn("t", "w"), _conn("w", "end")],
        )
        result = simulate_workflow(wf)
        assert result.reached_end
        wait_step = next(s for s in result.steps if s.action == "wait")
        assert "30m" in wait_step.detail

    def test_if_negate(self):
        """If node with negate flag."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("check", "if", "Not Replied?", {"condition": "email_replied", "negate": True}),
            _node("a", "email_send", "Path A"),
            _node("b", "email_send", "Path B"),
            _node("end", "end"),
            connections=[
                _conn("t", "check"),
                _conn("check", "a", "yes"),
                _conn("check", "b", "no"),
                _conn("a", "end"),
                _conn("b", "end"),
            ],
        )
        # email_replied=False, negated = True -> yes branch
        result = simulate_workflow(wf, ScenarioAssumptions(email_replied=False))
        assert result.steps[1].action == "branch_yes"
        assert result.steps[2].node_id == "a"

    def test_simulation_has_outputs(self):
        """Steps should include outputs dict."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("e", "email_send", "Email"),
            _node("end", "end"),
            connections=[_conn("t", "e"), _conn("e", "end")],
        )
        result = simulate_workflow(wf)
        email_step = next(s for s in result.steps if s.node_type == "email_send")
        assert isinstance(email_step.outputs, dict)

    def test_simulation_has_context_snapshot(self):
        """Result should include context snapshot with node_outputs."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("e", "email_send", "Email"),
            _node("end", "end"),
            connections=[_conn("t", "e"), _conn("e", "end")],
        )
        result = simulate_workflow(wf)
        assert "node_outputs" in result.context_snapshot
        assert "lead" in result.context_snapshot

    def test_description_in_step(self):
        """V2 description should appear in simulation steps."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            {"id": "e", "type": "email_send", "name": "Email", "position": {"x": 0, "y": 0},
             "config": {}, "description": "Send initial outreach email"},
            _node("end", "end"),
            connections=[_conn("t", "e"), _conn("e", "end")],
        )
        result = simulate_workflow(wf)
        email_step = next(s for s in result.steps if s.node_type == "email_send")
        assert email_step.description == "Send initial outreach email"

    def test_custom_lead_data(self):
        """Scenario with custom lead data should be used in context."""
        wf = _workflow(
            _node("t", "trigger_manual"),
            _node("end", "end"),
            connections=[_conn("t", "end")],
        )
        scenario = ScenarioAssumptions(lead_data={"email": "custom@test.com", "first_name": "Custom"})
        result = simulate_workflow(wf, scenario)
        assert result.context_snapshot["lead"]["email"] == "custom@test.com"
