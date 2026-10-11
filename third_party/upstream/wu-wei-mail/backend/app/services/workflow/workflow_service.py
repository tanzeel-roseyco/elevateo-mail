"""Workflow CRUD, import/export, and compilation service."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.lead import LeadList
from app.models.workflow import (
    WorkflowDefinition,
    WorkflowNode,
    WorkflowEdge,
    WorkflowLeadState,
    OutreachEvent,
)
from app.schemas.workflow import WorkflowDefinitionV1, WorkflowValidationResult
from app.services.workflow.schema_validator import (
    compile_nodes_and_edges,
    parse_workflow_json,
    validate_workflow_json,
)

logger = logging.getLogger(__name__)


class WorkflowService:
    """Service for workflow CRUD and lifecycle operations."""

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_workflow(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> WorkflowDefinition:
        """Get the latest workflow definition for a campaign."""
        await self._verify_campaign_ownership(db, campaign_id, workspace_id)

        result = await db.execute(
            select(WorkflowDefinition)
            .where(
                WorkflowDefinition.campaign_id == campaign_id,
                WorkflowDefinition.workspace_id == workspace_id,
            )
            .order_by(WorkflowDefinition.workflow_version.desc())
            .limit(1)
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"No workflow found for campaign {campaign_id}")
        return wf

    # ------------------------------------------------------------------
    # Create / Update
    # ------------------------------------------------------------------

    async def save_workflow(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
        raw_json: dict[str, Any],
    ) -> WorkflowDefinition:
        """Validate and save a workflow definition (creates new version)."""
        await self._verify_campaign_ownership(db, campaign_id, workspace_id)

        # Validate
        parsed = parse_workflow_json(raw_json)

        # Determine next version
        result = await db.execute(
            select(WorkflowDefinition.workflow_version)
            .where(
                WorkflowDefinition.campaign_id == campaign_id,
                WorkflowDefinition.workspace_id == workspace_id,
            )
            .order_by(WorkflowDefinition.workflow_version.desc())
            .limit(1)
        )
        current_max = result.scalar_one_or_none()
        next_version = (current_max or 0) + 1

        # Extract name from meta for the name column
        meta = raw_json.get("meta", {})
        wf_name = meta.get("name", "Untitled Workflow")

        # Create definition
        wf_def = WorkflowDefinition(
            workspace_id=workspace_id,
            campaign_id=campaign_id,
            name=wf_name,
            schema_version=parsed.schema_version,
            workflow_version=next_version,
            status="draft",
            canonical_json=raw_json,
        )
        db.add(wf_def)
        await db.flush()

        # Compile and store runtime nodes/edges
        await self._compile_runtime_tables(db, wf_def, parsed)

        return wf_def

    # ------------------------------------------------------------------
    # Validate (without saving)
    # ------------------------------------------------------------------

    async def validate_workflow(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
        raw_json: dict[str, Any],
    ) -> WorkflowValidationResult:
        """Validate workflow JSON without persisting."""
        await self._verify_campaign_ownership(db, campaign_id, workspace_id)
        return validate_workflow_json(raw_json)

    # ------------------------------------------------------------------
    # Publish
    # ------------------------------------------------------------------

    async def publish_workflow(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> WorkflowDefinition:
        """Publish the latest draft workflow.

        Archives any previously published version, promotes draft to published,
        increments workflow_version, and sets published_at.
        """
        wf = await self.get_workflow(db, campaign_id, workspace_id)

        if wf.status == "published":
            raise ValueError("Workflow is already published")

        # Re-validate before publish
        result = validate_workflow_json(wf.canonical_json)
        if not result.valid:
            msgs = "; ".join(e.message for e in result.errors)
            raise ValueError(f"Cannot publish — validation errors: {msgs}")

        # Archive any previously published version for this campaign
        prev_published = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.campaign_id == campaign_id,
                WorkflowDefinition.workspace_id == workspace_id,
                WorkflowDefinition.status == "published",
            )
        )
        for prev in prev_published.scalars().all():
            prev.status = "archived"

        wf.status = "published"
        wf.published_at = datetime.now(timezone.utc)
        await db.flush()
        return wf

    async def publish_workflow_by_id(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> WorkflowDefinition:
        """Publish a workflow by its ID (standalone workflows).

        Archives any previously published version with the same name,
        promotes draft to published, and sets published_at.
        """
        wf = await self.get_by_id(db, workflow_id, workspace_id)

        if wf.status == "published":
            raise ValueError("Workflow is already published")

        # Re-validate before publish
        result = validate_workflow_json(wf.canonical_json)
        if not result.valid:
            msgs = "; ".join(e.message for e in result.errors)
            raise ValueError(f"Cannot publish — validation errors: {msgs}")

        # Archive any previously published version with the same name
        prev_published = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.workspace_id == workspace_id,
                WorkflowDefinition.name == wf.name,
                WorkflowDefinition.status == "published",
                WorkflowDefinition.id != wf.id,
            )
        )
        for prev in prev_published.scalars().all():
            prev.status = "archived"

        wf.status = "published"
        wf.published_at = datetime.now(timezone.utc)
        await db.flush()
        return wf

    async def unpublish_workflow_by_id(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> WorkflowDefinition:
        """Unpublish a workflow (move back to draft)."""
        wf = await self.get_by_id(db, workflow_id, workspace_id)

        if wf.status != "published":
            raise ValueError("Workflow is not published")

        wf.status = "draft"
        await db.flush()
        return wf

    # ------------------------------------------------------------------
    # Rollback
    # ------------------------------------------------------------------

    async def rollback_to_version(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        workspace_id: uuid.UUID,
        target_version: int,
    ) -> WorkflowDefinition:
        """Rollback a workflow to a previous version.

        Archives the currently published version and restores the target
        version's canonical_json into a new version marked as published.
        """
        current = await self.get_by_id(db, workflow_id, workspace_id)

        # Find the target version by name + version number
        target_result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.workspace_id == workspace_id,
                WorkflowDefinition.name == current.name,
                WorkflowDefinition.workflow_version == target_version,
            )
        )
        target = target_result.scalar_one_or_none()
        if not target:
            raise ValueError(
                f"Version {target_version} not found for workflow '{current.name}'"
            )

        if target.id == current.id:
            raise ValueError("Cannot rollback to the same version")

        # Archive the current workflow if it is published
        if current.status == "published":
            current.status = "archived"

        # Determine next version number
        max_version_result = await db.execute(
            select(func.max(WorkflowDefinition.workflow_version)).where(
                WorkflowDefinition.workspace_id == workspace_id,
                WorkflowDefinition.name == current.name,
            )
        )
        max_version = max_version_result.scalar() or 0
        next_version = max_version + 1

        # Create a new version with the target's canonical_json
        restored = WorkflowDefinition(
            workspace_id=workspace_id,
            campaign_id=current.campaign_id,
            name=current.name,
            description=current.description,
            schema_version=target.schema_version,
            workflow_version=next_version,
            status="published",
            canonical_json=target.canonical_json,
            published_at=datetime.now(timezone.utc),
        )
        db.add(restored)
        await db.flush()

        # Compile runtime tables for the restored version
        parsed = parse_workflow_json(target.canonical_json)
        await self._compile_runtime_tables(db, restored, parsed)

        return restored

    # ------------------------------------------------------------------
    # Export / Import
    # ------------------------------------------------------------------

    async def export_workflow(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Export canonical workflow JSON (no secrets)."""
        wf = await self.get_workflow(db, campaign_id, workspace_id)
        return wf.canonical_json

    async def import_workflow(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
        raw_json: dict[str, Any],
    ) -> WorkflowDefinition:
        """Import a workflow JSON — validates and saves as draft."""
        # Always import as draft
        return await self.save_workflow(db, campaign_id, workspace_id, raw_json)

    async def validate_import(
        self,
        raw_json: dict[str, Any],
    ) -> WorkflowValidationResult:
        """Validate import JSON without campaign context."""
        return validate_workflow_json(raw_json)

    # ------------------------------------------------------------------
    # Top-level workflow CRUD (standalone workflows)
    # ------------------------------------------------------------------

    async def list_workflows(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> list[WorkflowDefinition]:
        """List all workflows in a workspace (latest version of each name)."""
        # Get all workflows for the workspace, ordered by name and version desc
        result = await db.execute(
            select(WorkflowDefinition)
            .where(WorkflowDefinition.workspace_id == workspace_id)
            .order_by(
                WorkflowDefinition.name,
                WorkflowDefinition.workflow_version.desc(),
            )
        )
        rows = result.scalars().all()

        # Dedupe: keep only the latest version per name
        seen: set[str] = set()
        latest: list[WorkflowDefinition] = []
        for wf in rows:
            if wf.name not in seen:
                seen.add(wf.name)
                latest.append(wf)
        return latest

    async def create_standalone_workflow(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        name: str,
        description: str | None = None,
        campaign_id: uuid.UUID | None = None,
        raw_json: dict[str, Any] | None = None,
    ) -> WorkflowDefinition:
        """Create a new standalone workflow (not campaign-scoped)."""
        if campaign_id:
            await self._verify_campaign_ownership(db, campaign_id, workspace_id)

        # Build default canonical JSON if none provided
        if raw_json is None:
            raw_json = {
                "schema_version": 1,
                "workflow_version": 1,
                "meta": {"name": name, "description": description or "", "tags": []},
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
        else:
            # Validate the provided JSON
            parse_workflow_json(raw_json)

        wf_def = WorkflowDefinition(
            workspace_id=workspace_id,
            campaign_id=campaign_id,
            name=name,
            description=description,
            schema_version=1,
            workflow_version=1,
            status="draft",
            canonical_json=raw_json,
        )
        db.add(wf_def)
        await db.flush()

        # Compile runtime tables
        parsed = parse_workflow_json(raw_json)
        await self._compile_runtime_tables(db, wf_def, parsed)

        return wf_def

    async def get_by_id(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> WorkflowDefinition:
        """Get a workflow by its ID with workspace ownership check."""
        result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.id == workflow_id,
                WorkflowDefinition.workspace_id == workspace_id,
            )
        )
        wf = result.scalar_one_or_none()
        if not wf:
            raise ValueError(f"Workflow {workflow_id} not found in workspace")
        return wf

    async def update_by_id(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        workspace_id: uuid.UUID,
        raw_json: dict[str, Any],
    ) -> WorkflowDefinition:
        """Update a workflow's canonical JSON by ID."""
        wf = await self.get_by_id(db, workflow_id, workspace_id)

        # Validate the new JSON
        parsed = parse_workflow_json(raw_json)

        # Update name from meta if present
        meta = raw_json.get("meta", {})
        if meta.get("name"):
            wf.name = meta["name"]
        if "description" in meta:
            wf.description = meta.get("description")

        wf.canonical_json = raw_json
        wf.updated_at = datetime.now(timezone.utc)

        # Delete old runtime nodes/edges and recompile
        await db.execute(
            select(WorkflowNode).where(WorkflowNode.workflow_id == wf.id)
        )
        # Delete existing nodes and edges
        from sqlalchemy import delete
        await db.execute(
            delete(WorkflowEdge).where(WorkflowEdge.workflow_id == wf.id)
        )
        await db.execute(
            delete(WorkflowNode).where(WorkflowNode.workflow_id == wf.id)
        )

        await self._compile_runtime_tables(db, wf, parsed)
        await db.flush()
        return wf

    async def delete_workflow(
        self,
        db: AsyncSession,
        workflow_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> None:
        """Delete a workflow by ID."""
        wf = await self.get_by_id(db, workflow_id, workspace_id)
        await db.delete(wf)
        await db.flush()

    async def get_data_sources(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """List campaigns and lead lists available as data source nodes."""
        campaigns_result = await db.execute(
            select(Campaign).where(Campaign.workspace_id == workspace_id)
        )
        campaigns = campaigns_result.scalars().all()

        lists_result = await db.execute(
            select(LeadList).where(LeadList.workspace_id == workspace_id)
        )
        lead_lists = lists_result.scalars().all()

        return {
            "campaigns": [
                {"id": str(c.id), "name": c.name, "status": c.status}
                for c in campaigns
            ],
            "lead_lists": [
                {"id": str(ll.id), "name": ll.name}
                for ll in lead_lists
            ],
        }

    # ------------------------------------------------------------------
    # Stats (placeholder for analytics overlay)
    # ------------------------------------------------------------------

    async def get_workflow_stats(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Return per-node execution stats for analytics overlays."""
        await self._verify_campaign_ownership(db, campaign_id, workspace_id)

        wf = await self.get_workflow(db, campaign_id, workspace_id)

        # Per-node: count leads currently at each node and their statuses
        node_leads = await db.execute(
            select(
                WorkflowLeadState.current_node_id,
                WorkflowLeadState.status,
                func.count(WorkflowLeadState.id).label("cnt"),
            )
            .where(
                WorkflowLeadState.workflow_id == wf.id,
                WorkflowLeadState.campaign_id == campaign_id,
            )
            .group_by(WorkflowLeadState.current_node_id, WorkflowLeadState.status)
        )
        node_stats: dict[str, dict[str, Any]] = {}
        for row in node_leads:
            nid = row.current_node_id or "__none__"
            if nid not in node_stats:
                node_stats[nid] = {"total": 0, "by_status": {}}
            node_stats[nid]["total"] += row.cnt
            node_stats[nid]["by_status"][row.status] = row.cnt

        # Per-node: count events
        event_counts = await db.execute(
            select(
                OutreachEvent.node_id,
                OutreachEvent.event_type,
                func.count(OutreachEvent.id).label("cnt"),
            )
            .where(
                OutreachEvent.workflow_id == wf.id,
                OutreachEvent.campaign_id == campaign_id,
            )
            .group_by(OutreachEvent.node_id, OutreachEvent.event_type)
        )
        event_stats: dict[str, dict[str, int]] = {}
        for row in event_counts:
            nid = row.node_id or "__none__"
            if nid not in event_stats:
                event_stats[nid] = {}
            event_stats[nid][row.event_type] = row.cnt

        # Lead state summary
        state_summary = await db.execute(
            select(
                WorkflowLeadState.status,
                func.count(WorkflowLeadState.id).label("cnt"),
            )
            .where(
                WorkflowLeadState.workflow_id == wf.id,
                WorkflowLeadState.campaign_id == campaign_id,
            )
            .group_by(WorkflowLeadState.status)
        )
        lead_states: dict[str, int] = {}
        for row in state_summary:
            lead_states[row.status] = row.cnt

        return {
            "workflow_id": str(wf.id),
            "nodes": node_stats,
            "events": event_stats,
            "lead_states": lead_states,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _verify_campaign_ownership(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> Campaign:
        """Verify campaign exists and belongs to workspace."""
        result = await db.execute(
            select(Campaign).where(
                Campaign.id == campaign_id,
                Campaign.workspace_id == workspace_id,
            )
        )
        campaign = result.scalar_one_or_none()
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found in workspace")
        return campaign

    async def _compile_runtime_tables(
        self,
        db: AsyncSession,
        wf_def: WorkflowDefinition,
        parsed: WorkflowDefinitionV1,
    ) -> None:
        """Compile canonical JSON into workflow_nodes and workflow_edges rows."""
        node_dicts, edge_dicts = compile_nodes_and_edges(parsed)

        for nd in node_dicts:
            node = WorkflowNode(workflow_id=wf_def.id, **nd)
            db.add(node)

        for ed in edge_dicts:
            edge = WorkflowEdge(workflow_id=wf_def.id, **ed)
            db.add(edge)

        await db.flush()


workflow_service = WorkflowService()
