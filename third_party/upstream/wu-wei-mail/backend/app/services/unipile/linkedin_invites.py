"""Unipile LinkedIn invitation service — send connection requests."""

from __future__ import annotations

import logging
from typing import Any

from app.services.unipile.client import UnipileClient

logger = logging.getLogger(__name__)


class LinkedInInviteService:
    """Send and track LinkedIn connection invitations via Unipile."""

    def __init__(self, client: UnipileClient | None = None):
        self._client = client or UnipileClient()

    async def send_invite(
        self,
        account_id: str,
        provider_id: str,
        message: str = "",
    ) -> dict[str, Any]:
        """Send a LinkedIn connection invitation.

        Args:
            account_id: Unipile account ID.
            provider_id: LinkedIn provider ID of the target user.
            message: Optional personalised invitation message.

        Returns:
            Unipile API response dict.
        """
        payload: dict[str, Any] = {
            "account_id": account_id,
            "provider_id": provider_id,
        }
        if message:
            payload["message"] = message[:300]  # LinkedIn limit

        result = await self._client.post("/users/invite", json=payload)
        logger.info("Sent LinkedIn invite via account %s to %s", account_id, provider_id)
        return result

    async def list_pending_invites(
        self,
        account_id: str,
    ) -> list[dict[str, Any]]:
        """List pending (sent) invitations for an account."""
        result = await self._client.get(
            "/users/invitations",
            params={"account_id": account_id, "direction": "sent", "status": "pending"},
        )
        return result.get("items", []) if isinstance(result, dict) else []


linkedin_invite_service = LinkedInInviteService()
