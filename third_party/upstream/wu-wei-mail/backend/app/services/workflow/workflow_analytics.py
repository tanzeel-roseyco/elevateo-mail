"""Workflow analytics — per-node stats, branch conversion, path analysis, drop-off."""

import logging
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import (
    WorkflowExecutionLog,
    WorkflowLeadState,
    WorkflowNode,
)

logger = logging.getLogger(__name__)


class WorkflowAnalyticsService:

    async def get_node_stats(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Per-node execution stats: entries, exits, avg_duration, error_rate, skip_rate."""
        result = await db.execute(
            select(
                WorkflowExecutionLog.node_id,
                WorkflowExecutionLog.status,
                func.count(WorkflowExecutionLog.id).label("cnt"),
                func.avg(WorkflowExecutionLog.duration_ms).label("avg_duration_ms"),
            )
            .where(WorkflowExecutionLog.workflow_id == workflow_id)
            .group_by(WorkflowExecutionLog.node_id, WorkflowExecutionLog.status)
        )

        node_data: dict[str, dict[str, Any]] = {}
        for row in result:
            nid = row.node_id
            if nid not in node_data:
                node_data[nid] = {
                    "node_id": nid,
                    "total_executions": 0,
                    "successes": 0,
                    "errors": 0,
                    "skipped": 0,
                    "avg_duration_ms": 0,
                }
            node_data[nid]["total_executions"] += row.cnt
            if row.status == "success":
                node_data[nid]["successes"] += row.cnt
                node_data[nid]["avg_duration_ms"] = round(row.avg_duration_ms or 0, 1)
            elif row.status == "error":
                node_data[nid]["errors"] += row.cnt
            elif row.status == "skipped":
                node_data[nid]["skipped"] += row.cnt

        # Compute rates
        for nid, data in node_data.items():
            total = data["total_executions"]
            data["error_rate"] = round(data["errors"] / total, 3) if total > 0 else 0
            data["skip_rate"] = round(data["skipped"] / total, 3) if total > 0 else 0

        return {"nodes": node_data}

    async def get_branch_conversion(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
    ) -> dict[str, Any]:
        """For if/switch nodes: percentage going to each branch."""
        # Get all if/switch nodes
        nodes_result = await db.execute(
            select(WorkflowNode).where(
                WorkflowNode.workflow_id == workflow_id,
                WorkflowNode.node_type.in_(["if", "switch"]),
            )
        )
        branch_nodes = list(nodes_result.scalars().all())

        branches: dict[str, dict[str, Any]] = {}
        for node in branch_nodes:
            # Get execution logs and examine output
            logs_result = await db.execute(
                select(WorkflowExecutionLog).where(
                    WorkflowExecutionLog.workflow_id == workflow_id,
                    WorkflowExecutionLog.node_id == node.node_id,
                    WorkflowExecutionLog.status == "success",
                )
            )
            logs = list(logs_result.scalars().all())

            total = len(logs)
            branch_counts: dict[str, int] = defaultdict(int)

            for log in logs:
                output = log.output_snapshot or {}
                if node.node_type == "if":
                    met = output.get("condition_met", False)
                    branch_counts["yes" if met else "no"] += 1
                elif node.node_type == "switch":
                    value = output.get("switch_value", "default")
                    branch_counts[value] += 1

            branches[node.node_id] = {
                "node_id": node.node_id,
                "node_type": node.node_type,
                "total": total,
                "branches": {
                    k: {"count": v, "percentage": round(v / total * 100, 1) if total > 0 else 0}
                    for k, v in branch_counts.items()
                },
            }

        return {"branch_nodes": branches}

    async def get_path_analysis(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Most common lead paths through the workflow."""
        # Group execution logs by lead, ordered by time
        result = await db.execute(
            select(
                WorkflowExecutionLog.lead_id,
                WorkflowExecutionLog.node_id,
            )
            .where(
                WorkflowExecutionLog.workflow_id == workflow_id,
                WorkflowExecutionLog.status == "success",
            )
            .order_by(
                WorkflowExecutionLog.lead_id,
                WorkflowExecutionLog.started_at,
            )
        )

        # Build paths per lead
        lead_paths: dict[str, list[str]] = defaultdict(list)
        for row in result:
            lead_paths[str(row.lead_id)].append(row.node_id)

        # Count path frequencies
        path_counts: dict[str, int] = defaultdict(int)
        for path_nodes in lead_paths.values():
            path_key = " -> ".join(path_nodes)
            path_counts[path_key] += 1

        # Sort by frequency
        sorted_paths = sorted(path_counts.items(), key=lambda x: x[1], reverse=True)[:20]

        return {
            "total_leads": len(lead_paths),
            "unique_paths": len(path_counts),
            "top_paths": [
                {"path": path, "count": count, "percentage": round(count / len(lead_paths) * 100, 1) if lead_paths else 0}
                for path, count in sorted_paths
            ],
        }

    async def get_dropoff_analysis(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Nodes with high failed/stuck rates."""
        # Get current lead state distribution
        result = await db.execute(
            select(
                WorkflowLeadState.current_node_id,
                WorkflowLeadState.status,
                func.count(WorkflowLeadState.id).label("cnt"),
            )
            .where(WorkflowLeadState.workflow_id == workflow_id)
            .group_by(WorkflowLeadState.current_node_id, WorkflowLeadState.status)
        )

        node_states: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for row in result:
            nid = row.current_node_id or "__none__"
            node_states[nid][row.status] = row.cnt

        dropoffs = []
        for nid, statuses in node_states.items():
            total = sum(statuses.values())
            failed = statuses.get("failed", 0) + statuses.get("dead_lettered", 0)
            stuck = statuses.get("waiting", 0)

            dropoffs.append({
                "node_id": nid,
                "total_leads": total,
                "failed": failed,
                "stuck": stuck,
                "failed_rate": round(failed / total, 3) if total > 0 else 0,
                "stuck_rate": round(stuck / total, 3) if total > 0 else 0,
            })

        # Sort by failed_rate descending
        dropoffs.sort(key=lambda x: x["failed_rate"], reverse=True)

        return {"dropoffs": dropoffs}


workflow_analytics_service = WorkflowAnalyticsService()
