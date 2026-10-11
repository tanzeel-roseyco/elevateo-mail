"""Unit tests for inbox sync service."""

import base64
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services.inbox_sync_service import InboxSyncService


class _ScalarList:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _QueryResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return _ScalarList(self._items)


def _b64(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


class TestInboxSyncService:

    def test_normalize_gmail_message_extracts_inbound_fields(self):
        service = InboxSyncService()
        message = {
            "snippet": "Fallback snippet",
            "payload": {
                "mimeType": "multipart/alternative",
                "headers": [
                    {"name": "From", "value": "Lead <lead@example.com>"},
                    {"name": "To", "value": "Me <me@company.com>"},
                    {"name": "Subject", "value": "Re: Intro"},
                    {"name": "Message-ID", "value": "abc123@example.com"},
                    {"name": "In-Reply-To", "value": "<sent123@company.com>"},
                ],
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": _b64("Thanks for the email")}},
                    {"mimeType": "text/html", "body": {"data": _b64("<p>Thanks for the email</p>")}},
                ],
            },
        }

        normalized = service._normalize_gmail_message("me@company.com", message)

        assert normalized is not None
        assert normalized["from_email"] == "lead@example.com"
        assert normalized["to_email"] == "me@company.com"
        assert normalized["subject"] == "Re: Intro"
        assert normalized["message_id"] == "<abc123@example.com>"
        assert normalized["in_reply_to"] == "<sent123@company.com>"
        assert "Thanks for the email" in (normalized["body_text"] or "")

    def test_normalize_gmail_message_skips_outbound_self_messages(self):
        service = InboxSyncService()
        message = {
            "payload": {
                "headers": [
                    {"name": "From", "value": "Me <me@company.com>"},
                    {"name": "Subject", "value": "Sent message"},
                ]
            }
        }

        normalized = service._normalize_gmail_message("me@company.com", message)
        assert normalized is None

    async def test_sync_workspace_accounts_skips_when_cooldown_active(self):
        service = InboxSyncService()
        workspace_id = uuid.uuid4()
        service._last_workspace_sync[str(workspace_id)] = datetime.now(timezone.utc)

        db = AsyncMock()
        result = await service.sync_workspace_accounts(db=db, workspace_id=workspace_id)

        assert result["skipped"] is True
        assert result["reason"] == "cooldown"
        assert db.execute.await_count == 0

    async def test_sync_workspace_accounts_force_calls_account_sync(self):
        service = InboxSyncService()
        workspace_id = uuid.uuid4()

        account = SimpleNamespace(email="me@company.com", id=uuid.uuid4())
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_QueryResult([account]))

        with patch.object(
            service,
            "_sync_google_account",
            new=AsyncMock(return_value={"created": 2, "duplicates": 1, "failed": 0}),
        ) as mock_sync:
            result = await service.sync_workspace_accounts(
                db=db,
                workspace_id=workspace_id,
                force=True,
            )

        assert result["skipped"] is False
        assert result["accounts"] == 1
        assert result["created"] == 2
        assert result["duplicates"] == 1
        assert result["failed"] == 0
        mock_sync.assert_awaited_once()
