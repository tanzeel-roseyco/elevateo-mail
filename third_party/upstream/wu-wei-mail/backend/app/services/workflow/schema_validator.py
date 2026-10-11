"""Workflow JSON validator — validates and compiles canonical workflow JSON.

Responsibilities:
1. Auto-detect schema version, migrate V1 → V2 if needed.
2. Parse raw JSON dict through WorkflowDefinitionV2 Pydantic model.
3. Run structural graph validations (reachability, determinism, loops).
4. Per-node typed config validation via NODE_CONFIG_MODELS registry.
5. Input/output wiring validation.
6. Context size estimation.
7. Return WorkflowValidationResult with errors/warnings.
8. Compile canonical JSON into runtime WorkflowNode/WorkflowEdge rows.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any

from pydantic import ValidationError

from app.schemas.workflow import (
    EdgeCondition,
    NodeType,
    NODE_CONFIG_MODELS,
    NODE_DEFAULT_OUTPUTS,
    TRIGGER_NODE_TYPES,
    WorkflowConnection,
    WorkflowDefinitionV1,
    WorkflowDefinitionV2,
    WorkflowNode as SchemaNode,
    WorkflowValidationError,
    WorkflowValidationResult,
    migrate_v1_to_v2,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_workflow_json(raw: dict[str, Any]) -> WorkflowValidationResult:
    """Full validation of a workflow JSON dict.

    Returns a WorkflowValidationResult with .valid, .errors, and .warnings.
    """
    errors: list[WorkflowValidationError] = []
    warnings: list[str] = []

    # Phase 0: Auto-detect version and migrate
    version = raw.get("schema_version", 1)
    if version < 2:
        raw = migrate_v1_to_v2(raw)

    # Phase 1: Pydantic structural validation (use V2 model)
    try:
        wf = WorkflowDefinitionV2(**raw)
    except ValidationError as exc:
        for err in exc.errors():
            loc = " -> ".join(str(p) for p in err["loc"])
            errors.append(WorkflowValidationError(path=loc, message=err["msg"]))
        return WorkflowValidationResult(valid=False, errors=errors, warnings=warnings)

    # Phase 2: Graph reachability
    _check_reachability(wf, errors, warnings)

    # Phase 3: Determinism — condition nodes must have ordered edges with fallback
    _check_edge_determinism(wf, errors, warnings)

    # Phase 4: Channel dependency hints
    _check_channel_hints(wf, warnings)

    # Phase 5: Cron-specific validation
    _check_cron_triggers(wf, errors, warnings)

    # Phase 6: Per-node typed config validation
    _check_typed_configs(wf, errors, warnings)

    # Phase 7: Input/output wiring validation
    _check_wiring(wf, errors, warnings)

    # Phase 8: Context size estimation
    _check_context_size(wf, warnings)

    return WorkflowValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


def parse_workflow_json(raw: dict[str, Any]) -> WorkflowDefinitionV1 | WorkflowDefinitionV2:
    """Parse and return a validated workflow definition. Raises on invalid.

    Auto-detects version: returns V2 if schema_version>=2, V1 otherwise.
    """
    version = raw.get("schema_version", 1)
    if version >= 2:
        return WorkflowDefinitionV2(**raw)
    return WorkflowDefinitionV1(**raw)


def compile_nodes_and_edges(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Compile canonical JSON into flat dicts suitable for DB insertion.

    Returns (node_dicts, edge_dicts) ready for WorkflowNode / WorkflowEdge creation.
    For V2 nodes, all blocks are serialised into config_json.
    """
    node_rows = []
    for node in wf.nodes:
        # Build config_json: original config + V2 blocks
        config = dict(node.config) if node.config else {}
        config["_v2"] = {
            "description": node.description,
            "enabled": node.enabled,
            "version": node.version,
            "input_mapping": [m.model_dump() for m in node.input_mapping],
            "output_mapping": [m.model_dump() for m in node.output_mapping],
            "output_schema": [d.model_dump() for d in node.output_schema],
            "execution": node.execution.model_dump(),
            "rate_limit": node.rate_limit.model_dump(),
            "security": node.security.model_dump(),
            "observability": node.observability.model_dump(),
            "ui": node.ui.model_dump(),
        }
        node_rows.append({
            "node_id": node.id,
            "node_type": node.type.value,
            "name": node.name,
            "config_json": config,
            "position_x": node.position.x,
            "position_y": node.position.y,
        })

    edge_rows = []
    for conn in wf.connections:
        edge_rows.append({
            "from_node_id": conn.from_node,
            "to_node_id": conn.to,
            "condition": conn.condition.value,
            "edge_order": conn.order,
        })

    return node_rows, edge_rows


# ---------------------------------------------------------------------------
# Internal validation helpers
# ---------------------------------------------------------------------------

def _build_adjacency(wf: WorkflowDefinitionV1 | WorkflowDefinitionV2) -> dict[str, list[str]]:
    adj: dict[str, list[str]] = defaultdict(list)
    for conn in wf.connections:
        adj[conn.from_node].append(conn.to)
    return adj


