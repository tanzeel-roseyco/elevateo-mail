"""Prospecting routes — agent-driven lead discovery, enrichment, and campaign building.

All endpoints are scoped under /api/prospecting and require JWT + workspace_id.
"""

import json
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.models.prospecting import (
    ProspectingConversation, ProspectingMessage, ProspectingAction,
    ProspectingRun, ProspectingLead,
)
from app.schemas.prospecting import (
    ConversationCreate, ConversationResponse,
    MessageCreate, MessageResponse,
    RunCreate, RunResponse, RunProgress,
    LeadImportRequest, LeadImportResponse, ProspectingLeadResponse,
    CopyDraftRequest, CopyDraftResponse, CopyVariant as CopyVariantSchema,
    CampaignCreateRequest, CampaignActionResponse,
    ActionResponse, ActionApproval,
    ModelPolicyUpdate, ModelPolicyResponse,
    PersonalizationSettingsUpdate, PersonalizationSettingsResponse,
    VALID_AGENT_TYPES,
)
from app.services.prospecting.orchestrator_service import orchestrator_service
from app.services.prospecting.action_gate_service import (
    action_gate_service, ActionNotFoundError, ActionNotApprovableError,
)
from app.services.prospecting.prompt_engine import prompt_engine
from app.services.prospecting.lead_discovery_service import lead_discovery_service
from app.services.prospecting.lead_import_service import lead_import_service
from app.services.prospecting.copywriting_service import copywriting_service
from app.services.prospecting.campaign_builder_service import campaign_builder_service
from app.services.prospecting.model_router_service import model_policy_crud
from app.services.prospecting.openrouter_settings_service import openrouter_settings_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_prospecting_enabled():
    """Raise 404 if prospecting feature flag is off."""
    settings = get_settings()
    if not settings.PROSPECTING_ENABLED:
        raise HTTPException(status_code=404, detail="Prospecting is not enabled")


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all prospecting conversations for the current workspace."""
    _check_prospecting_enabled()

    result = await db.execute(
        select(ProspectingConversation)
        .where(ProspectingConversation.workspace_id == current_user.workspace_id)
        .order_by(ProspectingConversation.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    body: ConversationCreate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new prospecting conversation."""
    _check_prospecting_enabled()

    conversation = ProspectingConversation(
        workspace_id=current_user.workspace_id,
        created_by=current_user.id,
        title=body.title if body else None,
        stage="DISCOVERY",
    )
    db.add(conversation)
    await db.flush()
    return conversation


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a prospecting conversation by ID (workspace-isolated)."""
    _check_prospecting_enabled()

    result = await db.execute(
        select(ProspectingConversation).where(
            ProspectingConversation.id == conversation_id,
            ProspectingConversation.workspace_id == current_user.workspace_id,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List messages in a conversation (workspace-isolated)."""
    _check_prospecting_enabled()

    # Verify conversation ownership
    conv_result = await db.execute(
        select(ProspectingConversation).where(
            ProspectingConversation.id == conversation_id,
            ProspectingConversation.workspace_id == current_user.workspace_id,
        )
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(ProspectingMessage)
        .where(ProspectingMessage.conversation_id == conversation_id)
        .order_by(ProspectingMessage.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/conversations/{conversation_id}/leads", response_model=list[ProspectingLeadResponse])
async def list_conversation_leads(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all prospecting leads discovered in a conversation's runs."""
    _check_prospecting_enabled()

    # Verify conversation ownership
    conv_result = await db.execute(
        select(ProspectingConversation).where(
            ProspectingConversation.id == conversation_id,
            ProspectingConversation.workspace_id == current_user.workspace_id,
        )
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Get all runs for this conversation, then all leads from those runs
    run_result = await db.execute(
        select(ProspectingRun.id).where(
            ProspectingRun.conversation_id == conversation_id,
        )
    )
    run_ids = [r for r in run_result.scalars().all()]

    if not run_ids:
        return []

    lead_result = await db.execute(
        select(ProspectingLead)
        .where(ProspectingLead.run_id.in_(run_ids))
        .order_by(ProspectingLead.quality_score.desc().nulls_last())
    )
    return list(lead_result.scalars().all())


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message in a prospecting conversation.

    The orchestrator classifies intent, routes to the appropriate specialist,
    and returns the assistant response.
    """
    _check_prospecting_enabled()

    try:
        routing, user_msg, assistant_msg = await orchestrator_service.process_message(
            db=db,
            conversation_id=conversation_id,
            workspace_id=current_user.workspace_id,
            user_id=current_user.id,
            content=body.content,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Check if we should add a proactive prompt
    if routing.stage_transition:
        stage_prompt = prompt_engine.get_stage_prompt(routing.stage)
        assistant_msg.metadata_json = {
            **(assistant_msg.metadata_json or {}),
            "stage_prompt": {
                "prompt_text": stage_prompt.prompt_text,
                "suggested_actions": stage_prompt.suggested_actions,
            },
        }

    return assistant_msg


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream a message response via Server-Sent Events.

    Uses orchestrator_service.prepare_streaming() for shared setup (intent
    classification, routing, stage transitions, model resolution, context
    building). Persistence is handled here in event_generator to avoid
    relying on async-generator cleanup for DB writes.

    Events: status, tool_call, tool_result, token, done.
    """
    _check_prospecting_enabled()

    async def event_generator():
        final_content = ""
        ctx = None
        try:
            ctx, stream = await orchestrator_service.prepare_streaming(
                db=db,
                conversation_id=conversation_id,
                workspace_id=current_user.workspace_id,
                user_id=current_user.id,
                content=body.content,
            )

            async for event in stream:
                event_name = event.get("event", "status")
                data = event.get("data", {})
                if event_name == "done":
                    final_content = data.get("content", "")
                yield f"event: {event_name}\ndata: {json.dumps(data)}\n\n"

        except ValueError as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:
            logger.exception("Streaming message failed")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            if ctx:
                final_content = orchestrator_service._generate_fallback_response(ctx.routing)

        # Persist assistant message after streaming completes
        if final_content and ctx:
            assistant_msg = orchestrator_service._build_assistant_message(
                current_user.workspace_id, conversation_id, final_content,
                ctx.routing, model_used=ctx.resolved_model,
            )
            db.add(assistant_msg)
            await db.flush()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Runs (discovery / enrichment)
# ---------------------------------------------------------------------------

@router.post("/runs", response_model=RunResponse, status_code=201)
async def create_run(
    body: RunCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new discovery or enrichment run.

    The source strategy is automatically planned from ICP criteria.
    After creation, dispatch the run via the Celery worker to execute async.
    """
    _check_prospecting_enabled()

    try:
        run = await lead_discovery_service.create_run(
            db=db,
            workspace_id=current_user.workspace_id,
            conversation_id=body.conversation_id,
            icp_criteria=body.icp_criteria,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Dispatch to Celery worker for async execution
    from app.workers.prospecting import execute_prospecting_run
    execute_prospecting_run.delay(str(run.id), str(current_user.workspace_id))

    return run


@router.post("/runs/{run_id}/approve", response_model=RunResponse)
async def approve_run(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve and dispatch a pending run for execution.

    Useful for runs that were created but not yet dispatched,
    or for re-running a failed/cancelled run.
    """
    _check_prospecting_enabled()

    from app.models.prospecting import ProspectingRun

    result = await db.execute(
        select(ProspectingRun).where(
            ProspectingRun.id == run_id,
            ProspectingRun.workspace_id == current_user.workspace_id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ("pending", "failed", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Run is '{run.status}' — only pending, failed, or cancelled runs can be approved",
        )

    run.status = "pending"
    await db.flush()
    await db.commit()

    from app.workers.prospecting import execute_prospecting_run
    execute_prospecting_run.delay(str(run.id), str(current_user.workspace_id))

    return run


@router.get("/runs/{run_id}/progress")
async def get_run_progress(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current progress for a discovery/enrichment run."""
    _check_prospecting_enabled()

    try:
        progress = await lead_discovery_service.get_run_progress(
            db=db,
            run_id=run_id,
            workspace_id=current_user.workspace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return progress


# ---------------------------------------------------------------------------
# Actions (approval gate)
# ---------------------------------------------------------------------------

@router.post("/actions", response_model=ActionResponse, status_code=201)
async def create_action(
    conversation_id: uuid.UUID,
    action_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a pending action requiring approval."""
    _check_prospecting_enabled()

    try:
        action = await action_gate_service.create_action(
            db=db,
            workspace_id=current_user.workspace_id,
            conversation_id=conversation_id,
            action_type=action_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return action


@router.post("/actions/{action_id}/approve", response_model=ActionResponse)
async def approve_action(
    action_id: uuid.UUID,
    body: ActionApproval,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a pending action."""
    _check_prospecting_enabled()

    try:
        action = await action_gate_service.approve_action(
            db=db,
            action_id=action_id,
            workspace_id=current_user.workspace_id,
            approved_by=current_user.id,
            approved=body.approved,
        )
    except ActionNotFoundError:
        raise HTTPException(status_code=404, detail="Action not found")
    except ActionNotApprovableError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return action


@router.get("/actions", response_model=list[ActionResponse])
async def list_pending_actions(
    conversation_id: uuid.UUID = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List pending actions for the workspace."""
    _check_prospecting_enabled()

    actions = await action_gate_service.get_pending_actions(
        db=db,
        workspace_id=current_user.workspace_id,
        conversation_id=conversation_id,
    )
    return actions


# ---------------------------------------------------------------------------
# Lead Import
# ---------------------------------------------------------------------------

@router.post("/leads/import", response_model=LeadImportResponse)
async def import_leads(
    body: LeadImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import selected prospecting leads into CRM leads table.

    Requires an approved bulk_import action (action_id).
    Dedupes against existing leads by (workspace_id, email).
    Only imports leads with eligible readiness bands by default.
    Stores provenance in Lead.custom_fields.
    """
    _check_prospecting_enabled()

    # Enforce action gate: require approved bulk_import action
    if not body.action_id:
        raise HTTPException(
            status_code=400,
            detail="action_id is required. Create and approve a bulk_import action first.",
        )

    from app.services.prospecting.action_gate_service import (
        ActionNotFoundError, ActionNotExecutableError,
    )

    # Verify action is approved and executable BEFORE performing import
    try:
        action = await action_gate_service.get_action(
            db=db,
            action_id=body.action_id,
            workspace_id=current_user.workspace_id,
        )
        if not action:
            raise HTTPException(status_code=404, detail="Action not found")
        if action.status != "approved":
            raise HTTPException(status_code=409, detail=f"Action is '{action.status}', not approved")
    except ActionNotFoundError:
        raise HTTPException(status_code=404, detail="Action not found")

    # Perform the actual import FIRST
    try:
        result = await lead_import_service.import_leads(
            db=db,
            workspace_id=current_user.workspace_id,
            lead_ids=body.lead_ids,
            target_list_id=body.target_list_id,
            new_list_name=body.new_list_name,
        )
    except ValueError as e:
        # Mark action as failed on import error
        try:
            await action_gate_service.mark_failed(
                db=db,
                action_id=body.action_id,
                workspace_id=current_user.workspace_id,
                error_detail=str(e),
            )
        except Exception:
            pass  # best-effort failure marking
        raise HTTPException(status_code=404, detail=str(e))

    # Mark action as executed AFTER successful import
    try:
        await action_gate_service.mark_executed(
            db=db,
            action_id=body.action_id,
            workspace_id=current_user.workspace_id,
            result={"lead_count": result.imported_count},
        )
    except (ActionNotFoundError, ActionNotExecutableError):
        pass  # Import succeeded, action marking is best-effort

    return LeadImportResponse(
        imported_count=result.imported_count,
        duplicate_count=result.duplicate_count,
        lead_list_id=result.lead_list_id,
        imported_lead_ids=result.imported_lead_ids,
    )


# ---------------------------------------------------------------------------
# Copy Drafts
# ---------------------------------------------------------------------------

@router.post("/copy/draft", response_model=CopyDraftResponse)
async def create_copy_draft(
    body: CopyDraftRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate copy variants for a conversation's lead segment.

    Returns sequence-ready copy with multiple variants.
    User can review, edit, and approve before campaign creation.
    """
    _check_prospecting_enabled()

    try:
        draft = await copywriting_service.generate_draft(
            db=db,
            workspace_id=current_user.workspace_id,
            conversation_id=body.conversation_id,
            segment_description=body.segment_description,
            tone=body.tone or "professional",
            num_variants=body.num_variants,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return CopyDraftResponse(
        conversation_id=draft.conversation_id,
        variants=[
            CopyVariantSchema(
                subject=v.subject,
                body=v.body,
                variant_label=v.variant_label,
            )
            for v in draft.variants
        ],
        metadata=draft.metadata,
    )


# ---------------------------------------------------------------------------
# Campaign Creation and Launch
# ---------------------------------------------------------------------------

@router.post("/campaigns/create", response_model=CampaignActionResponse)
async def create_campaign(
    body: CampaignCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a campaign draft from prospecting conversation context.

    Uses existing campaign services. Supports native (default) and
    Instantly (feature-flagged) targets.
    """
    _check_prospecting_enabled()

    # Gate Instantly target: reject early with clear message when flag is off
    if body.target_type == "instantly":
        settings = get_settings()
        if not settings.PROSPECTING_EXTERNAL_INSTANTLY_ENABLED:
            raise HTTPException(
                status_code=400,
                detail="Instantly integration is not enabled. Use 'native' target or enable the PROSPECTING_EXTERNAL_INSTANTLY_ENABLED flag.",
            )

    try:
        result = await campaign_builder_service.create_campaign_draft(
            db=db,
            workspace_id=current_user.workspace_id,
            conversation_id=body.conversation_id,
            campaign_name=body.campaign_name,
            lead_list_id=body.lead_list_id,
            copy_variants=[
                {"subject": v.subject, "body": v.body}
                for v in body.copy_variants
            ],
            target_type=body.target_type,
            settings=body.settings,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Store campaign_id in conversation metadata for later recovery
    if result.campaign_id:
        conv_result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == body.conversation_id,
                ProspectingConversation.workspace_id == current_user.workspace_id,
            )
        )
        conv = conv_result.scalar_one_or_none()
        if conv:
            meta = conv.metadata_json or {}
            meta["campaign_id"] = str(result.campaign_id)
            conv.metadata_json = meta
            await db.flush()

    return CampaignActionResponse(
        target_type=result.target_type,
        campaign_id=result.campaign_id,
        conversation_id=result.conversation_id,
        source_list_id=result.source_list_id,
        created_by_agent=result.created_by_agent,
        launch_status=result.launch_status,
    )


@router.post("/campaigns/launch", response_model=CampaignActionResponse)
async def launch_campaign(
    conversation_id: uuid.UUID,
    campaign_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Launch a campaign created from prospecting.

    Requires a prior approved campaign_launch action.
    """
    _check_prospecting_enabled()

    try:
        result = await campaign_builder_service.launch_campaign(
            db=db,
            workspace_id=current_user.workspace_id,
            conversation_id=conversation_id,
            campaign_id=campaign_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Advance conversation stage to LAUNCHED
    conv_result = await db.execute(
        select(ProspectingConversation).where(
            ProspectingConversation.id == conversation_id,
            ProspectingConversation.workspace_id == current_user.workspace_id,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if conv:
        conv.stage = "LAUNCHED"
        await db.flush()

    return CampaignActionResponse(
        target_type=result.target_type,
        campaign_id=result.campaign_id,
        conversation_id=result.conversation_id,
        source_list_id=result.source_list_id,
        created_by_agent=result.created_by_agent,
        launch_status=result.launch_status,
    )


# ---------------------------------------------------------------------------
# Model Policy CRUD
# ---------------------------------------------------------------------------

@router.get("/models", response_model=list[ModelPolicyResponse])
async def list_model_policies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all model policies for the current workspace."""
    _check_prospecting_enabled()
    policies = await model_policy_crud.list_policies(db, current_user.workspace_id)
    return policies


@router.get("/models/{agent_type}", response_model=ModelPolicyResponse | dict)
async def get_model_policy(
    agent_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the effective model config for a specific agent type.

    Returns the workspace policy if set, otherwise system defaults.
    """
    _check_prospecting_enabled()

    if agent_type not in VALID_AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid agent type: {agent_type}")

    effective = await model_policy_crud.get_effective_config(
        db, current_user.workspace_id, agent_type,
    )
    return effective


@router.patch("/models/{agent_type}", response_model=ModelPolicyResponse)
async def update_model_policy(
    agent_type: str,
    body: ModelPolicyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the model policy for an agent type.

    Only non-null fields are applied. If no policy exists, one is created
    with system defaults for unspecified fields.
    """
    _check_prospecting_enabled()

    if agent_type not in VALID_AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid agent type: {agent_type}")

    try:
        policy = await model_policy_crud.upsert_policy(
            db=db,
            workspace_id=current_user.workspace_id,
            agent_type=agent_type,
            data=body.model_dump(exclude_none=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return policy


@router.delete("/models/{agent_type}", status_code=204)
async def delete_model_policy(
    agent_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a workspace model policy (reverts to system defaults)."""
    _check_prospecting_enabled()

    if agent_type not in VALID_AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid agent type: {agent_type}")

    deleted = await model_policy_crud.delete_policy(
        db, current_user.workspace_id, agent_type,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="No policy found for this agent type")


# ---------------------------------------------------------------------------
# Personalization Settings (OpenRouter API Key + Model ID)
# ---------------------------------------------------------------------------

@router.get(
    "/personalization/settings",
    response_model=PersonalizationSettingsResponse,
)
async def get_personalization_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get workspace personalization settings for lead copy generation."""
    _check_prospecting_enabled()
    return await openrouter_settings_service.get_settings(
        db=db,
        workspace_id=current_user.workspace_id,
    )


@router.patch(
    "/personalization/settings",
    response_model=PersonalizationSettingsResponse,
)
async def update_personalization_settings(
    body: PersonalizationSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update workspace personalization OpenRouter settings."""
    _check_prospecting_enabled()
    try:
        return await openrouter_settings_service.update_settings(
            db=db,
            workspace_id=current_user.workspace_id,
            api_key=body.api_key,
            model_id=body.model_id,
            clear_api_key=body.clear_api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
