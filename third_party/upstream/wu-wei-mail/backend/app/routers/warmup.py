"""Warmup routes — managed email warmup with provider integration.

All endpoints are scoped under /api/warmup and require JWT + workspace_id.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.schemas.warmup import (
    WarmupProgramCreate, WarmupProgramResponse,
    WarmupEnrollRequest, WarmupPauseRequest,
    WarmupAccountStatusResponse,
    WarmupActionResponse,
)
from app.services.warmup_service import warmup_service

router = APIRouter()


def _check_warmup_enabled():
    """Raise 404 if warmup feature flag is off."""
    settings = get_settings()
    if not settings.WARMUP_ENABLED:
        raise HTTPException(status_code=404, detail="Warmup is not enabled")


# ---------------------------------------------------------------------------
# Program CRUD
# ---------------------------------------------------------------------------

@router.post("/program", response_model=WarmupProgramResponse, status_code=201)
async def create_or_update_program(
    body: WarmupProgramCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the workspace warmup program (upsert)."""
    _check_warmup_enabled()

    program = await warmup_service.get_or_create_program(
        db=db,
        workspace_id=current_user.workspace_id,
        create_data=body.model_dump(),
    )
    return program


@router.get("/program", response_model=WarmupProgramResponse)
async def get_program(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the workspace warmup program."""
    _check_warmup_enabled()

    program = await warmup_service.get_program(db, current_user.workspace_id)
    if not program:
        raise HTTPException(status_code=404, detail="No warmup program configured")
    return program


# ---------------------------------------------------------------------------
# Account warmup lifecycle
# ---------------------------------------------------------------------------

@router.post("/accounts/{account_id}/start", response_model=WarmupAccountStatusResponse)
async def start_warmup(
    account_id: uuid.UUID,
    body: WarmupEnrollRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enroll an account in warmup."""
    _check_warmup_enabled()

    target = body.target_volume if body else 50
    try:
        await warmup_service.enroll_account(
            db=db,
            workspace_id=current_user.workspace_id,
            account_id=account_id,
            target_volume=target,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    status = await warmup_service.get_account_status(
        db=db,
        workspace_id=current_user.workspace_id,
        account_id=account_id,
    )
    return status


@router.post("/accounts/{account_id}/pause", response_model=WarmupAccountStatusResponse)
async def pause_warmup(
    account_id: uuid.UUID,
    body: WarmupPauseRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pause warmup for an account."""
    _check_warmup_enabled()

    reason = body.reason if body else None
    try:
        await warmup_service.pause_account(
            db=db,
            workspace_id=current_user.workspace_id,
            account_id=account_id,
            reason=reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    status = await warmup_service.get_account_status(
        db=db,
        workspace_id=current_user.workspace_id,
        account_id=account_id,
    )
    return status


@router.post("/accounts/{account_id}/resume", response_model=WarmupAccountStatusResponse)
async def resume_warmup(
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume warmup for a paused account."""
    _check_warmup_enabled()

    try:
        await warmup_service.resume_account(
            db=db,
            workspace_id=current_user.workspace_id,
            account_id=account_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    status = await warmup_service.get_account_status(
        db=db,
        workspace_id=current_user.workspace_id,
        account_id=account_id,
    )
    return status


@router.get("/accounts/{account_id}/status", response_model=WarmupAccountStatusResponse)
async def get_warmup_status(
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full warmup status for an account including metrics and risk flags."""
    _check_warmup_enabled()

    try:
        status = await warmup_service.get_account_status(
            db=db,
            workspace_id=current_user.workspace_id,
            account_id=account_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return status


@router.get("/accounts/{account_id}/timeline", response_model=list[WarmupActionResponse])
async def get_warmup_timeline(
    account_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the warmup action/event log for an account (paginated, newest first)."""
    _check_warmup_enabled()

    try:
        actions = await warmup_service.get_account_timeline(
            db=db,
            workspace_id=current_user.workspace_id,
            account_id=account_id,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return actions
