"""Workflow Event Bus — routes external events into workflow state updates.

The architectural linchpin that routes events between isolated modules:
- Inbound reply → wake waiting leads at wait/if nodes
- Email bounce → update channel_state
- Email open → update channel_state
- Leads imported → dispatch to matching trigger_new_lead workflows
- List membership → dispatch to matching trigger_list_membership_added workflows
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import (
    WorkflowDefinition,
    WorkflowLeadState,
    WorkflowNode,
)

logger = logging.getLogger(__name__)


class WorkflowEventBus:
    """Routes external events into workflow lead state updates."""

    # ------------------------------------------------------------------
    # Email events — update channel_state and wake waiting leads
    # ------------------------------------------------------------------

    async def on_email_reply(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_id: uuid.UUID,
        campaign_id: uuid.UUID | None = None,
        event_data: dict[str, Any] | None = None,
    ) -> int:
        """Handle an email reply event — wake leads waiting for reply.

        Returns the number of workflow lead states updated.
        """
        updated = 0

        # Find all active WorkflowLeadStates for this lead that are waiting
        query = select(WorkflowLeadState).where(
            WorkflowLeadState.lead_id == lead_id,
            WorkflowLeadState.status.in_(["waiting", "pending"]),
        )
        if campaign_id:
            query = query.where(WorkflowLeadState.campaign_id == campaign_id)

        result = await db.execute(query)
        states = list(result.scalars().all())

        for state in states:
            # Update channel_state: mark reply received
            cs = state.channel_state_json or {}
            cs["email_replied"] = True
            cs["email_reply_at"] = datetime.now(timezone.utc).isoformat()
            if event_data:
                cs["last_reply_data"] = event_data
            state.channel_state_json = cs

            # Also update context_json for condition evaluation
            ctx = state.context_json or {}
            ctx_vars = ctx.get("vars", {})
            ctx_vars["email_replied"] = True
            ctx["vars"] = ctx_vars
            state.context_json = ctx

            # Early wake-up: if lead is waiting, set next_run_at to now
            if state.status == "waiting":
                state.next_run_at = datetime.now(timezone.utc)
                state.status = "pending"

            updated += 1

        if updated > 0:
            await db.flush()
            logger.info(
                "Event bus: email_reply for lead %s — updated %d workflow states",
                lead_id, updated,
            )

        return updated

    async def on_email_bounce(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_id: uuid.UUID,
        campaign_id: uuid.UUID | None = None,
        event_data: dict[str, Any] | None = None,
    ) -> int:
        """Handle an email bounce event — update channel_state."""
        updated = 0

        query = select(WorkflowLeadState).where(
            WorkflowLeadState.lead_id == lead_id,
            WorkflowLeadState.status.in_(["waiting", "pending", "running"]),
        )
        if campaign_id:
            query = query.where(WorkflowLeadState.campaign_id == campaign_id)

        result = await db.execute(query)
        states = list(result.scalars().all())

        for state in states:
            cs = state.channel_state_json or {}
            cs["email_bounced"] = True
            cs["email_bounce_at"] = datetime.now(timezone.utc).isoformat()
            state.channel_state_json = cs

            ctx = state.context_json or {}
            ctx_vars = ctx.get("vars", {})
            ctx_vars["email_bounced"] = True
            ctx["vars"] = ctx_vars
            state.context_json = ctx

            updated += 1

        if updated > 0:
            await db.flush()
            logger.info(
                "Event bus: email_bounce for lead %s — updated %d workflow states",
                lead_id, updated,
            )

        return updated

    async def on_email_open(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_id: uuid.UUID,
        campaign_id: uuid.UUID | None = None,
        event_data: dict[str, Any] | None = None,
    ) -> int:
        """Handle an email open event — update channel_state."""
        updated = 0

        query = select(WorkflowLeadState).where(
            WorkflowLeadState.lead_id == lead_id,
            WorkflowLeadState.status.in_(["waiting", "pending", "running"]),
        )
        if campaign_id:
            query = query.where(WorkflowLeadState.campaign_id == campaign_id)

        result = await db.execute(query)
        states = list(result.scalars().all())

        for state in states:
            cs = state.channel_state_json or {}
            cs["email_opened"] = True
            if not cs.get("email_first_open_at"):
                cs["email_first_open_at"] = datetime.now(timezone.utc).isoformat()
            state.channel_state_json = cs

            ctx = state.context_json or {}
            ctx_vars = ctx.get("vars", {})
            ctx_vars["email_opened"] = True
            ctx["vars"] = ctx_vars
            state.context_json = ctx

            updated += 1

        if updated > 0:
            await db.flush()
            logger.info(
                "Event bus: email_open for lead %s — updated %d workflow states",
                lead_id, updated,
            )

        return updated

    async def on_email_click(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_id: uuid.UUID,
        campaign_id: uuid.UUID | None = None,
        event_data: dict[str, Any] | None = None,
    ) -> int:
        """Handle an email click event — update channel_state."""
        updated = 0

        query = select(WorkflowLeadState).where(
            WorkflowLeadState.lead_id == lead_id,
            WorkflowLeadState.status.in_(["waiting", "pending", "running"]),
        )
        if campaign_id:
            query = query.where(WorkflowLeadState.campaign_id == campaign_id)

        result = await db.execute(query)
        states = list(result.scalars().all())

        for state in states:
            cs = state.channel_state_json or {}
            cs["email_clicked"] = True
            state.channel_state_json = cs

            ctx = state.context_json or {}
            ctx_vars = ctx.get("vars", {})
            ctx_vars["email_clicked"] = True
            ctx["vars"] = ctx_vars
            state.context_json = ctx

            updated += 1

        if updated > 0:
            await db.flush()

        return updated

    # ------------------------------------------------------------------
    # Trigger dispatchers — fire workflows for imported leads
    # ------------------------------------------------------------------

    async def on_leads_imported(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_ids: list[uuid.UUID],
        trigger_data: dict[str, Any] | None = None,
    ) -> int:
        """When leads are imported, dispatch them to published workflows with trigger_new_lead.

        Returns total number of lead states created.
        """
        from app.services.workflow.runtime import workflow_runtime

        # Find all published workflows in this workspace that have a trigger_new_lead node
        result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.workspace_id == workspace_id,
                WorkflowDefinition.status == "published",
            )
        )
        workflows = list(result.scalars().all())

        total_dispatched = 0

        for wf in workflows:
            # Find trigger_new_lead nodes
            trigger_nodes = await db.execute(
                select(WorkflowNode).where(
                    WorkflowNode.workflow_id == wf.id,
                    WorkflowNode.node_type == "trigger_new_lead",
                )
            )
            trigger_node_list = list(trigger_nodes.scalars().all())

            if not trigger_node_list:
                continue

            trigger_node = trigger_node_list[0]

            # Determine campaign_id from the workflow definition (None for standalone)
            campaign_id = wf.campaign_id

            for lead_id in lead_ids:
                state = await workflow_runtime.dispatch_event_trigger(
                    db=db,
                    workflow_id=wf.id,
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    trigger_node_id=trigger_node.node_id,
                    event_data=trigger_data or {"source": "lead_import"},
                )
                if state:
                    total_dispatched += 1

        if total_dispatched > 0:
            logger.info(
                "Event bus: on_leads_imported — dispatched %d leads to workflows",
                total_dispatched,
            )

        return total_dispatched

    async def on_list_membership_added(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        lead_ids: list[uuid.UUID],
        list_id: uuid.UUID,
    ) -> int:
        """When leads are added to a list, dispatch to matching trigger_list_membership_added workflows.

        Returns total number of lead states created.
        """
        from app.services.workflow.runtime import workflow_runtime

        # Find published workflows with trigger_list_membership_added nodes
        result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.workspace_id == workspace_id,
                WorkflowDefinition.status == "published",
            )
        )
        workflows = list(result.scalars().all())

        total_dispatched = 0

        for wf in workflows:
            trigger_nodes = await db.execute(
                select(WorkflowNode).where(
                    WorkflowNode.workflow_id == wf.id,
                    WorkflowNode.node_type == "trigger_list_membership_added",
                )
            )
            trigger_node_list = list(trigger_nodes.scalars().all())

            if not trigger_node_list:
                continue

            trigger_node = trigger_node_list[0]

            # Check if this trigger is filtered to specific list_ids
            config = trigger_node.config_json or {}
            filter_list_ids = config.get("list_ids", [])
            if filter_list_ids and str(list_id) not in filter_list_ids:
                continue  # This workflow doesn't care about this list

            campaign_id = wf.campaign_id  # None for standalone workflows

            for lead_id in lead_ids:
                state = await workflow_runtime.dispatch_event_trigger(
                    db=db,
                    workflow_id=wf.id,
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    trigger_node_id=trigger_node.node_id,
                    event_data={"source": "list_membership", "list_id": str(list_id)},
                )
                if state:
                    total_dispatched += 1

        if total_dispatched > 0:
            logger.info(
                "Event bus: on_list_membership_added (list=%s) — dispatched %d leads",
                list_id, total_dispatched,
            )

        return total_dispatched


workflow_event_bus = WorkflowEventBus()
