"""Email account routes — CRUD + DNS verification + connection testing."""

from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.utils.security import get_current_user
from app.utils.encryption import encrypt, decrypt
from app.models.user import User
from app.models.email_account import EmailAccount
from app.schemas.account import (
    AccountCreate, AccountUpdate, AccountResponse,
    DNSCheckResponse, ConnectionTestResponse,
)
from app.utils.dns_checker import dns_checker
from app.services.email_sender import email_sender, resolve_smtp_security

router = APIRouter()

GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
MICROSOFT_PROFILE_URL = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"


def _expected_provider_email(account: EmailAccount) -> str:
    return (account.provider_email or account.email or "").strip().lower()


def _oauth_profile_email(provider: str, payload: dict) -> str:
    if provider == "google":
        return str(payload.get("emailAddress") or "").strip().lower()
    if provider == "microsoft":
        return str(payload.get("mail") or payload.get("userPrincipalName") or "").strip().lower()
    return ""


def _provider_label(provider: str) -> str:
    if provider == "google":
        return "Google"
    if provider == "microsoft":
        return "Microsoft"
    return provider.title()


async def _verify_oauth_provider(account: EmailAccount) -> ConnectionTestResponse:
    """Verify OAuth account by calling the provider's authenticated profile endpoint."""
    provider = account.provider
    profile_url = GMAIL_PROFILE_URL if provider == "google" else MICROSOFT_PROFILE_URL
    provider_label = _provider_label(provider)

    try:
        access_token = await email_sender._ensure_oauth_token(account)
    except ConnectionError as exc:
        return ConnectionTestResponse(
            success=False,
            smtp_ok=False,
            smtp_error=str(exc),
            message=f"{provider_label} OAuth token is missing or expired. Please reconnect the account.",
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(profile_url, headers={"Authorization": f"Bearer {access_token}"})
        if resp.status_code == 401:
            try:
                access_token = await email_sender._refresh_token(account)
            except ConnectionError as exc:
                return ConnectionTestResponse(
                    success=False,
                    smtp_ok=False,
                    smtp_error=str(exc),
                    message=f"{provider_label} OAuth refresh failed. Please reconnect the account.",
                )
            resp = await client.get(profile_url, headers={"Authorization": f"Bearer {access_token}"})

    if resp.status_code >= 400:
        return ConnectionTestResponse(
            success=False,
            smtp_ok=False,
            smtp_error=f"{provider_label} profile check failed with HTTP {resp.status_code}",
            message=f"{provider_label} rejected the OAuth token. Please reconnect the account.",
        )

    provider_email = _oauth_profile_email(provider, resp.json() or {})
    expected_email = _expected_provider_email(account)
    account_email = (account.email or "").strip().lower()
    if not provider_email:
        return ConnectionTestResponse(
            success=False,
            smtp_ok=False,
            smtp_error=f"{provider_label} profile response did not include an email address",
            message=f"{provider_label} token worked, but the account identity could not be confirmed.",
        )

    if provider_email not in {expected_email, account_email}:
        return ConnectionTestResponse(
            success=False,
            smtp_ok=False,
            smtp_error=f"{provider_label} authenticated as {provider_email}, expected {expected_email}",
            message="OAuth token is valid, but it belongs to a different mailbox. Please reconnect the account.",
        )

    return ConnectionTestResponse(
        success=True,
        smtp_ok=True,
        message=f"{provider_label} OAuth connection verified for {provider_email}.",
    )


@router.get("/", response_model=list[AccountResponse])
async def list_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmailAccount)
        .where(EmailAccount.workspace_id == current_user.workspace_id)
        .order_by(EmailAccount.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.id == account_id,
            EmailAccount.workspace_id == current_user.workspace_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/", response_model=AccountResponse, status_code=201)
async def create_account(
    req: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = req.model_dump()
    # Normalize email to lowercase for consistent matching
    if data.get("email"):
        data["email"] = data["email"].strip().lower()
    # Encrypt sensitive credentials before storage
    if data.get("smtp_password"):
        data["smtp_password"] = encrypt(data["smtp_password"])
    if data.get("imap_password"):
        data["imap_password"] = encrypt(data["imap_password"])
    account = EmailAccount(workspace_id=current_user.workspace_id, **data)
    db.add(account)
    await db.flush()
    return account


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID,
    req: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.id == account_id,
            EmailAccount.workspace_id == current_user.workspace_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    for key, value in req.model_dump(exclude_none=True).items():
        # Encrypt password fields on update
        if key in ("smtp_password", "imap_password") and value:
            value = encrypt(value)
        setattr(account, key, value)
    await db.flush()
    return account


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.id == account_id,
            EmailAccount.workspace_id == current_user.workspace_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.flush()


@router.post("/{account_id}/verify-dns", response_model=DNSCheckResponse)
async def verify_dns(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run SPF/DKIM/DMARC checks and update the account record."""
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.id == account_id,
            EmailAccount.workspace_id == current_user.workspace_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    check_result = dns_checker.check_all(account.email)

    # Update account with verification results
    account.spf_verified = check_result["spf"]["valid"]
    account.dkim_verified = check_result["dkim"]["valid"]
    account.dmarc_verified = check_result["dmarc"]["valid"]
    await db.flush()

    return DNSCheckResponse(**check_result)


@router.post("/{account_id}/test-connection", response_model=ConnectionTestResponse)
async def test_connection(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test SMTP connectivity for a manual email account."""
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.id == account_id,
            EmailAccount.workspace_id == current_user.workspace_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # OAuth accounts don't use SMTP; verify the token against the provider.
    if account.provider in ("google", "microsoft"):
        return await _verify_oauth_provider(account)

    # Manual accounts — test actual SMTP login
    if not account.smtp_host:
        return ConnectionTestResponse(
            success=False,
            smtp_ok=False,
            smtp_error="No SMTP host configured",
            message="SMTP host is not set. Please update your account settings.",
        )

    import aiosmtplib

    smtp_ok = True
    smtp_error = None
    try:
        smtp_password = decrypt(account.smtp_password) if account.smtp_password else None
        use_tls, start_tls = resolve_smtp_security(account.smtp_port, account.smtp_use_tls)
        smtp = aiosmtplib.SMTP(
            hostname=account.smtp_host,
            port=account.smtp_port,
            use_tls=use_tls,
            start_tls=start_tls,
            timeout=15,
        )
        await smtp.connect()
        if account.smtp_username and smtp_password:
            await smtp.login(account.smtp_username, smtp_password)
        await smtp.quit()
    except Exception as exc:
        smtp_ok = False
        smtp_error = str(exc)

    message = "SMTP connection successful!" if smtp_ok else f"SMTP connection failed: {smtp_error}"
    return ConnectionTestResponse(
        success=smtp_ok, smtp_ok=smtp_ok, smtp_error=smtp_error, message=message,
    )