def _check_reachability(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    errors: list[WorkflowValidationError],
    warnings: list[str],
) -> None:
    """All executable nodes must be reachable from at least one trigger."""
    adj = _build_adjacency(wf)
    trigger_ids = {n.id for n in wf.nodes if n.type in TRIGGER_NODE_TYPES}

    reachable: set[str] = set()
    stack = list(trigger_ids)
    while stack:
        nid = stack.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        for child in adj.get(nid, []):
            if child not in reachable:
                stack.append(child)

    all_ids = {n.id for n in wf.nodes}
    unreachable = all_ids - reachable
    if unreachable:
        errors.append(WorkflowValidationError(
            path="nodes",
            message=f"Unreachable nodes from triggers: {sorted(unreachable)}",
        ))

    # Check at least one end node is reachable
    end_ids = {n.id for n in wf.nodes if n.type == NodeType.END}
    if not end_ids & reachable:
        errors.append(WorkflowValidationError(
            path="nodes",
            message="No reachable end node from triggers",
        ))


def _check_edge_determinism(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    errors: list[WorkflowValidationError],
    warnings: list[str],
) -> None:
    """Condition/logic nodes should have ordered edges and a fallback."""
    logic_types = {NodeType.IF, NodeType.SWITCH, NodeType.AI_DECISION}

    outgoing: dict[str, list[WorkflowConnection]] = defaultdict(list)
    for conn in wf.connections:
        outgoing[conn.from_node].append(conn)

    for node in wf.nodes:
        if node.type not in logic_types:
            continue

        edges = outgoing.get(node.id, [])
        if not edges:
            errors.append(WorkflowValidationError(
                path=f"nodes.{node.id}",
                message=f"Logic node '{node.id}' has no outgoing edges",
            ))
            continue

        has_always = any(e.condition == EdgeCondition.ALWAYS for e in edges)
        has_yes_no = (
            any(e.condition == EdgeCondition.YES for e in edges)
            and any(e.condition == EdgeCondition.NO for e in edges)
        )

        if not has_always and not has_yes_no:
            warnings.append(
                f"Logic node '{node.id}' has no fallback edge (no 'always' and no complete yes/no pair)"
            )

    # Check non-terminal nodes have at least one outgoing edge
    terminal_types = {NodeType.END}
    for node in wf.nodes:
        if node.type in terminal_types:
            continue
        if not outgoing.get(node.id):
            errors.append(WorkflowValidationError(
                path=f"nodes.{node.id}",
                message=f"Non-terminal node '{node.id}' has no outgoing edges",
            ))


def _check_channel_hints(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    warnings: list[str],
) -> None:
    """Warn if workflow uses LinkedIn nodes (channel dependency hints)."""
    linkedin_types = {NodeType.LINKEDIN_CONNECT, NodeType.LINKEDIN_MESSAGE}
    has_linkedin = any(n.type in linkedin_types for n in wf.nodes)
    if has_linkedin:
        warnings.append(
            "Workflow uses LinkedIn nodes — ensure a LinkedIn outreach account is assigned to this campaign"
        )


def _check_cron_triggers(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    errors: list[WorkflowValidationError],
    warnings: list[str],
) -> None:
    """Validate cron trigger config specifics."""
    for node in wf.nodes:
        if node.type != NodeType.TRIGGER_CRON:
            continue
        config = node.config
        cron_expr = config.get("cron_expression", "")
        if not cron_expr:
            errors.append(WorkflowValidationError(
                path=f"nodes.{node.id}.config.cron_expression",
                message="Cron trigger must have a cron_expression",
            ))
        else:
            parts = cron_expr.strip().split()
            if len(parts) != 5:
                errors.append(WorkflowValidationError(
                    path=f"nodes.{node.id}.config.cron_expression",
                    message=f"Invalid cron expression: expected 5 fields, got {len(parts)}",
                ))

        run_missed = config.get("run_missed", "skip")
        max_catch_up = config.get("max_catch_up_runs", 3)
        if run_missed == "catch_up" and max_catch_up > 10:
            warnings.append(
                f"Cron trigger '{node.id}' has catch_up enabled with high max_catch_up_runs={max_catch_up}"
            )


def _check_typed_configs(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    errors: list[WorkflowValidationError],
    warnings: list[str],
) -> None:
    """Phase 6: Per-node typed config validation using NODE_CONFIG_MODELS registry."""
    for node in wf.nodes:
        model_cls = NODE_CONFIG_MODELS.get(node.type.value)
        if not model_cls:
            continue

        try:
            model_cls(**node.config)
        except Exception as exc:
            warnings.append(
                f"Node '{node.id}' config validation warning: {exc}"
            )


