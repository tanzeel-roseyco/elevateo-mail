"""OAuth2 callback routes for Google and Microsoft email account connections."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.email_account import EmailAccount
from app.models.user import User
from app.services import oauth_service
from app.utils.encryption import encrypt
from app.utils.security import create_access_token, decode_access_token, get_current_user

settings = get_settings()
router = APIRouter()


def _google_configured() -> bool:
    return bool(
        settings.GOOGLE_CLIENT_ID
        and settings.GOOGLE_CLIENT_SECRET
        and settings.GOOGLE_REDIRECT_URI
    )


def _microsoft_configured() -> bool:
    return bool(
        settings.MICROSOFT_CLIENT_ID
        and settings.MICROSOFT_CLIENT_SECRET
        and settings.MICROSOFT_REDIRECT_URI
    )


@router.get("/providers")
async def oauth_providers():
    """Return OAuth provider availability for frontend gating."""
    return {
        "google": {"enabled": _google_configured()},
        "microsoft": {"enabled": _microsoft_configured()},
    }


def _build_oauth_state(user: User) -> str:
    """Encode user_id + workspace_id into a short-lived JWT for OAuth state."""
    return create_access_token(
        data={
            "sub": str(user.id),
            "workspace_id": str(user.workspace_id),
            "purpose": "oauth_state",
        },
        expires_delta=timedelta(minutes=15),
    )


def _decode_oauth_state(state: str) -> dict:
    """Decode and validate the OAuth state JWT."""
    payload = decode_access_token(state)
    if payload.get("purpose") != "oauth_state":
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    return payload


@router.get("/google/authorize")
async def google_authorize(current_user: User = Depends(get_current_user)):
    """Return the Google OAuth2 consent URL."""
    if not _google_configured():
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    state = _build_oauth_state(current_user)
    auth_url = oauth_service.get_google_auth_url(state)
    return {"auth_url": auth_url}


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle the Google OAuth2 callback and persist tokens."""
    payload = _decode_oauth_state(state)
    _ = UUID(payload["sub"])
    workspace_id = UUID(payload["workspace_id"])

    try:
        token_data = await oauth_service.exchange_google_code(code)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Google token exchange failed: {exc}")

    email = token_data["email"].strip().lower()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))

    existing_result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.workspace_id == workspace_id,
            EmailAccount.email == email,
        )
    )
    account = existing_result.scalar_one_or_none()

    if account:
        account.oauth_access_token = encrypt(token_data["access_token"])
        if token_data.get("refresh_token"):
            account.oauth_refresh_token = encrypt(token_data["refresh_token"])
        account.oauth_token_expires_at = expires_at
        account.provider = "google"
        account.display_name = token_data.get("name") or account.display_name
        if not account.is_active:
            account.is_active = True
    else:
        account = EmailAccount(
            workspace_id=workspace_id,
            email=email,
            display_name=token_data.get("name"),
            provider="google",
            provider_email=email,
            oauth_access_token=encrypt(token_data["access_token"]),
            oauth_refresh_token=encrypt(token_data["refresh_token"]) if token_data.get("refresh_token") else None,
            oauth_token_expires_at=expires_at,
            smtp_host=None,
            smtp_username=None,
            smtp_password=None,
        )
        db.add(account)
    await db.flush()

    redirect_url = f"{settings.FRONTEND_URL}/accounts?connected=google"
    return RedirectResponse(url=redirect_url)


@router.get("/microsoft/authorize")
async def microsoft_authorize(current_user: User = Depends(get_current_user)):
    """Return the Microsoft OAuth2 consent URL."""
    if not _microsoft_configured():
        raise HTTPException(status_code=501, detail="Microsoft OAuth not configured")
    state = _build_oauth_state(current_user)
    auth_url = oauth_service.get_microsoft_auth_url(state)
    return {"auth_url": auth_url}


@router.get("/microsoft/callback")
async def microsoft_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle the Microsoft OAuth2 callback and persist tokens."""
    payload = _decode_oauth_state(state)
    _ = UUID(payload["sub"])
    workspace_id = UUID(payload["workspace_id"])

    try:
        token_data = await oauth_service.exchange_microsoft_code(code)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Microsoft token exchange failed: {exc}")

    email = token_data["email"].strip().lower()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))

    existing_result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.workspace_id == workspace_id,
            EmailAccount.email == email,
        )
    )
    account = existing_result.scalar_one_or_none()

    if account:
        account.oauth_access_token = encrypt(token_data["access_token"])
        if token_data.get("refresh_token"):
            account.oauth_refresh_token = encrypt(token_data["refresh_token"])
        account.oauth_token_expires_at = expires_at
        account.provider = "microsoft"
        account.display_name = token_data.get("name") or account.display_name
        if not account.is_active:
            account.is_active = True
    else:
        account = EmailAccount(
            workspace_id=workspace_id,
            email=email,
            display_name=token_data.get("name"),
            provider="microsoft",
            provider_email=email,
            oauth_access_token=encrypt(token_data["access_token"]),
            oauth_refresh_token=encrypt(token_data["refresh_token"]) if token_data.get("refresh_token") else None,
            oauth_token_expires_at=expires_at,
            smtp_host=None,
            smtp_username=None,
            smtp_password=None,
        )
        db.add(account)
    await db.flush()

    redirect_url = f"{settings.FRONTEND_URL}/accounts?connected=microsoft"
    return RedirectResponse(url=redirect_url)
