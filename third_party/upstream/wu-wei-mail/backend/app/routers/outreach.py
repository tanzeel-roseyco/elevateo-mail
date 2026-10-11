"""Outreach routes — LinkedIn account management, Unipile webhooks."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.unipile.accounts import unipile_account_service
from app.services.unipile.webhooks import unipile_webhook_service
from app.utils.security import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# LinkedIn account management
# ---------------------------------------------------------------------------

@router.post("/accounts/linkedin/hosted-auth-link")
async def generate_hosted_auth_link(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a Unipile hosted auth link for LinkedIn account connection."""
    try:
        result = await unipile_account_service.generate_hosted_auth_link(
            workspace_id=current_user.workspace_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to generate auth link: {e}")


@router.post("/accounts/unipile-callback")
async def unipile_callback(
    body: dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """Handle Unipile hosted auth callback.

    This endpoint is called by Unipile when account auth completes.
    The workspace_id is encoded in the 'name' field of the hosted auth request.
    """
    workspace_id_str = body.get("name", "")
    try:
        workspace_id = UUID(workspace_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid workspace_id in callback")

    try:
        account = await unipile_account_service.handle_callback(db, workspace_id, body)
        return {"status": "ok", "account_id": str(account.id)}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/accounts")
async def list_outreach_accounts(
    channel: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List outreach accounts for the current workspace."""
    accounts = await unipile_account_service.list_accounts(
        db, current_user.workspace_id, channel=channel,
    )
    return [
        {
            "id": str(a.id),
            "channel": a.channel,
            "provider": a.provider,
            "status": a.status,
            "display_name": a.display_name,
            "profile_url": a.profile_url,
            "health_score": a.health_score,
            "daily_invitation_limit": a.daily_invitation_limit,
            "daily_message_limit": a.daily_message_limit,
        }
        for a in accounts
    ]


@router.post("/accounts/{account_id}/disconnect")
async def disconnect_outreach_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disconnect an outreach account."""
    try:
        await unipile_account_service.disconnect_account(db, account_id, current_user.workspace_id)
        return {"status": "disconnected"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Unipile webhooks
# ---------------------------------------------------------------------------

@router.post("/webhooks/unipile")
async def unipile_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ingest Unipile webhook events and normalise to outreach_events.

    Note: this endpoint has no auth dependency — it uses webhook signature
    verification instead.
    """
    body_bytes = await request.body()
    signature = request.headers.get("x-unipile-signature", "")

    if not unipile_webhook_service.verify_signature(body_bytes, signature):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    try:
        import json
        payload = json.loads(body_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = await unipile_webhook_service.process_webhook(db, payload)
    return {"status": "processed", "event_id": str(event.id) if event else None}
