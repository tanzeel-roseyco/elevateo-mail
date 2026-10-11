"""Unipile webhook parsing, verification, and event normalization.

Handles webhook payloads from Unipile and converts them into
normalised OutreachEvent records for the workflow engine.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.workflow import OutreachAccount, OutreachEvent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Webhook event types we handle
# ---------------------------------------------------------------------------

WEBHOOK_TYPE_MAP = {
    "new_relation": "invite_accepted",
    "message_received": "linkedin_message_received",
    "account_connected": "account_status_change",
    "account_disconnected": "account_status_change",
    "account_error": "account_status_change",
}


class UnipileWebhookService:
    """Parse and normalise Unipile webhook events."""

    def verify_signature(self, payload_bytes: bytes, signature: str) -> bool:
        """Verify webhook HMAC-SHA256 signature.

        Returns True if valid or if no signing secret configured (dev mode).
        """
        settings = get_settings()
        secret = settings.WEBHOOK_SIGNING_SECRET
        if not secret:
            if not settings.DEBUG:
                logger.error("Webhook signing secret not set in production — rejecting")
                return False
            return True

        expected = hmac.new(
            secret.encode(), payload_bytes, hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    async def process_webhook(
        self,
        db: AsyncSession,
        payload: dict[str, Any],
    ) -> OutreachEvent | None:
        """Process a Unipile webhook payload into a normalised OutreachEvent.

        Returns the created event, or None if the event type is unhandled.
        """
        event_type_raw = payload.get("event", payload.get("type", ""))
        normalised_type = WEBHOOK_TYPE_MAP.get(event_type_raw)

        if not normalised_type:
            logger.debug("Ignoring unhandled Unipile webhook type: %s", event_type_raw)
            return None

        # Resolve workspace from account_id
        account_id = payload.get("account_id", "")
        workspace_id = await self._resolve_workspace(db, account_id)

        if not workspace_id:
            logger.warning("Cannot resolve workspace for Unipile account %s", account_id)
            return None

        # Build idempotency key from provider event ID
        provider_event_id = payload.get("id", payload.get("event_id", ""))
        idempotency_key = f"unipile:{event_type_raw}:{provider_event_id}" if provider_event_id else None

        # Check idempotency
        if idempotency_key:
            existing = await db.execute(
                select(OutreachEvent).where(OutreachEvent.idempotency_key == idempotency_key).limit(1)
            )
            if existing.scalar_one_or_none():
                logger.debug("Duplicate webhook ignored: %s", idempotency_key)
                return None

        event = OutreachEvent(
            workspace_id=workspace_id,
            event_type=normalised_type,
            channel="linkedin",
            provider_event_id=provider_event_id or None,
            idempotency_key=idempotency_key,
            payload=payload,
        )
        db.add(event)
        await db.flush()

        logger.info("Created outreach event %s (%s) for workspace %s", event.id, normalised_type, workspace_id)

        # Handle specific event side-effects
        if normalised_type == "invite_accepted":
            await self._handle_invite_accepted(db, workspace_id, payload)
        elif normalised_type == "account_status_change":
            await self._handle_account_status(db, account_id, payload)

        return event

    async def _resolve_workspace(
        self,
        db: AsyncSession,
        provider_account_id: str,
    ) -> uuid.UUID | None:
        """Look up workspace_id from the outreach_accounts table."""
        if not provider_account_id:
            return None
        result = await db.execute(
            select(OutreachAccount.workspace_id).where(
                OutreachAccount.provider_account_id == provider_account_id,
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def _handle_invite_accepted(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> None:
        """Side effect: when an invite is accepted, wake waiting lead states.

        This will be connected to the workflow runtime in a later iteration.
        """
        logger.info(
            "LinkedIn invite accepted in workspace %s — will wake waiting lead states (TODO: connect to runtime)",
            workspace_id,
        )

    async def _handle_account_status(
        self,
        db: AsyncSession,
        provider_account_id: str,
        payload: dict[str, Any],
    ) -> None:
        """Side effect: update outreach account status from webhook."""
        event_type = payload.get("event", payload.get("type", ""))
        new_status = {
            "account_connected": "connected",
            "account_disconnected": "disconnected",
            "account_error": "reconnecting",
        }.get(event_type, "disconnected")

        result = await db.execute(
            select(OutreachAccount).where(
                OutreachAccount.provider_account_id == provider_account_id,
            )
        )
        account = result.scalar_one_or_none()
        if account:
            account.status = new_status
            await db.flush()
            logger.info("Updated outreach account %s status to %s", provider_account_id, new_status)


unipile_webhook_service = UnipileWebhookService()
