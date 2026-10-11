"""Workflow runtime engine — executes workflow nodes and moves lead tokens.

V2: Builds ExecutionContext envelope, resolves input mappings, applies output
mappings, enforces context size caps, redacts secrets, respects enabled/run_if
flags, and writes execution logs per node.

Core loop:
1. Select due lead states (next_run_at <= now, status in [pending, waiting])
2. Lock a lead state row
3. Build/restore ExecutionContext envelope
4. Resolve input_mapping → inject into config
5. Execute the current node
6. Apply output_mapping → write results into context.node_outputs[node_id]
7. Emit normalised event
8. Write execution log
9. Evaluate outgoing edges in order
10. Move token to next node
11. Set next_run_at or waiting state
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import (
    OutreachEvent,
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowExecutionLog,
    WorkflowLeadState,
    WorkflowNode,
)
from app.schemas.workflow import (
    ExecutionContext,
    ExecutionMeta,
    InputMapping,
    OutputMapping,
    TriggerMeta,
)
from app.services.workflow.node_executors import (
    NodeResult,
    NodeResultAction,
    get_executor,
)
from app.services.workflow.reliability import (
    retry_manager,
    dead_letter_service,
)
from app.services.workflow.trigger_governance import trigger_governor
from app.schemas.workflow import TriggerPolicies

logger = logging.getLogger(__name__)


def _resolve_path(data: dict[str, Any], path: str) -> Any:
    """Resolve a dot-separated path against a nested dict."""
    parts = path.split(".")
    current: Any = data
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _redact_keys(data: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    """Return a copy of data with specified keys redacted."""
    if not keys:
        return data
    redacted = dict(data)
    for key in keys:
        if key in redacted:
            redacted[key] = "***"
    return redacted


class WorkflowRuntime:
    """Core workflow execution engine."""

    # ------------------------------------------------------------------
    # Main execution loop (called by scheduler/worker)
    # ------------------------------------------------------------------

    async def process_due_leads(
        self,
        db: AsyncSession,
        batch_size: int = 50,
    ) -> int:
        """Process due lead states. Returns number of leads processed."""
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(WorkflowLeadState)
            .where(
                WorkflowLeadState.status.in_(["pending", "waiting"]),
                WorkflowLeadState.next_run_at <= now,
            )
            .order_by(WorkflowLeadState.next_run_at)
            .with_for_update(skip_locked=True)
            .limit(batch_size)
        )
        due_states = list(result.scalars().all())

        processed = 0
        for state in due_states:
            try:
                await self._execute_lead_step(db, state)
                processed += 1
            except Exception:
                logger.exception("Error processing lead state %s", state.id)
                state.status = "failed"
                state.last_error = "Unexpected execution error"
                await db.flush()

        return processed

    # ------------------------------------------------------------------
    # Single lead step execution
    # ------------------------------------------------------------------

    async def _execute_lead_step(
        self,
        db: AsyncSession,
        state: WorkflowLeadState,
    ) -> None:
        """Execute one step for a lead in the workflow."""
        # Load workflow definition
        wf_result = await db.execute(
            select(WorkflowDefinition).where(WorkflowDefinition.id == state.workflow_id)
        )
        wf_def = wf_result.scalar_one_or_none()
        if not wf_def:
            state.status = "failed"
            state.last_error = "Workflow definition not found"
            await db.flush()
            return

        # Check execution cap
        settings = wf_def.canonical_json.get("settings", {})
        max_executions = settings.get("max_node_executions_per_lead", 50)
        if state.execution_count >= max_executions:
            state.status = "failed"
            state.last_error = f"Max executions ({max_executions}) reached"
            await db.flush()
            return

        # Find current node
        node = await self._get_node(db, state.workflow_id, state.current_node_id)
        if not node:
            state.status = "failed"
            state.last_error = f"Node '{state.current_node_id}' not found"
            await db.flush()
            return

        # Check V2 enabled flag
        v2 = (node.config_json or {}).get("_v2", {})
        if not v2.get("enabled", True):
            # Skip disabled node — advance to next
            next_node_id = await self._evaluate_edges(db, state, node, NodeResult(action=NodeResultAction.ADVANCE))
            if next_node_id:
                state.current_node_id = next_node_id
                state.status = "pending"
                state.next_run_at = datetime.now(timezone.utc)
            else:
                state.status = "failed"
                state.last_error = f"Disabled node '{node.node_id}' has no valid outgoing edge"
            await db.flush()
            return

        # Check V2 run_if condition
        run_if = v2.get("execution", {}).get("run_if", "")
        if run_if:
            # Simple truthy check in context
            ctx_json = state.context_json or {}
            if not _resolve_path(ctx_json, run_if):
                # Skip — condition not met
                next_node_id = await self._evaluate_edges(db, state, node, NodeResult(action=NodeResultAction.ADVANCE))
                if next_node_id:
                    state.current_node_id = next_node_id
                    state.status = "pending"
                    state.next_run_at = datetime.now(timezone.utc)
                await db.flush()
                return

        # Get executor
        executor = get_executor(node.node_type)
        if not executor:
            state.status = "failed"
            state.last_error = f"No executor for node type '{node.node_type}'"
            await db.flush()
            return

        # Compliance check for outreach nodes
        from app.services.workflow.compliance_engine import (
            compliance_engine, node_type_to_channel, OUTREACH_NODE_TYPES,
        )
        channel = node_type_to_channel(node.node_type)
        if node.node_type in OUTREACH_NODE_TYPES:
            raw_context_pre = state.context_json or {}
            lead_email = (raw_context_pre.get("lead", {}) or {}).get("email", "")
            # Resolve workspace_id for compliance check
            wf_ws_pre = await db.execute(
                select(WorkflowDefinition.workspace_id).where(
                    WorkflowDefinition.id == state.workflow_id,
                )
            )
            workspace_id_pre = wf_ws_pre.scalar_one_or_none()
            if workspace_id_pre:
                config_pre = dict(node.config_json or {})
                verdict = await compliance_engine.evaluate(
                    db=db, workspace_id=workspace_id_pre, lead_id=state.lead_id,
                    lead_email=lead_email, node_type=node.node_type, channel=channel,
                )
                if not verdict.allowed:
                    if verdict.defer_until:
                        state.status = "waiting"
                        state.next_run_at = verdict.defer_until
                    else:
                        # Hard block — skip node and advance
                        next_node_id = await self._evaluate_edges(
                            db, state, node,
                            NodeResult(action=NodeResultAction.ADVANCE, output={"skipped": True, "reason": verdict.reason}),
                        )
                        if next_node_id:
                            state.current_node_id = next_node_id
                            state.status = "pending"
                            state.next_run_at = datetime.now(timezone.utc)
                        else:
                            state.status = "failed"
                            state.last_error = f"Compliance blocked: {verdict.reason}"
                    # Write execution log with status="skipped"
                    exec_log = WorkflowExecutionLog(
                        workflow_id=state.workflow_id, lead_id=state.lead_id,
                        node_id=node.node_id, started_at=datetime.now(timezone.utc),
                        completed_at=datetime.now(timezone.utc), duration_ms=0,
                        status="skipped", input_snapshot=config_pre,
                        output_snapshot={"compliance_reason": verdict.reason},
                    )
                    db.add(exec_log)
                    await db.flush()
                    return

        # Idempotency check — skip if already executed at this step
        idempotency_key = f"{state.id}:{node.node_id}:{state.execution_count}"
        existing_log = await db.execute(
            select(WorkflowExecutionLog).where(
                WorkflowExecutionLog.idempotency_key == idempotency_key
            )
        )
        if existing_log.scalar_one_or_none():
            # Already executed — advance to next node
            next_node_id = await self._evaluate_edges(
                db, state, node, NodeResult(action=NodeResultAction.ADVANCE),
            )
            if next_node_id:
                state.current_node_id = next_node_id
                state.status = "pending"
                state.next_run_at = datetime.now(timezone.utc)
            else:
                state.status = "completed"
                state.next_run_at = None
            await db.flush()
            return

        # Mark as running
        state.status = "running"
        state.execution_count += 1
        await db.flush()

        # Build execution context
        raw_context = state.context_json or {}
        channel_state = state.channel_state_json or {}

        # Build V2 ExecutionContext envelope
        exec_ctx = ExecutionContext(
            execution=ExecutionMeta(
                id=str(state.id),
                workflow_id=str(state.workflow_id),
                started_at=datetime.now(timezone.utc).isoformat(),
                step_count=state.execution_count,
            ),
            lead=raw_context.get("lead", {}),
            trigger=TriggerMeta(
                type=raw_context.get("trigger_event", {}).get("type", ""),
                payload=raw_context.get("trigger_event", {}),
            ),
            vars=raw_context.get("vars", {}),
            node_outputs=raw_context.get("node_outputs", {}),
        )

        # Resolve input_mapping → inject into config
        config = dict(node.config_json or {})
        config.pop("_v2", None)  # Don't pass V2 metadata to executor
        input_mappings = v2.get("input_mapping", [])
        ctx_dict = exec_ctx.model_dump()
        for mapping_data in input_mappings:
            source = mapping_data.get("source", "")
            target = mapping_data.get("target", "")
            if source and target:
                value = _resolve_path(ctx_dict, source)
                if value is not None:
                    config[target] = value

        lead_data = exec_ctx.lead

        # Resolve workspace_id for node_meta
        wf_ws_result = await db.execute(
            select(WorkflowDefinition.workspace_id).where(
                WorkflowDefinition.id == state.workflow_id,
            )
        )
        workspace_id = wf_ws_result.scalar_one_or_none()

        # Build node_meta for production executors
        node_meta = {
            "db": db,
            "workspace_id": workspace_id,
            "campaign_id": state.campaign_id,
        }

        # Execute node with timing
        start_ms = time.monotonic_ns() // 1_000_000
        result = await executor.execute(
            config=config,
            context=exec_ctx,
            lead_data=lead_data,
            channel_state=channel_state,
            node_meta=node_meta,
        )
        end_ms = time.monotonic_ns() // 1_000_000
        result.duration_ms = end_ms - start_ms

        # Apply output_mapping → write to context.node_outputs[node_id]
        exec_ctx.node_outputs[node.node_id] = result.output
        output_mappings = v2.get("output_mapping", [])
        for mapping_data in output_mappings:
            src = mapping_data.get("source", "")
            tgt = mapping_data.get("target", "")
            if src and tgt and src in result.output:
                # Write to a custom target in node_outputs
                parts = tgt.split(".", 2)
                if len(parts) >= 2 and parts[0] == "node_outputs":
                    target_node = parts[1]
                    target_key = parts[2] if len(parts) > 2 else src
                    if target_node not in exec_ctx.node_outputs:
                        exec_ctx.node_outputs[target_node] = {}
                    exec_ctx.node_outputs[target_node][target_key] = result.output[src]

        # Redact secrets before persisting
        security = v2.get("security", {})
        redact_keys = security.get("redact_output_keys", [])

        # Enforce context size cap
        max_context_bytes = settings.get("max_context_size_bytes", 512_000)
        context_to_persist = {
            "lead": exec_ctx.lead,
            "trigger_event": exec_ctx.trigger.payload,
            "vars": exec_ctx.vars,
            "node_outputs": exec_ctx.node_outputs,
        }
        context_json_str = json.dumps(context_to_persist, default=str)
        if len(context_json_str.encode()) > max_context_bytes:
            state.status = "failed"
            state.last_error = f"Context size ({len(context_json_str.encode())} bytes) exceeds max ({max_context_bytes})"
            await db.flush()
            return

        # Emit event if needed
        if result.event_type:
            await self._emit_event(db, state, node, result)

        # Record outreach touch for compliance tracking
        if result.event_type and node.node_type in OUTREACH_NODE_TYPES:
            await compliance_engine.record_touch(
                db=db, workspace_id=workspace_id, lead_id=state.lead_id,
                channel=channel, touch_type=result.event_type,
                workflow_id=state.workflow_id, campaign_id=state.campaign_id,
                node_id=node.node_id,
            )

        # Write execution log with idempotency key
        log_status = "success" if result.action != NodeResultAction.FAIL else "error"
        exec_log = WorkflowExecutionLog(
            workflow_id=state.workflow_id,
            lead_id=state.lead_id,
            node_id=node.node_id,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            duration_ms=result.duration_ms,
            status=log_status,
            input_snapshot=_redact_keys(config, redact_keys),
            output_snapshot=_redact_keys(result.output, redact_keys),
            error_message=result.error,
            idempotency_key=idempotency_key,
        )
        db.add(exec_log)

        # Update context
        state.context_json = context_to_persist

        # Handle result action
        if result.action == NodeResultAction.COMPLETE:
            state.status = "completed"
            state.next_run_at = None
            await db.flush()

        elif result.action == NodeResultAction.FAIL:
            # Check retry policy from V2 execution config
            v2_exec = v2.get("execution", {})
            retry_policy = v2_exec.get("retry_policy", {})
            should_retry, delay_ms = retry_manager.should_retry(
                retry_policy, state.retry_count, result.error,
            )
            if should_retry:
                state.retry_count += 1
                state.last_retry_at = datetime.now(timezone.utc)
                state.status = "pending"
                state.next_run_at = datetime.now(timezone.utc) + timedelta(milliseconds=delay_ms)
                state.last_error = f"Retry {state.retry_count}: {result.error}"
                await db.flush()
            else:
                on_error = v2_exec.get("on_error", "fail")
                if on_error == "skip":
                    # Skip past failed node and advance
                    next_node_id = await self._evaluate_edges(
                        db, state, node,
                        NodeResult(action=NodeResultAction.ADVANCE, output={"skipped": True, "error": result.error}),
                    )
                    if next_node_id:
                        state.current_node_id = next_node_id
                        state.status = "pending"
                        state.next_run_at = datetime.now(timezone.utc)
                        state.retry_count = 0
                    else:
                        state.status = "failed"
                        state.last_error = result.error or "Node execution failed (skip, no next edge)"
                        state.next_run_at = None
                    await db.flush()
                else:
                    # Default "fail" — move to DLQ if retries exhausted, else just fail
                    if retry_policy.get("enabled", False) and state.retry_count > 0:
                        # Retries were exhausted — move to DLQ
                        await dead_letter_service.move_to_dlq(
                            db, state, node.node_id,
                            result.error or "Node execution failed",
                            workspace_id,
                        )
                    else:
                        state.status = "failed"
                        state.last_error = result.error or "Node execution failed"
                        state.next_run_at = None
                        await db.flush()

        elif result.action == NodeResultAction.WAIT:
            state.status = "waiting"
            state.next_run_at = result.next_run_at
            await db.flush()

        elif result.action == NodeResultAction.WAIT_FOR_EVENT:
            state.status = "waiting"
            state.next_run_at = result.next_run_at  # timeout deadline
            await db.flush()

        elif result.action == NodeResultAction.ADVANCE:
            # Evaluate edges and advance
            next_node_id = await self._evaluate_edges(db, state, node, result)
            if next_node_id:
                state.current_node_id = next_node_id
                state.status = "pending"
                state.next_run_at = datetime.now(timezone.utc)  # immediately due
                await db.flush()
            else:
                # No valid edge — dead end
                state.status = "failed"
                state.last_error = f"No valid outgoing edge from node '{node.node_id}'"
                state.next_run_at = None
                await db.flush()

    # ------------------------------------------------------------------
    # Edge evaluation
    # ------------------------------------------------------------------

    async def _evaluate_edges(
        self,
        db: AsyncSession,
        state: WorkflowLeadState,
        node: WorkflowNode,
        result: NodeResult,
    ) -> str | None:
        """Evaluate outgoing edges in order and return the next node ID."""
        edges_result = await db.execute(
            select(WorkflowEdge)
            .where(
                WorkflowEdge.workflow_id == state.workflow_id,
                WorkflowEdge.from_node_id == node.node_id,
            )
            .order_by(WorkflowEdge.edge_order)
        )
        edges = list(edges_result.scalars().all())

        if not edges:
            return None

        condition_met = result.output.get("condition_met")

        for edge in edges:
            if edge.condition == "always":
                return edge.to_node_id
            elif edge.condition == "yes" and condition_met is True:
                return edge.to_node_id
            elif edge.condition == "no" and condition_met is False:
                return edge.to_node_id
            elif edge.condition == "timeout_elapsed":
                if result.output.get("timeout_elapsed"):
                    return edge.to_node_id
            elif edge.condition == "error_code_match":
                if result.output.get("error_code_match"):
                    return edge.to_node_id

        # Fallback to first 'always' edge if exists
        always_edges = [e for e in edges if e.condition == "always"]
        if always_edges:
            return always_edges[0].to_node_id

        return None

    # ------------------------------------------------------------------
    # Trigger dispatchers
    # ------------------------------------------------------------------

    async def _load_lead_context(
        self,
        db: AsyncSession,
        lead_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Load lead data for the execution context."""
        from app.models.lead import Lead
        result = await db.execute(select(Lead).where(Lead.id == lead_id))
        lead = result.scalar_one_or_none()
        if not lead:
            return {}
        return {
            "id": str(lead.id),
            "email": lead.email,
            "first_name": lead.first_name or "",
            "last_name": lead.last_name or "",
            "company": lead.company or "",
            "title": lead.title or "",
            "linkedin_url": lead.linkedin_url or "",
            "phone": lead.phone or "",
            "custom_fields": lead.custom_fields or {},
        }

    async def _load_workflow_governance(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
    ) -> tuple[WorkflowDefinition | None, TriggerPolicies, int]:
        """Load workflow definition, trigger policies, and rollout percentage."""
        wf_result = await db.execute(
            select(WorkflowDefinition).where(WorkflowDefinition.id == workflow_id)
        )
        wf_def = wf_result.scalar_one_or_none()
        if not wf_def:
            return None, TriggerPolicies(), 100

        raw_policies = wf_def.canonical_json.get("trigger_policies", {})
        policies = TriggerPolicies(**raw_policies)
        rollout = wf_def.rollout_percentage if wf_def.rollout_percentage is not None else 100
        return wf_def, policies, rollout

    async def dispatch_manual_trigger(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        campaign_id: uuid.UUID | None,
        lead_ids: list[uuid.UUID],
        trigger_node_id: str,
    ) -> list[WorkflowLeadState]:
        """Start workflow execution for leads via manual trigger.

        Applies trigger governance (dedupe, volume caps) and rollout
        percentage filtering before creating WorkflowLeadState records.
        """
        # Load governance settings
        wf_def, policies, rollout_pct = await self._load_workflow_governance(
            db, workflow_id,
        )
        workspace_id = wf_def.workspace_id if wf_def else None

        created = []
        for lead_id in lead_ids:
            # Check if lead already in workflow (uniqueness is per workflow+lead)
            existing = await db.execute(
                select(WorkflowLeadState).where(
                    WorkflowLeadState.workflow_id == workflow_id,
                    WorkflowLeadState.lead_id == lead_id,
                )
            )
            if existing.scalar_one_or_none():
                continue

            # Rollout gate
            if not trigger_governor.passes_rollout(rollout_pct):
                logger.debug(
                    "Lead %s filtered by rollout (%d%%)", lead_id, rollout_pct,
                )
                continue

            # Trigger governance checks
            if workspace_id:
                verdict = await trigger_governor.can_trigger(
                    db, workspace_id, workflow_id, lead_id, policies,
                )
                if not verdict.allowed:
                    logger.debug(
                        "Lead %s blocked by governance: %s", lead_id, verdict.reason,
                    )
                    continue

            # Load lead data for context
            lead_data = await self._load_lead_context(db, lead_id)

            state = WorkflowLeadState(
                campaign_id=campaign_id,
                lead_id=lead_id,
                workflow_id=workflow_id,
                current_node_id=trigger_node_id,
                status="pending",
                next_run_at=datetime.now(timezone.utc),
                execution_count=0,
                context_json={"lead": lead_data},
                channel_state_json={},
            )
            db.add(state)
            created.append(state)

            # Increment volume counters after successful creation
            if workspace_id:
                trigger_governor.increment_volume_counter(workspace_id, workflow_id)

        await db.flush()
        return created

    async def dispatch_event_trigger(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        campaign_id: uuid.UUID | None,
        lead_id: uuid.UUID,
        trigger_node_id: str,
        event_data: dict[str, Any] | None = None,
    ) -> WorkflowLeadState | None:
        """Start workflow execution for a single lead via event trigger.

        Applies trigger governance (dedupe, volume caps) and rollout
        percentage filtering before creating the WorkflowLeadState.
        """
        # Check if lead already in workflow (uniqueness is per workflow+lead)
        existing = await db.execute(
            select(WorkflowLeadState).where(
                WorkflowLeadState.workflow_id == workflow_id,
                WorkflowLeadState.lead_id == lead_id,
            )
        )
        if existing.scalar_one_or_none():
            return None

        # Load governance settings
        wf_def, policies, rollout_pct = await self._load_workflow_governance(
            db, workflow_id,
        )
        workspace_id = wf_def.workspace_id if wf_def else None

        # Rollout gate
        if not trigger_governor.passes_rollout(rollout_pct):
            logger.debug(
                "Lead %s filtered by rollout (%d%%)", lead_id, rollout_pct,
            )
            return None

        # Trigger governance checks
        if workspace_id:
            verdict = await trigger_governor.can_trigger(
                db, workspace_id, workflow_id, lead_id, policies,
            )
            if not verdict.allowed:
                logger.debug(
                    "Lead %s blocked by governance: %s", lead_id, verdict.reason,
                )
                return None

        # Load lead data for context
        lead_data = await self._load_lead_context(db, lead_id)

        state = WorkflowLeadState(
            campaign_id=campaign_id,
            lead_id=lead_id,
            workflow_id=workflow_id,
            current_node_id=trigger_node_id,
            status="pending",
            next_run_at=datetime.now(timezone.utc),
            context_json={"lead": lead_data, "trigger_event": event_data or {}},
            channel_state_json={},
        )
        db.add(state)

        # Increment volume counters after successful creation
        if workspace_id:
            trigger_governor.increment_volume_counter(workspace_id, workflow_id)

        await db.flush()
        return state

    # ------------------------------------------------------------------
    # Admin tools
    # ------------------------------------------------------------------

    async def retry_lead(
        self,
        db: AsyncSession,
        state_id: uuid.UUID,
    ) -> WorkflowLeadState | None:
        """Retry a failed lead state (re-execute current node)."""
        result = await db.execute(
            select(WorkflowLeadState).where(WorkflowLeadState.id == state_id)
        )
        state = result.scalar_one_or_none()
        if not state or state.status != "failed":
            return None
        state.status = "pending"
        state.next_run_at = datetime.now(timezone.utc)
        state.last_error = None
        await db.flush()
        return state

    async def jump_to_node(
        self,
        db: AsyncSession,
        state_id: uuid.UUID,
        target_node_id: str,
    ) -> WorkflowLeadState | None:
        """Move a lead to a specific node (admin intervention)."""
        result = await db.execute(
            select(WorkflowLeadState).where(WorkflowLeadState.id == state_id)
        )
        state = result.scalar_one_or_none()
        if not state:
            return None
        state.current_node_id = target_node_id
        state.status = "pending"
        state.next_run_at = datetime.now(timezone.utc)
        state.last_error = None
        await db.flush()
        return state

    async def mark_completed(
        self,
        db: AsyncSession,
        state_id: uuid.UUID,
    ) -> WorkflowLeadState | None:
        """Mark a lead as completed (admin intervention)."""
        result = await db.execute(
            select(WorkflowLeadState).where(WorkflowLeadState.id == state_id)
        )
        state = result.scalar_one_or_none()
        if not state:
            return None
        state.status = "completed"
        state.next_run_at = None
        await db.flush()
        return state

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_node(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        node_id: str | None,
    ) -> WorkflowNode | None:
        if not node_id:
            return None
        result = await db.execute(
            select(WorkflowNode).where(
                WorkflowNode.workflow_id == workflow_id,
                WorkflowNode.node_id == node_id,
            )
        )
        return result.scalar_one_or_none()

    async def _emit_event(
        self,
        db: AsyncSession,
        state: WorkflowLeadState,
        node: WorkflowNode,
        result: NodeResult,
    ) -> None:
        """Emit a normalised outreach event."""
        # Resolve workspace_id from workflow definition
        wf_result = await db.execute(
            select(WorkflowDefinition.workspace_id).where(
                WorkflowDefinition.id == state.workflow_id,
            )
        )
        workspace_id = wf_result.scalar_one_or_none()
        if not workspace_id:
            return

        event = OutreachEvent(
            workspace_id=workspace_id,
            campaign_id=state.campaign_id,
            lead_id=state.lead_id,
            workflow_id=state.workflow_id,
            node_id=node.node_id,
            event_type=result.event_type,
            payload=result.event_payload,
        )
        db.add(event)
        await db.flush()


workflow_runtime = WorkflowRuntime()


# ---------------------------------------------------------------------------
# Convenience: trigger all matching workflows for a new lead
# ---------------------------------------------------------------------------

async def dispatch_new_lead_triggers(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    lead_id: uuid.UUID,
) -> int:
    """Find all published workflows with trigger_new_lead and dispatch.

    Returns the number of workflows where the lead was enrolled.
    """
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.workspace_id == workspace_id,
            WorkflowDefinition.status == "published",
        )
    )
    workflows = list(result.scalars().all())
    enrolled = 0

    for wf in workflows:
        canonical = wf.canonical_json or {}
        nodes = canonical.get("nodes", [])
        trigger_node = next(
            (n for n in nodes if n.get("type") == "trigger_new_lead"), None,
        )
        if not trigger_node:
            continue

        state = await workflow_runtime.dispatch_event_trigger(
            db=db,
            workflow_id=wf.id,
            campaign_id=wf.campaign_id,
            lead_id=lead_id,
            trigger_node_id=trigger_node["id"],
            event_data={"trigger": "new_lead"},
        )
        if state:
            enrolled += 1

    return enrolled
