"""Workflow routes — CRUD, validate, export/import, publish, stats, admin.

Includes both campaign-scoped and top-level standalone workflow endpoints,
plus admin tools for lead state management and dead letter queue.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from sqlalchemy import select, desc

from app.models.workflow import WorkflowExecutionLog, WorkflowLeadState, WorkflowDeadLetterEntry
from app.schemas.workflow import (
    WorkflowDefinitionResponse,
    WorkflowListItemResponse,
    WorkflowCreateRequest,
    WorkflowValidationResult,
    DataSourcesResponse,
    ExecutionLogEntry,
    ContextSchemaResponse,
    NODE_DEFAULT_OUTPUTS,
)
from app.services.workflow.workflow_service import workflow_service
from app.services.workflow.simulator import simulate_workflow, ScenarioAssumptions, SimulationResult
from app.utils.security import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Top-level standalone workflow endpoints
# ---------------------------------------------------------------------------

@router.get("/workflows/data-sources", response_model=DataSourcesResponse)
async def get_data_sources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List campaigns and lead lists for data source node palette."""
    return await workflow_service.get_data_sources(db, current_user.workspace_id)


@router.get("/workflows", response_model=list[WorkflowListItemResponse])
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all workflows in the workspace."""
    workflows = await workflow_service.list_workflows(db, current_user.workspace_id)
    return [
        {
            "id": wf.id,
            "name": wf.name,
            "description": wf.description,
            "campaign_id": wf.campaign_id,
            "status": wf.status,
            "workflow_version": wf.workflow_version,
            "node_count": len(wf.canonical_json.get("nodes", [])) if wf.canonical_json else 0,
            "created_at": wf.created_at.isoformat() if wf.created_at else "",
            "updated_at": wf.updated_at.isoformat() if wf.updated_at else "",
        }
        for wf in workflows
    ]


@router.post("/workflows", response_model=WorkflowDefinitionResponse)
async def create_workflow(
    body: WorkflowCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new standalone workflow."""
    try:
        wf = await workflow_service.create_standalone_workflow(
            db,
            current_user.workspace_id,
            name=body.name,
            description=body.description,
            campaign_id=body.campaign_id,
            raw_json=body.canonical_json,
        )
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/workflows/{workflow_id}", response_model=WorkflowDefinitionResponse)
async def get_workflow_by_id(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a workflow by ID."""
    try:
        wf = await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/workflows/{workflow_id}", response_model=WorkflowDefinitionResponse)
async def update_workflow(
    workflow_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a workflow's canonical JSON."""
    try:
        wf = await workflow_service.update_by_id(db, workflow_id, current_user.workspace_id, body)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a workflow."""
    try:
        await workflow_service.delete_workflow(db, workflow_id, current_user.workspace_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows/{workflow_id}/publish", response_model=WorkflowDefinitionResponse)
async def publish_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish a workflow (validates, archives previous, sets published_at)."""
    try:
        wf = await workflow_service.publish_workflow_by_id(db, workflow_id, current_user.workspace_id)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workflows/{workflow_id}/unpublish", response_model=WorkflowDefinitionResponse)
async def unpublish_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unpublish a workflow (move back to draft)."""
    try:
        wf = await workflow_service.unpublish_workflow_by_id(db, workflow_id, current_user.workspace_id)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workflows/{workflow_id}/simulate")
async def simulate_standalone_workflow(
    workflow_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Simulate a lead path through a standalone workflow."""
    try:
        wf = await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
        wf_json = body.get("workflow_json") or wf.canonical_json

        scenario_data = body.get("scenario", {})
        scenario = ScenarioAssumptions(**{
            k: v for k, v in scenario_data.items()
            if k in ScenarioAssumptions.__dataclass_fields__
        })

        result = simulate_workflow(wf_json, scenario)
        return {
            "steps": [
                {
                    "node_id": s.node_id,
                    "node_type": s.node_type,
                    "node_name": s.node_name,
                    "action": s.action,
                    "detail": s.detail,
                }
                for s in result.steps
            ],
            "reached_end": result.reached_end,
            "error": result.error,
            "total_nodes_visited": result.total_nodes_visited,
            "warnings": result.warnings,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Campaign-scoped workflow endpoints
# ---------------------------------------------------------------------------

@router.post("/campaigns/{campaign_id}/workflow/convert", response_model=WorkflowDefinitionResponse)
async def convert_sequence_to_workflow(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert a campaign's sequence into a workflow definition."""
    try:
        from app.services.workflow.sequence_converter import sequence_converter
        wf_json = await sequence_converter.convert(db, campaign_id, current_user.workspace_id)
        wf = await workflow_service.save_workflow(db, campaign_id, current_user.workspace_id, wf_json)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/campaigns/{campaign_id}/workflow", response_model=WorkflowDefinitionResponse)
async def get_campaign_workflow(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the latest workflow for a campaign."""
    try:
        wf = await workflow_service.get_workflow(db, campaign_id, current_user.workspace_id)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/campaigns/{campaign_id}/workflow", response_model=WorkflowDefinitionResponse)
async def save_campaign_workflow(
    campaign_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save (create new version of) workflow for a campaign."""
    try:
        wf = await workflow_service.save_workflow(db, campaign_id, current_user.workspace_id, body)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/campaigns/{campaign_id}/workflow/validate", response_model=WorkflowValidationResult)
async def validate_campaign_workflow(
    campaign_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate workflow JSON without saving."""
    try:
        return await workflow_service.validate_workflow(db, campaign_id, current_user.workspace_id, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/campaigns/{campaign_id}/workflow/publish", response_model=WorkflowDefinitionResponse)
async def publish_campaign_workflow(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Publish the latest draft workflow for a campaign."""
    try:
        wf = await workflow_service.publish_workflow(db, campaign_id, current_user.workspace_id)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/campaigns/{campaign_id}/workflow/stats")
async def get_campaign_workflow_stats(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get per-node workflow execution stats."""
    try:
        return await workflow_service.get_workflow_stats(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Standalone workflow endpoints (export / import)
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/workflow/export")
async def export_workflow(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export canonical workflow JSON (no secrets)."""
    try:
        return await workflow_service.export_workflow(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/campaigns/{campaign_id}/workflow/import", response_model=WorkflowDefinitionResponse)
async def import_workflow(
    campaign_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import a workflow JSON into a campaign (saves as draft)."""
    try:
        wf = await workflow_service.import_workflow(db, campaign_id, current_user.workspace_id, body)
        return _to_response(wf)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/campaigns/{campaign_id}/workflow/simulate")
async def simulate_campaign_workflow(
    campaign_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Simulate a lead path through the workflow under given scenario assumptions.

    Body should have:
      - workflow_json (optional): If not provided, uses saved workflow
      - scenario: { email_replied, email_opened, ... } boolean flags
    """
    try:
        # Get workflow JSON either from body or from saved
        wf_json = body.get("workflow_json")
        if not wf_json:
            wf = await workflow_service.get_workflow(db, campaign_id, current_user.workspace_id)
            wf_json = wf.canonical_json

        scenario_data = body.get("scenario", {})
        scenario = ScenarioAssumptions(**{
            k: v for k, v in scenario_data.items()
            if k in ScenarioAssumptions.__dataclass_fields__
        })

        result = simulate_workflow(wf_json, scenario)
        return {
            "steps": [
                {
                    "node_id": s.node_id,
                    "node_type": s.node_type,
                    "node_name": s.node_name,
                    "action": s.action,
                    "detail": s.detail,
                }
                for s in result.steps
            ],
            "reached_end": result.reached_end,
            "error": result.error,
            "total_nodes_visited": result.total_nodes_visited,
            "warnings": result.warnings,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Execution log & context schema endpoints
# ---------------------------------------------------------------------------

@router.get("/workflows/{workflow_id}/nodes/{node_id}/last-run")
async def get_node_last_run(
    workflow_id: UUID,
    node_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the latest execution log for a specific node."""
    # Verify ownership
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    stmt = (
        select(WorkflowExecutionLog)
        .where(
            WorkflowExecutionLog.workflow_id == workflow_id,
            WorkflowExecutionLog.node_id == node_id,
        )
        .order_by(desc(WorkflowExecutionLog.started_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="No execution data for this node")
    return _log_to_dict(log)


@router.get("/workflows/{workflow_id}/nodes/{node_id}/logs")
async def get_node_logs(
    workflow_id: UUID,
    node_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get paginated execution logs for a specific node."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    stmt = (
        select(WorkflowExecutionLog)
        .where(
            WorkflowExecutionLog.workflow_id == workflow_id,
            WorkflowExecutionLog.node_id == node_id,
        )
        .order_by(desc(WorkflowExecutionLog.started_at))
        .limit(min(limit, 100))
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [_log_to_dict(log) for log in logs]


@router.get("/workflows/{workflow_id}/context-schema", response_model=ContextSchemaResponse)
async def get_context_schema(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full available variable tree for a workflow."""
    try:
        wf = await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    canonical = wf.canonical_json or {}
    nodes = canonical.get("nodes", [])

    # Build node_outputs from declared output_schema or defaults
    node_outputs: dict[str, list[dict]] = {}
    for node in nodes:
        nid = node.get("id", "")
        ntype = node.get("type", "")
        output_schema = node.get("output_schema", [])
        if output_schema:
            node_outputs[nid] = output_schema
        else:
            defaults = NODE_DEFAULT_OUTPUTS.get(ntype, [])
            if defaults:
                node_outputs[nid] = defaults

    return ContextSchemaResponse(
        lead_fields=["id", "email", "first_name", "last_name", "company", "title", "linkedin_url", "phone"],
        trigger_fields=["type", "payload"],
        variables=list(canonical.get("variables", {}).keys()),
        node_outputs=node_outputs,
    )


@router.get("/workflows/{workflow_id}/analytics/nodes")
async def get_workflow_node_analytics(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-node execution stats: entries, exits, avg_duration, error_rate, skip_rate."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.workflow.workflow_analytics import workflow_analytics_service
    return await workflow_analytics_service.get_node_stats(db, workflow_id)


@router.get("/workflows/{workflow_id}/analytics/branches")
async def get_workflow_branch_analytics(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """For if/switch nodes: percentage going to each branch."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.workflow.workflow_analytics import workflow_analytics_service
    return await workflow_analytics_service.get_branch_conversion(db, workflow_id)


@router.get("/workflows/{workflow_id}/analytics/paths")
async def get_workflow_path_analytics(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Most common lead paths through the workflow."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.workflow.workflow_analytics import workflow_analytics_service
    return await workflow_analytics_service.get_path_analysis(db, workflow_id)


@router.get("/workflows/{workflow_id}/analytics/dropoff")
async def get_workflow_dropoff_analytics(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Nodes with high failed/stuck rates."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    from app.services.workflow.workflow_analytics import workflow_analytics_service
    return await workflow_analytics_service.get_dropoff_analysis(db, workflow_id)


@router.post("/workflows/import/validate", response_model=WorkflowValidationResult)
async def validate_import(
    body: dict[str, Any],
    current_user: User = Depends(get_current_user),
):
    """Validate import JSON without campaign context."""
    return await workflow_service.validate_import(body)


# ---------------------------------------------------------------------------
# Enrollment: Start leads in a workflow
# ---------------------------------------------------------------------------

@router.post("/workflows/{workflow_id}/enroll")
async def enroll_leads(
    workflow_id: UUID,
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enroll leads into a workflow for execution.

    Body accepts:
      - lead_ids: list[str] — specific lead UUIDs to enroll
      - list_id: str — enroll all leads from a lead list
    At least one of lead_ids or list_id must be provided.
    """
    try:
        wf = await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if wf.status != "published":
        raise HTTPException(status_code=400, detail="Workflow must be published before enrolling leads")

    # Collect lead IDs
    lead_ids: list[UUID] = []

    raw_ids = body.get("lead_ids", [])
    for rid in raw_ids:
        try:
            lead_ids.append(UUID(str(rid)))
        except (ValueError, TypeError):
            pass

    list_id = body.get("list_id")
    if list_id:
        from app.models.lead import LeadListMember
        result = await db.execute(
            select(LeadListMember.lead_id).where(
                LeadListMember.lead_list_id == UUID(str(list_id)),
            )
        )
        list_lead_ids = [row[0] for row in result.all()]
        lead_ids.extend(list_lead_ids)

    if not lead_ids:
        raise HTTPException(status_code=400, detail="No leads to enroll. Provide lead_ids or list_id.")

    # Deduplicate
    lead_ids = list(set(lead_ids))

    # Verify leads belong to workspace
    from app.models.lead import Lead
    result = await db.execute(
        select(Lead.id).where(
            Lead.id.in_(lead_ids),
            Lead.workspace_id == current_user.workspace_id,
        )
    )
    valid_ids = [row[0] for row in result.all()]

    if not valid_ids:
        raise HTTPException(status_code=400, detail="No valid leads found in your workspace")

    # Find the trigger node in the workflow
    canonical = wf.canonical_json or {}
    trigger_types = {
        "trigger_manual", "trigger_new_lead", "trigger_list_membership_added",
        "trigger_inbound_webhook", "trigger_cron",
    }
    trigger_node_id = None
    for node in canonical.get("nodes", []):
        if node.get("type") in trigger_types:
            trigger_node_id = node["id"]
            break

    if not trigger_node_id:
        raise HTTPException(status_code=400, detail="Workflow has no trigger node")

    # Dispatch via runtime
    from app.services.workflow.runtime import workflow_runtime
    states = await workflow_runtime.dispatch_manual_trigger(
        db=db,
        workflow_id=workflow_id,
        campaign_id=wf.campaign_id,
        lead_ids=valid_ids,
        trigger_node_id=trigger_node_id,
    )
    await db.commit()

    return {
        "ok": True,
        "enrolled": len(states),
        "total_requested": len(valid_ids),
        "skipped": len(valid_ids) - len(states),
    }


@router.get("/workflows/{workflow_id}/leads")
async def list_workflow_leads(
    workflow_id: UUID,
    status: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get lead states for a workflow (for the run monitor)."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    from app.models.lead import Lead

    query = (
        select(WorkflowLeadState)
        .where(WorkflowLeadState.workflow_id == workflow_id)
        .order_by(desc(WorkflowLeadState.updated_at))
        .limit(min(limit, 500))
    )
    if status:
        query = query.where(WorkflowLeadState.status == status)

    result = await db.execute(query)
    states = result.scalars().all()

    # Batch-load lead names
    lead_ids = [s.lead_id for s in states]
    lead_names: dict[UUID, str] = {}
    if lead_ids:
        lead_result = await db.execute(
            select(Lead.id, Lead.email, Lead.first_name, Lead.last_name)
            .where(Lead.id.in_(lead_ids))
        )
        for row in lead_result.all():
            name = f"{row.first_name or ''} {row.last_name or ''}".strip() or row.email
            lead_names[row.id] = name

    return {
        "leads": [
            {
                "id": str(s.id),
                "lead_id": str(s.lead_id),
                "lead_name": lead_names.get(s.lead_id, "Unknown"),
                "current_node_id": s.current_node_id,
                "status": s.status,
                "execution_count": s.execution_count,
                "next_run_at": s.next_run_at.isoformat() if s.next_run_at else None,
                "last_error": s.last_error,
                "updated_at": s.updated_at.isoformat() if s.updated_at else "",
            }
            for s in states
        ],
        "total": len(states),
    }


@router.get("/workflows/{workflow_id}/leads/summary")
async def get_workflow_leads_summary(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get aggregate counts of lead states for a workflow."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    from sqlalchemy import func
    result = await db.execute(
        select(WorkflowLeadState.status, func.count(WorkflowLeadState.id))
        .where(WorkflowLeadState.workflow_id == workflow_id)
        .group_by(WorkflowLeadState.status)
    )
    counts = {row[0]: row[1] for row in result.all()}
    total = sum(counts.values())

    return {
        "total": total,
        "pending": counts.get("pending", 0),
        "running": counts.get("running", 0),
        "waiting": counts.get("waiting", 0),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
        "paused": counts.get("paused", 0),
        "dead_lettered": counts.get("dead_lettered", 0),
    }


# ---------------------------------------------------------------------------
# Admin: Lead state management
# ---------------------------------------------------------------------------

@router.post("/workflows/{workflow_id}/leads/{state_id}/skip")
async def skip_lead_node(
    workflow_id: UUID,
    state_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skip the current node for a lead and advance to the next edge."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = await db.execute(
        select(WorkflowLeadState).where(
            WorkflowLeadState.id == state_id,
            WorkflowLeadState.workflow_id == workflow_id,
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=404, detail="Lead state not found")

    from app.services.workflow.runtime import workflow_runtime
    next_state = await workflow_runtime.jump_to_node(db, state_id, state.current_node_id or "")
    if not next_state:
        raise HTTPException(status_code=400, detail="Cannot skip: no valid state transition")
    return {"ok": True, "state_id": str(state_id), "status": next_state.status}


@router.post("/workflows/{workflow_id}/leads/{state_id}/pause")
async def pause_lead(
    workflow_id: UUID,
    state_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pause a lead's workflow execution."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = await db.execute(
        select(WorkflowLeadState).where(
            WorkflowLeadState.id == state_id,
            WorkflowLeadState.workflow_id == workflow_id,
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=404, detail="Lead state not found")

    if state.status in ("completed", "dead_lettered"):
        raise HTTPException(status_code=400, detail=f"Cannot pause a lead in '{state.status}' status")

    state.status = "paused"
    state.next_run_at = None
    await db.flush()
    return {"ok": True, "state_id": str(state_id), "status": "paused"}


@router.post("/workflows/{workflow_id}/leads/{state_id}/resume")
async def resume_lead(
    workflow_id: UUID,
    state_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resume a paused or failed lead's workflow execution."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = await db.execute(
        select(WorkflowLeadState).where(
            WorkflowLeadState.id == state_id,
            WorkflowLeadState.workflow_id == workflow_id,
        )
    )
    state = result.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=404, detail="Lead state not found")

    if state.status not in ("paused", "failed"):
        raise HTTPException(status_code=400, detail=f"Cannot resume a lead in '{state.status}' status")

    from datetime import datetime, timezone
    state.status = "pending"
    state.next_run_at = datetime.now(timezone.utc)
    state.last_error = None
    await db.flush()
    return {"ok": True, "state_id": str(state_id), "status": "pending"}


# ---------------------------------------------------------------------------
# Admin: Dead letter queue
# ---------------------------------------------------------------------------

@router.get("/workflows/{workflow_id}/dead-letter")
async def list_dead_letter_entries(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List dead letter entries for a workflow."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = await db.execute(
        select(WorkflowDeadLetterEntry)
        .where(WorkflowDeadLetterEntry.workflow_id == workflow_id)
        .order_by(desc(WorkflowDeadLetterEntry.created_at))
        .limit(100)
    )
    entries = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "workflow_id": str(e.workflow_id),
            "lead_id": str(e.lead_id),
            "lead_state_id": str(e.lead_state_id),
            "failed_node_id": e.failed_node_id,
            "failure_count": e.failure_count,
            "last_error": e.last_error,
            "status": e.status,
            "created_at": e.created_at.isoformat() if e.created_at else "",
            "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
        }
        for e in entries
    ]


@router.post("/workflows/{workflow_id}/dead-letter/{dlq_id}/retry")
async def retry_dead_letter_entry(
    workflow_id: UUID,
    dlq_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retry a dead-lettered entry — restore the lead state and re-queue."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    from app.services.workflow.reliability import dead_letter_service
    state = await dead_letter_service.retry_from_dlq(db, dlq_id)
    if not state:
        raise HTTPException(status_code=404, detail="DLQ entry not found or not in pending_review status")
    return {"ok": True, "state_id": str(state.id), "status": state.status}


@router.post("/workflows/{workflow_id}/dead-letter/{dlq_id}/discard")
async def discard_dead_letter_entry(
    workflow_id: UUID,
    dlq_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Discard a dead-lettered entry — mark as discarded."""
    try:
        await workflow_service.get_by_id(db, workflow_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    from app.services.workflow.reliability import dead_letter_service
    ok = await dead_letter_service.discard_dlq_entry(db, dlq_id)
    if not ok:
        raise HTTPException(status_code=404, detail="DLQ entry not found or not in pending_review status")
    return {"ok": True, "dlq_id": str(dlq_id), "status": "discarded"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_response(wf) -> dict:
    return {
        "id": wf.id,
        "campaign_id": wf.campaign_id,
        "name": getattr(wf, "name", ""),
        "description": getattr(wf, "description", None),
        "schema_version": wf.schema_version,
        "workflow_version": wf.workflow_version,
        "status": wf.status,
        "canonical_json": wf.canonical_json,
        "published_at": wf.published_at.isoformat() if wf.published_at else None,
        "created_at": wf.created_at.isoformat() if wf.created_at else "",
        "updated_at": wf.updated_at.isoformat() if wf.updated_at else "",
    }


def _log_to_dict(log: WorkflowExecutionLog) -> dict:
    return {
        "id": str(log.id),
        "workflow_id": str(log.workflow_id),
        "lead_id": str(log.lead_id),
        "node_id": log.node_id,
        "started_at": log.started_at.isoformat() if log.started_at else "",
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_ms": log.duration_ms,
        "status": log.status,
        "input_snapshot": log.input_snapshot or {},
        "output_snapshot": log.output_snapshot or {},
        "error_message": log.error_message,
    }
