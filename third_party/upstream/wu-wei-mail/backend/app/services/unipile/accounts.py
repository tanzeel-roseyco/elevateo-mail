"""Unipile account management — hosted auth link generation and callback binding."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.workflow import OutreachAccount
from app.services.unipile.client import UnipileClient

logger = logging.getLogger(__name__)


class UnipileAccountService:
    """Manage LinkedIn accounts via Unipile hosted auth."""

    def __init__(self, client: UnipileClient | None = None):
        self._client = client or UnipileClient()

    async def generate_hosted_auth_link(
        self,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Generate a Unipile hosted auth URL for LinkedIn account connection.

        Returns dict with 'url' the user should be redirected to.
        """
        settings = get_settings()
        callback_url = f"{settings.BASE_URL}/api/outreach/accounts/unipile-callback"

        result = await self._client.post("/hosted/accounts/link", json={
            "type": "create",
            "providers": ["LINKEDIN"],
            "api_url": settings.UNIPILE_BASE_URL,
            "success_redirect_url": f"{settings.FRONTEND_URL}/settings?tab=channels&status=success",
            "failure_redirect_url": f"{settings.FRONTEND_URL}/settings?tab=channels&status=failure",
            "notify_url": callback_url,
            "expiresOn": "2099-01-01T00:00:00.000Z",
            "name": str(workspace_id),
        })
        return {"url": result.get("url", ""), "object": result}

    async def handle_callback(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> OutreachAccount:
        """Process the Unipile callback after successful hosted auth.

        Creates or updates an OutreachAccount record.
        """
        account_id = payload.get("account_id", "")
        provider = payload.get("provider", "LINKEDIN").lower()

        # Fetch account details from Unipile
        try:
            account_info = await self._client.get(f"/accounts/{account_id}")
        except Exception:
            logger.warning("Failed to fetch account info from Unipile for %s", account_id)
            account_info = {}

        display_name = account_info.get("name", "")
        profile_url = account_info.get("profile_url", "")

        # Check if account already exists
        result = await db.execute(
            select(OutreachAccount).where(
                OutreachAccount.workspace_id == workspace_id,
                OutreachAccount.provider_account_id == account_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.status = "connected"
            existing.display_name = display_name or existing.display_name
            existing.profile_url = profile_url or existing.profile_url
            await db.flush()
            return existing

        outreach_account = OutreachAccount(
            workspace_id=workspace_id,
            channel="linkedin",
            provider="unipile",
            provider_account_id=account_id,
            status="connected",
            display_name=display_name,
            profile_url=profile_url,
            daily_invitation_limit=80,
            daily_message_limit=150,
        )
        db.add(outreach_account)
        await db.flush()
        return outreach_account

    async def list_accounts(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        channel: str | None = None,
    ) -> list[OutreachAccount]:
        """List outreach accounts for a workspace, optionally filtered by channel."""
        query = select(OutreachAccount).where(
            OutreachAccount.workspace_id == workspace_id,
        )
        if channel:
            query = query.where(OutreachAccount.channel == channel)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def disconnect_account(
        self,
        db: AsyncSession,
        account_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> None:
        """Disconnect an outreach account (marks as disconnected, doesn't delete)."""
        result = await db.execute(
            select(OutreachAccount).where(
                OutreachAccount.id == account_id,
                OutreachAccount.workspace_id == workspace_id,
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            raise ValueError("Account not found")
        account.status = "disconnected"
        await db.flush()


unipile_account_service = UnipileAccountService()
