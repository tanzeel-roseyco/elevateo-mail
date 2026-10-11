"""Workflow simulation — dry-run a lead's path through a workflow graph.

Given a workflow definition and a set of scenario assumptions (e.g., email replied,
linkedin accepted), the simulator traces which nodes would be visited and in what order.
No side effects, no DB writes — pure graph traversal.

V2: Supports disabled nodes (skipped), minutes in WaitConfig, mock ExecutionContext
with sample data from NODE_DEFAULT_OUTPUTS, and per-step input/output diffs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.schemas.workflow import NODE_DEFAULT_OUTPUTS


@dataclass
class SimulationStep:
    """One step in a simulated lead journey."""
    node_id: str
    node_type: str
    node_name: str
    action: str  # "execute", "wait", "branch_yes", "branch_no", "end", "skip"
    detail: str = ""
    description: str = ""
    inputs: dict[str, Any] = field(default_factory=dict)
    outputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class SimulationResult:
    """Full simulation output."""
    steps: list[SimulationStep] = field(default_factory=list)
    reached_end: bool = False
    error: str | None = None
    total_nodes_visited: int = 0
    warnings: list[str] = field(default_factory=list)
    context_snapshot: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScenarioAssumptions:
    """What the lead does during the simulation."""
    email_replied: bool = False
    email_opened: bool = True
    email_clicked: bool = False
    linkedin_accepted: bool = True
    linkedin_replied: bool = False
    has_linkedin_url: bool = True
    http_success: bool = True
    ai_confidence_above_threshold: bool = True
    lead_data: dict[str, Any] = field(default_factory=dict)

    def evaluate_condition(self, condition: str) -> bool:
        """Evaluate a condition name against scenario assumptions."""
        mapping = {
            "email_replied": self.email_replied,
            "email_not_replied": not self.email_replied,
            "email_opened": self.email_opened,
            "email_not_opened": not self.email_opened,
            "email_clicked": self.email_clicked,
            "email_not_clicked": not self.email_clicked,
            "linkedin_accepted": self.linkedin_accepted,
            "linkedin_not_accepted": not self.linkedin_accepted,
            "linkedin_replied": self.linkedin_replied,
            "linkedin_not_replied": not self.linkedin_replied,
            "has_linkedin_url": self.has_linkedin_url,
            "no_linkedin_url": not self.has_linkedin_url,
        }
        return mapping.get(condition, True)


def _build_sample_outputs(node_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Build sample output values for a node from NODE_DEFAULT_OUTPUTS or pin_sample_data."""
    # Check for pinned sample data in V2 ui block
    ui = config.get("_v2", {}).get("ui", {}) if isinstance(config, dict) else {}
    pin = ui.get("pin_sample_data")
    if pin and isinstance(pin, dict):
        return dict(pin)

    # Check output_schema for sample_value
    output_schema = config.get("_v2", {}).get("output_schema", []) if isinstance(config, dict) else []
    if output_schema:
        samples = {}
        for decl in output_schema:
            key = decl.get("key", "")
            if key:
                samples[key] = decl.get("sample_value")
        if any(v is not None for v in samples.values()):
            return samples

    # Fall back to NODE_DEFAULT_OUTPUTS
    defaults = NODE_DEFAULT_OUTPUTS.get(node_type, [])
    return {d["key"]: d.get("sample_value") for d in defaults}


