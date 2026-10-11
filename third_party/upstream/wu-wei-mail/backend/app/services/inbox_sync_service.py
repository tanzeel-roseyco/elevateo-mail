"""Inbox sync service for pulling inbound replies from OAuth providers."""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_account import EmailAccount
from app.models.inbox_message import InboxMessage
from app.services.email_sender import email_sender
from app.services.inbound_service import inbound_service

logger = logging.getLogger(__name__)

GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
SYNC_WORKSPACE_COOLDOWN_SECONDS = 45
DEFAULT_MAX_MESSAGES_PER_ACCOUNT = 25
MAX_MESSAGES_PER_ACCOUNT = 100


class InboxSyncService:
    """Best-effort inbound sync for connected mailbox providers."""

    def __init__(self) -> None:
        self._last_workspace_sync: dict[str, datetime] = {}

    async def sync_workspace_accounts(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        *,
        max_messages_per_account: int = DEFAULT_MAX_MESSAGES_PER_ACCOUNT,
        force: bool = False,
    ) -> dict[str, Any]:
        """Sync inbound replies for OAuth accounts in a workspace."""
        workspace_key = str(workspace_id)
        now = datetime.now(timezone.utc)

        if not force:
            last_sync = self._last_workspace_sync.get(workspace_key)
            if last_sync and now - last_sync < timedelta(seconds=SYNC_WORKSPACE_COOLDOWN_SECONDS):
                return {
                    "workspace_id": workspace_key,
                    "skipped": True,
                    "reason": "cooldown",
                    "accounts": 0,
                    "created": 0,
                    "duplicates": 0,
                    "failed": 0,
                }

        per_account_cap = max(1, min(int(max_messages_per_account), MAX_MESSAGES_PER_ACCOUNT))
        result = await db.execute(
            select(EmailAccount).where(
                EmailAccount.workspace_id == workspace_id,
                EmailAccount.is_active.is_(True),
                EmailAccount.provider == "google",
                EmailAccount.oauth_access_token.is_not(None),
            )
        )
        accounts = list(result.scalars().all())
        self._last_workspace_sync[workspace_key] = now

        total_created = 0
        total_duplicates = 0
        total_failed = 0
        processed_accounts = 0

        for account in accounts:
            try:
                stats = await self._sync_google_account(
                    db,
                    account,
                    max_messages=per_account_cap,
                )
                processed_accounts += 1
                total_created += int(stats.get("created", 0))
                total_duplicates += int(stats.get("duplicates", 0))
                total_failed += int(stats.get("failed", 0))
            except Exception as exc:
                logger.warning(
                    "Inbox sync failed for account %s: %s",
                    account.email,
                    exc,
                )
                total_failed += 1

        return {
            "workspace_id": workspace_key,
            "skipped": False,
            "accounts": processed_accounts,
            "created": total_created,
            "duplicates": total_duplicates,
            "failed": total_failed,
        }

    async def _sync_google_account(
        self,
        db: AsyncSession,
        account: EmailAccount,
        *,
        max_messages: int,
    ) -> dict[str, int]:
        access_token = await email_sender._ensure_oauth_token(account)
        headers = {"Authorization": f"Bearer {access_token}"}
        params = {
            "labelIds": "INBOX",
            "maxResults": max_messages,
            "q": "in:inbox newer_than:14d",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            list_response = await client.get(GMAIL_MESSAGES_URL, headers=headers, params=params)
            if list_response.status_code == 401:
                access_token = await email_sender._refresh_token(account)
                headers["Authorization"] = f"Bearer {access_token}"
                list_response = await client.get(GMAIL_MESSAGES_URL, headers=headers, params=params)
            list_response.raise_for_status()
            items = (list_response.json() or {}).get("messages", []) or []

            parsed_messages: list[dict[str, Any]] = []
            for item in items:
                gmail_id = str(item.get("id") or "").strip()
                if not gmail_id:
                    continue
                detail = await client.get(
                    f"{GMAIL_MESSAGES_URL}/{gmail_id}",
                    headers=headers,
                    params={"format": "full"},
                )
                if detail.status_code == 401:
                    access_token = await email_sender._refresh_token(account)
                    headers["Authorization"] = f"Bearer {access_token}"
                    detail = await client.get(
                        f"{GMAIL_MESSAGES_URL}/{gmail_id}",
                        headers=headers,
                        params={"format": "full"},
                    )
                if detail.status_code >= 400:
                    logger.warning(
                        "Skipping Gmail message %s for %s due to status %s",
                        gmail_id,
                        account.email,
                        detail.status_code,
                    )
                    continue
                parsed = self._normalize_gmail_message(account.email, detail.json() or {})
                if parsed:
                    parsed_messages.append(parsed)

        if not parsed_messages:
            return {"created": 0, "duplicates": 0, "failed": 0}

        message_ids = [m["message_id"] for m in parsed_messages if m.get("message_id")]
        existing_message_ids: set[str] = set()
        if message_ids:
            existing = await db.execute(
                select(InboxMessage.message_id).where(
                    InboxMessage.account_id == account.id,
                    InboxMessage.message_id.in_(message_ids),
                )
            )
            existing_message_ids = {m for m in existing.scalars().all() if m}

        created = 0
        duplicates = 0
        failed = 0

        for inbound in parsed_messages:
            message_id = inbound.get("message_id")
            if message_id and message_id in existing_message_ids:
                duplicates += 1
                continue
            try:
                await inbound_service.process_inbound(db, inbound)
                created += 1
                if message_id:
                    existing_message_ids.add(message_id)
            except Exception as exc:
                failed += 1
                logger.warning(
                    "Failed to process synced inbound message for %s: %s",
                    account.email,
                    exc,
                )

        return {"created": created, "duplicates": duplicates, "failed": failed}

    def _normalize_gmail_message(self, account_email: str, message: dict[str, Any]) -> dict[str, Any] | None:
        payload = message.get("payload") or {}
        headers = self._gmail_headers_to_dict(payload.get("headers") or [])
        from_email = self._extract_address(headers.get("from"))
        if not from_email or from_email == account_email.lower():
            return None

        body_text, body_html = self._extract_message_bodies(payload, str(message.get("snippet") or ""))
        message_id = self._normalize_message_ref(headers.get("message-id"))
        in_reply_to = self._normalize_message_ref(headers.get("in-reply-to"))

        return {
            "from_email": from_email,
            # Use the connected account as destination for deterministic account matching.
            "to_email": account_email.lower(),
            "subject": headers.get("subject") or "(no subject)",
            "body_text": body_text,
            "body_html": body_html,
            "message_id": message_id,
            "in_reply_to": in_reply_to,
            "headers": headers,
            "content_type": payload.get("mimeType") or "",
        }

    def _extract_message_bodies(self, payload: dict[str, Any], snippet: str) -> tuple[str | None, str | None]:
        text_parts: list[str] = []
        html_parts: list[str] = []

        def walk(part: dict[str, Any]) -> None:
            mime_type = str(part.get("mimeType") or "").lower()
            body_data = ((part.get("body") or {}).get("data") or "").strip()
            decoded = self._decode_gmail_data(body_data)
            if decoded:
                if mime_type.startswith("text/plain"):
                    text_parts.append(decoded)
                elif mime_type.startswith("text/html"):
                    html_parts.append(decoded)
            for child in part.get("parts") or []:
                if isinstance(child, dict):
                    walk(child)

        walk(payload)
        body_text = "\n\n".join(p for p in text_parts if p).strip()
        body_html = "\n".join(p for p in html_parts if p).strip()

        if not body_text and snippet:
            body_text = snippet.strip()
        return (body_text or None, body_html or None)

    @staticmethod
    def _gmail_headers_to_dict(headers: list[dict[str, Any]]) -> dict[str, str]:
        out: dict[str, str] = {}
        for item in headers:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip().lower()
            if not name:
                continue
            out[name] = str(item.get("value") or "").strip()
        return out

    @staticmethod
    def _extract_address(value: str | None) -> str:
        if not value:
            return ""
        _, email = parseaddr(value)
        return (email or "").strip().lower()

    @staticmethod
    def _normalize_message_ref(value: str | None) -> str | None:
        token = str(value or "").strip()
        if not token:
            return None
        if token.startswith("<") and token.endswith(">"):
            return token
        if "@" in token:
            return f"<{token}>"
        return token

    @staticmethod
    def _decode_gmail_data(raw_data: str) -> str:
        if not raw_data:
            return ""
        padded = raw_data + "=" * (-len(raw_data) % 4)
        try:
            decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
            return decoded.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""


inbox_sync_service = InboxSyncService()