def _check_wiring(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    errors: list[WorkflowValidationError],
    warnings: list[str],
) -> None:
    """Phase 7: Validate input/output wiring between nodes."""
    # Build map of node_id -> declared output keys
    adj = _build_adjacency(wf)

    # Build reverse adjacency (who feeds into this node)
    reverse_adj: dict[str, set[str]] = defaultdict(set)
    for conn in wf.connections:
        reverse_adj[conn.to].add(conn.from_node)

    node_map = {n.id: n for n in wf.nodes}

    # Build declared output keys per node
    output_keys: dict[str, set[str]] = {}
    for node in wf.nodes:
        keys = set()
        for decl in node.output_schema:
            keys.add(decl.key)
        # If no declared schema, use defaults
        if not keys:
            defaults = NODE_DEFAULT_OUTPUTS.get(node.type.value, [])
            keys = {d["key"] for d in defaults}
        output_keys[node.id] = keys

    for node in wf.nodes:
        for i, mapping in enumerate(node.input_mapping):
            source = mapping.source
            if not source:
                continue

            parts = source.split(".")
            # Valid prefixes: lead, trigger, vars, node_outputs
            if parts[0] in ("lead", "trigger", "vars"):
                continue  # These are always available

            if parts[0] == "node_outputs" and len(parts) >= 3:
                source_node_id = parts[1]
                source_key = parts[2]

                # Check source node exists
                if source_node_id not in node_map:
                    errors.append(WorkflowValidationError(
                        path=f"nodes.{node.id}.input_mapping[{i}].source",
                        message=f"References unknown node: {source_node_id}",
                    ))
                    continue

                # Check source node is upstream
                upstream = reverse_adj.get(node.id, set())
                # Walk upstream transitively
                visited: set[str] = set()
                stack = list(upstream)
                all_upstream: set[str] = set()
                while stack:
                    nid = stack.pop()
                    if nid in visited:
                        continue
                    visited.add(nid)
                    all_upstream.add(nid)
                    stack.extend(reverse_adj.get(nid, set()))

                if source_node_id not in all_upstream:
                    warnings.append(
                        f"Node '{node.id}' input_mapping[{i}] references '{source_node_id}' "
                        f"which may not be upstream"
                    )

                # Check the key is declared
                if source_key not in output_keys.get(source_node_id, set()):
                    warnings.append(
                        f"Node '{node.id}' input_mapping[{i}] references key '{source_key}' "
                        f"not declared in output_schema of '{source_node_id}'"
                    )
            elif parts[0] != "node_outputs":
                warnings.append(
                    f"Node '{node.id}' input_mapping[{i}] has unknown source prefix: {parts[0]}"
                )


def lint_template_variables(canonical_json: dict) -> list[str]:
    """Scan email/AI node templates for {{variable}} references and check they resolve.

    Returns a list of warning strings for any unresolved variable references found
    in email_send subject/body overrides and ai_generate_message/ai_decision prompt templates.
    """
    import re

    warnings: list[str] = []

    nodes = canonical_json.get("nodes", [])
    node_ids = {n.get("id", "") for n in nodes}
    variables = set(canonical_json.get("variables", {}).keys())

    lead_fields = {
        "email", "first_name", "last_name", "company", "title", "phone",
        "linkedin_url", "website", "city", "state", "country", "industry",
    }

    var_pattern = re.compile(r"\{\{(\w+(?:\.\w+)*)\}\}")

    for node in nodes:
        ntype = node.get("type", "")
        config = node.get("config", {})
        nid = node.get("id", "")

        templates_to_check: list[str] = []
        if ntype == "email_send":
            templates_to_check.extend([
                config.get("subject_override", ""),
                config.get("body_override", ""),
            ])
        elif ntype in ("ai_generate_message", "ai_decision"):
            templates_to_check.append(config.get("prompt_template", ""))

        for template in templates_to_check:
            if not template:
                continue
            for match in var_pattern.finditer(template):
                ref = match.group(1)
                parts = ref.split(".")
                root = parts[0]

                # Check if it resolves
                if root in lead_fields or root in variables:
                    continue
                if root == "lead" and len(parts) > 1 and parts[1] in lead_fields:
                    continue
                if root in node_ids:
                    continue
                if root in ("vars", "node_outputs", "trigger"):
                    continue

                warnings.append(f"Node '{nid}': unresolved variable reference '{{{{{ref}}}}}'")

    return warnings


def _check_context_size(
    wf: WorkflowDefinitionV1 | WorkflowDefinitionV2,
    warnings: list[str],
) -> None:
    """Phase 8: Estimate context size from output schemas and warn if close to limit."""
    max_bytes = wf.settings.max_context_size_bytes

    # Rough estimation: each output key ~100 bytes average
    total_keys = 0
    for node in wf.nodes:
        schema = node.output_schema
        if schema:
            total_keys += len(schema)
        else:
            defaults = NODE_DEFAULT_OUTPUTS.get(node.type.value, [])
            total_keys += len(defaults)

    estimated_bytes = total_keys * 100
    if estimated_bytes > max_bytes * 0.8:
        warnings.append(
            f"Estimated context size ({estimated_bytes} bytes across {total_keys} output keys) "
            f"approaches max_context_size_bytes ({max_bytes})"
        )