def _resolve_input_mappings(
    input_mapping: list[dict[str, Any]],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Resolve input mappings from context for simulation display."""
    resolved = {}
    for mapping in input_mapping:
        source = mapping.get("source", "")
        target = mapping.get("target", "")
        if not source or not target:
            continue

        # Walk the source path
        parts = source.split(".")
        value = context
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                value = None
                break
        resolved[target] = value
    return resolved


def simulate_workflow(
    workflow_json: dict[str, Any],
    scenario: ScenarioAssumptions | None = None,
    max_steps: int = 100,
) -> SimulationResult:
    """Simulate a lead's path through a workflow definition.

    Args:
        workflow_json: The canonical workflow JSON (V1 or V2 format).
        scenario: Assumptions about lead behavior. Defaults to optimistic.
        max_steps: Safety cap to prevent infinite loops.

    Returns:
        SimulationResult with the ordered list of steps the lead would visit.
    """
    if scenario is None:
        scenario = ScenarioAssumptions()

    result = SimulationResult()

    nodes_raw = workflow_json.get("nodes", [])
    connections = workflow_json.get("connections", [])

    # Build lookup maps
    nodes: dict[str, dict[str, Any]] = {}
    for n in nodes_raw:
        nodes[n["id"]] = n

    # Build adjacency: node_id -> list of (target_id, condition, order)
    adj: dict[str, list[tuple[str, str, int]]] = {}
    for c in connections:
        from_id = c.get("from", c.get("source", ""))
        to_id = c.get("to", c.get("target", ""))
        condition = c.get("condition", "always")
        order = c.get("order", 0)
        adj.setdefault(from_id, []).append((to_id, condition, order))

    # Sort adjacency by order for determinism
    for k in adj:
        adj[k].sort(key=lambda x: x[2])

    # Find trigger node (first trigger type)
    trigger_id: str | None = None
    for n in nodes_raw:
        if n.get("type", "").startswith("trigger_"):
            trigger_id = n["id"]
            break

    if not trigger_id:
        result.error = "No trigger node found"
        return result

    # Build mock execution context for V2 simulations
    mock_context: dict[str, Any] = {
        "lead": scenario.lead_data or {
            "id": "sim-lead-001",
            "email": "lead@example.com",
            "first_name": "Test",
            "last_name": "Lead",
            "linkedin_url": "https://linkedin.com/in/testlead" if scenario.has_linkedin_url else "",
        },
        "trigger": {"type": "simulation", "payload": {}},
        "vars": {},
        "node_outputs": {},
    }

    # Walk the graph
    current_id: str | None = trigger_id
    visited: set[str] = set()
    step_count = 0

    while current_id and step_count < max_steps:
        if current_id in visited:
            result.warnings.append(f"Loop detected at node {current_id}")
            break
        visited.add(current_id)

        node = nodes.get(current_id)
        if not node:
            result.error = f"Node {current_id} not found in definition"
            break

        node_type = node.get("type", "unknown")
        node_name = node.get("name", node_type)
        config = node.get("config", {})
        node_desc = node.get("description", "")

        # V2: Check enabled flag — skip disabled nodes
        enabled = node.get("enabled", True)
        if not enabled:
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="skip", detail="Node disabled — auto-advancing",
                description=node_desc,
            ))
            # Follow 'always' edge to next node
            outgoing = adj.get(current_id, [])
            next_id = None
            for target, cond, _ in outgoing:
                if cond == "always":
                    next_id = target
                    break
            if not next_id and outgoing:
                next_id = outgoing[0][0]
            current_id = next_id
            step_count += 1
            result.total_nodes_visited = step_count
            continue

        # V2: Resolve input mappings for display
        input_mapping = node.get("input_mapping", [])
        resolved_inputs = _resolve_input_mappings(input_mapping, mock_context)

        # Build sample outputs for this node
        sample_outputs = _build_sample_outputs(node_type, config)

        # Determine step action
        if node_type == "end":
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="end", detail="Lead journey ends",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))
            result.reached_end = True
            step_count += 1
            mock_context["node_outputs"][current_id] = sample_outputs
            break

        elif node_type == "wait":
            days = config.get("days", 0)
            hours = config.get("hours", 0)
            minutes = config.get("minutes", 0)
            parts = []
            if days:
                parts.append(f"{days}d")
            if hours:
                parts.append(f"{hours}h")
            if minutes:
                parts.append(f"{minutes}m")
            wait_str = " ".join(parts) if parts else "0m"
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="wait", detail=f"Wait {wait_str}",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type == "if":
            condition = config.get("condition", "email_replied")
            negate = config.get("negate", False)
            met = scenario.evaluate_condition(condition)
            if negate:
                met = not met
            branch = "yes" if met else "no"
            step_outputs = {"condition_met": met, "evaluated_expression": condition}
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action=f"branch_{branch}",
                detail=f"Condition '{condition}'{' (negated)' if negate else ''} -> {branch}",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=step_outputs,
            ))
            mock_context["node_outputs"][current_id] = step_outputs
            # Find the correct branch edge
            outgoing = adj.get(current_id, [])
            next_id = None
            for target, cond, _ in outgoing:
                if cond == branch:
                    next_id = target
                    break
            if not next_id:
                # Fallback to 'always' edge
                for target, cond, _ in outgoing:
                    if cond == "always":
                        next_id = target
                        break
            current_id = next_id
            step_count += 1
            result.total_nodes_visited = step_count
            continue  # Skip the normal edge resolution below

        elif node_type.startswith("trigger_"):
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail="Trigger fires",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type in ("email_send", "linkedin_connect", "linkedin_message"):
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail=f"Execute {node_type.replace('_', ' ')}",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type == "merge":
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail="Merge point (passthrough)",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type.startswith("ai_"):
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail=f"AI: {node_type.replace('ai_', '').replace('_', ' ')}",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type in ("http_request", "outgoing_webhook"):
            success = scenario.http_success
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute",
                detail=f"HTTP {'succeeds' if success else 'fails'} (simulated)",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type in ("add_note", "create_task", "approval_gate"):
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail=f"Collaboration: {node_type.replace('_', ' ')}",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        elif node_type == "switch":
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail="Switch (first matching branch)",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        else:
            result.steps.append(SimulationStep(
                node_id=current_id, node_type=node_type, node_name=node_name,
                action="execute", detail=f"Execute {node_type}",
                description=node_desc,
                inputs=resolved_inputs,
                outputs=sample_outputs,
            ))

        # Store sample outputs in mock context for downstream mapping
        mock_context["node_outputs"][current_id] = sample_outputs

        # Follow 'always' edge to next node
        outgoing = adj.get(current_id, [])
        next_id = None
        for target, cond, _ in outgoing:
            if cond == "always":
                next_id = target
                break
        if not next_id and outgoing:
            # Take the first edge if no explicit always
            next_id = outgoing[0][0]

        current_id = next_id
        step_count += 1

    result.total_nodes_visited = step_count
    result.context_snapshot = mock_context

    if step_count >= max_steps:
        result.warnings.append(f"Simulation stopped after {max_steps} steps (safety cap)")

    if not result.reached_end and not result.error:
        result.warnings.append("Lead did not reach an end node")

    return result
