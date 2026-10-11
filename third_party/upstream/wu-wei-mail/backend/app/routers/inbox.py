"""Inbox routes — threads, messages, reply, mark read."""

import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.schemas.inbox import InboxMessageResponse, InboxThreadResponse, InboxReplyRequest, InboxStats
from app.services.inbox_service import inbox_service
from app.services.inbox_sync_service import inbox_sync_service
from app.services.email_sender import email_sender
from app.models.email_account import EmailAccount
from app.models.inbox_message import InboxMessage
from sqlalchemy import select

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/threads", response_model=list[InboxThreadResponse])
async def list_threads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await inbox_sync_service.sync_workspace_accounts(
            db=db,
            workspace_id=current_user.workspace_id,
        )
    except Exception as exc:
        logger.warning("Non-fatal inbox sync error for workspace %s: %s", current_user.workspace_id, exc)

    threads = await inbox_service.list_threads(
        db, current_user.workspace_id, skip=skip, limit=limit, unread_only=unread_only,
    )
    return threads


@router.get("/threads/{thread_id}", response_model=InboxThreadResponse)
async def get_thread(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    thread = await inbox_service.get_thread_detail(db, current_user.workspace_id, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


@router.post("/threads/{thread_id}/read")
async def mark_thread_read(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = await inbox_service.mark_thread_read(db, current_user.workspace_id, thread_id)
    return {"marked_read": count}


@router.post("/messages/{message_id}/read")
async def mark_message_read(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await inbox_service.mark_read(db, message_id, current_user.workspace_id)
    return {"status": "ok"}


@router.post("/reply")
async def reply_to_message(
    req: InboxReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a reply from a workspace email account."""
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.id == req.account_id,
            EmailAccount.workspace_id == current_user.workspace_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        message_id = await email_sender.send(
            to=req.to_email,
            subject=req.subject,
            body=req.body,
            account=account,
        )

        # Record outbound message in inbox
        outbound = InboxMessage(
            workspace_id=current_user.workspace_id,
            account_id=account.id,
            message_id=message_id,
            thread_id=req.thread_id,
            from_email=account.email,
            to_email=req.to_email,
            subject=req.subject,
            body_text=req.body,
            direction="outbound",
            is_read=True,
        )
        db.add(outbound)
        await db.flush()

        return {"status": "sent", "message_id": message_id}
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats", response_model=InboxStats)
async def inbox_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stats = await inbox_service.get_stats(db, current_user.workspace_id)
    return InboxStats(**stats)
