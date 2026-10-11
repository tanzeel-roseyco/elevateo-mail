"""Unipile LinkedIn messaging service — send and fetch chat messages."""

from __future__ import annotations

import logging
from typing import Any

from app.services.unipile.client import UnipileClient

logger = logging.getLogger(__name__)


class LinkedInMessageService:
    """Send and retrieve LinkedIn messages via Unipile."""

    def __init__(self, client: UnipileClient | None = None):
        self._client = client or UnipileClient()

    async def send_message(
        self,
        account_id: str,
        chat_id: str,
        text: str,
    ) -> dict[str, Any]:
        """Send a message in an existing LinkedIn conversation.

        Args:
            account_id: Unipile account ID.
            chat_id: Unipile chat/conversation ID.
            text: Message body.

        Returns:
            Unipile API response dict.
        """
        result = await self._client.post(f"/chats/{chat_id}/messages", json={
            "account_id": account_id,
            "text": text,
        })
        logger.info("Sent LinkedIn message in chat %s via account %s", chat_id, account_id)
        return result

    async def get_chat_messages(
        self,
        chat_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Fetch messages from a LinkedIn chat."""
        result = await self._client.get(
            f"/chats/{chat_id}/messages",
            params={"limit": limit},
        )
        return result.get("items", []) if isinstance(result, dict) else []

    async def get_chats(
        self,
        account_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List recent chats for an account."""
        result = await self._client.get(
            "/chats",
            params={"account_id": account_id, "limit": limit},
        )
        return result.get("items", []) if isinstance(result, dict) else []


linkedin_message_service = LinkedInMessageService()
