"""Auto-responder routes — AI-powered inbound email response management."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.models.inbox_message import InboxMessage
from app.models.email_account import EmailAccount
from app.models.auto_responder import ResponderLog
from app.services.auto_responder_service import auto_responder_service
from app.services.email_sender import email_sender
from app.schemas.auto_responder import (
    AutoResponderConfigResponse,
    AutoResponderConfigUpdate,
    ResponderRegionCreate,
    ResponderRegionResponse,
    ResponderRegionUpdate,
    ResponderRuleCreate,
    ResponderRuleResponse,
    ResponderRuleUpdate,
    ResponderNoteCreate,
    ResponderNoteResponse,
    ResponderLogResponse,
    ResponderQueueResponse,
    AutoResponderAnalyticsSummary,
    AutoResponderTimeSeriesPoint,
    AutoResponderRegionStats,
    AIProviderTestRequest,
    AIProviderTestResponse,
)

from datetime import datetime, timezone

router = APIRouter()


# ── Config ────────────────────────────────────────────────────────────────

@router.get("/config", response_model=AutoResponderConfigResponse)
async def get_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await auto_responder_service.get_or_create_config(db, current_user.workspace_id)
    return config


@router.patch("/config", response_model=AutoResponderConfigResponse)
async def update_config(
    req: AutoResponderConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = req.model_dump(exclude_none=True)
    config = await auto_responder_service.update_config(db, current_user.workspace_id, data)
    return config


@router.post("/config/test", response_model=AIProviderTestResponse)
async def test_ai_provider(
    req: AIProviderTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await auto_responder_service.get_or_create_config(db, current_user.workspace_id)
    api_key = auto_responder_service.get_decrypted_api_key(config)
    if not api_key:
        return AIProviderTestResponse(success=False, error="No OpenRouter API key configured")

    try:
        from app.services.ai_provider import generate_response
        result = await generate_response(
            api_key=api_key,
            model=config.ai_model,
            system_prompt="You are a helpful assistant. Respond briefly.",
            user_prompt=req.test_message,
        )
        return AIProviderTestResponse(
            success=True,
            response_preview=result.get("body", "")[:200],
        )
    except Exception as e:
        return AIProviderTestResponse(success=False, error=str(e))


# ── Regions ───────────────────────────────────────────────────────────────

@router.get("/regions", response_model=list[ResponderRegionResponse])
async def list_regions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    regions = await auto_responder_service.list_regions(db, current_user.workspace_id)
    return regions


@router.post("/regions", response_model=ResponderRegionResponse, status_code=201)
async def create_region(
    req: ResponderRegionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = req.model_dump()
    if "conditions" in data and hasattr(data["conditions"], "model_dump"):
        data["conditions"] = data["conditions"].model_dump()
    elif "conditions" in data and isinstance(data["conditions"], dict):
        pass  # already a dict
    region = await auto_responder_service.create_region(db, current_user.workspace_id, data)
    return region


@router.get("/regions/{region_id}", response_model=ResponderRegionResponse)
async def get_region(
    region_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.auto_responder import ResponderRegion
    result = await db.execute(
        select(ResponderRegion).where(
            ResponderRegion.id == region_id,
            ResponderRegion.workspace_id == current_user.workspace_id,
        )
    )
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    return region


@router.patch("/regions/{region_id}", response_model=ResponderRegionResponse)
async def update_region(
    region_id: UUID,
    req: ResponderRegionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = req.model_dump(exclude_none=True)
    if "conditions" in data and hasattr(data["conditions"], "model_dump"):
        data["conditions"] = data["conditions"].model_dump()
    region = await auto_responder_service.update_region(db, region_id, current_user.workspace_id, data)
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    return region


@router.delete("/regions/{region_id}", status_code=204)
async def delete_region(
    region_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not await auto_responder_service.delete_region(db, region_id, current_user.workspace_id):
        raise HTTPException(status_code=404, detail="Region not found")


# ── Rules ─────────────────────────────────────────────────────────────────

@router.get("/rules", response_model=list[ResponderRuleResponse])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rules = await auto_responder_service.list_rules(db, current_user.workspace_id)
    return rules


@router.post("/rules", response_model=ResponderRuleResponse, status_code=201)
async def create_rule(
    req: ResponderRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = await auto_responder_service.create_rule(db, current_user.workspace_id, req.model_dump())
    return rule


@router.patch("/rules/{rule_id}", response_model=ResponderRuleResponse)
async def update_rule(
    rule_id: UUID,
    req: ResponderRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = await auto_responder_service.update_rule(db, rule_id, current_user.workspace_id, req.model_dump(exclude_none=True))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not await auto_responder_service.delete_rule(db, rule_id, current_user.workspace_id):
        raise HTTPException(status_code=404, detail="Rule not found")


# ── Queue ─────────────────────────────────────────────────────────────────

@router.get("/queue", response_model=ResponderQueueResponse)
async def get_queue(
    status: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = await auto_responder_service.get_queue(
        db, current_user.workspace_id, status, campaign_id, skip, limit
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/queue/{message_id}/approve")
async def approve_queue_item(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve an escalated message — send the generated AI response."""
    result = await db.execute(
        select(InboxMessage).where(
            InboxMessage.id == message_id,
            InboxMessage.workspace_id == current_user.workspace_id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.responder_status != "escalated":
        raise HTTPException(status_code=400, detail="Message is not in escalated status")

    # Get the log with generated body
    log_result = await db.execute(
        select(ResponderLog).where(
            ResponderLog.inbox_message_id == message_id
        ).order_by(ResponderLog.created_at.desc()).limit(1)
    )
    log = log_result.scalar_one_or_none()
    if not log or not log.generated_body:
        raise HTTPException(status_code=400, detail="No generated response available")

    # Get the account to send from
    account_result = await db.execute(
        select(EmailAccount).where(EmailAccount.id == msg.account_id)
    )
    account = account_result.scalar_one_or_none()
    if not account or not account.is_active:
        raise HTTPException(status_code=400, detail="Sending account not available")

    # Get config for signature
    config = await auto_responder_service.get_or_create_config(db, current_user.workspace_id)
    body = log.generated_body
    if config.signature_template:
        body += f"\n\n{config.signature_template}"

    # Send the email
    sent_message_id = await email_sender.send(
        to=msg.from_email,
        subject=f"Re: {msg.subject}",
        body=body,
        account=account,
        in_reply_to=msg.message_id,
        html=False,
    )

    # Create outbound InboxMessage
    outbound = InboxMessage(
        workspace_id=current_user.workspace_id,
        account_id=account.id,
        campaign_id=msg.campaign_id,
        lead_id=msg.lead_id,
        message_id=sent_message_id,
        in_reply_to=msg.message_id,
        thread_id=msg.thread_id,
        from_email=account.email,
        to_email=msg.from_email,
        subject=f"Re: {msg.subject}",
        body_text=body,
        direction="outbound",
        is_read=True,
        is_auto_reply=True,
    )
    db.add(outbound)
    await db.flush()

    msg.responder_status = "responded"
    log.status = "sent"
    log.response_message_id = outbound.id
    log.sent_at = datetime.now(timezone.utc)
    await db.flush()

    return {"status": "sent", "message_id": str(outbound.id)}


@router.post("/queue/{message_id}/reject")
async def reject_queue_item(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject an escalated message — dismiss without sending."""
    result = await db.execute(
        select(InboxMessage).where(
            InboxMessage.id == message_id,
            InboxMessage.workspace_id == current_user.workspace_id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.responder_status = "skipped"

    log_result = await db.execute(
        select(ResponderLog).where(
            ResponderLog.inbox_message_id == message_id
        ).order_by(ResponderLog.created_at.desc()).limit(1)
    )
    log = log_result.scalar_one_or_none()
    if log:
        log.status = "rejected"

    await db.flush()
    return {"status": "rejected"}


@router.post("/queue/{message_id}/retry")
async def retry_queue_item(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run AI generation for a message."""
    result = await db.execute(
        select(InboxMessage).where(
            InboxMessage.id == message_id,
            InboxMessage.workspace_id == current_user.workspace_id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.responder_status = "pending"
    await db.flush()

    from app.workers.auto_responder_worker import process_auto_response
    process_auto_response.delay(str(message_id))

    return {"status": "queued"}


# ── Notes ─────────────────────────────────────────────────────────────────

@router.get("/notes/{message_id}", response_model=list[ResponderNoteResponse])
async def list_notes(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notes = await auto_responder_service.list_notes(db, current_user.workspace_id, message_id)
    return notes


@router.post("/notes/{message_id}", response_model=ResponderNoteResponse, status_code=201)
async def create_note(
    message_id: UUID,
    req: ResponderNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await auto_responder_service.create_note(
        db, current_user.workspace_id, message_id,
        author_type="user", author_id=current_user.id,
        data=req.model_dump(),
    )
    return note


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not await auto_responder_service.delete_note(db, note_id, current_user.workspace_id):
        raise HTTPException(status_code=404, detail="Note not found")


# ── Logs ──────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=dict)
async def list_logs(
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs, total = await auto_responder_service.list_logs(
        db, current_user.workspace_id, status, skip, limit
    )
    items = [ResponderLogResponse.model_validate(log) for log in logs]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ── Analytics ─────────────────────────────────────────────────────────────

@router.get("/analytics/summary", response_model=AutoResponderAnalyticsSummary)
async def analytics_summary(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await auto_responder_service.get_analytics_summary(db, current_user.workspace_id, days)


@router.get("/analytics/time-series", response_model=list[AutoResponderTimeSeriesPoint])
async def analytics_time_series(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await auto_responder_service.get_analytics_time_series(db, current_user.workspace_id, days)


@router.get("/analytics/regions", response_model=list[AutoResponderRegionStats])
async def analytics_regions(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await auto_responder_service.get_analytics_regions(db, current_user.workspace_id, days)
