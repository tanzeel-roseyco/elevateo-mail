"""Tests for inbox routes — threads, messages, reply, mark read, stats."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


def _make_inbox_message(**overrides):
    """Create a mock InboxMessage with sensible defaults."""
    msg = MagicMock()
    msg.id = overrides.get("id", uuid.uuid4())
    msg.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    msg.account_id = overrides.get("account_id", uuid.uuid4())
    msg.campaign_id = overrides.get("campaign_id", None)
    msg.lead_id = overrides.get("lead_id", None)
    msg.message_id = overrides.get("message_id", f"<{uuid.uuid4()}@example.com>")
    msg.in_reply_to = overrides.get("in_reply_to", None)
    msg.thread_id = overrides.get("thread_id", f"thread-{uuid.uuid4()}")
    msg.from_email = overrides.get("from_email", "lead@example.com")
    msg.to_email = overrides.get("to_email", "me@company.com")
    msg.subject = overrides.get("subject", "Re: Hello")
    msg.body_text = overrides.get("body_text", "Thanks for reaching out.")
    msg.body_html = overrides.get("body_html", None)
    msg.direction = overrides.get("direction", "inbound")
    msg.is_read = overrides.get("is_read", False)
    msg.is_auto_reply = overrides.get("is_auto_reply", False)
    msg.received_at = overrides.get("received_at", datetime.now(timezone.utc))
    msg.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    return msg


def _make_thread(**overrides):
    """Create a mock thread dict matching InboxService.list_threads output."""
    return {
        "thread_id": overrides.get("thread_id", f"thread-{uuid.uuid4()}"),
        "subject": overrides.get("subject", "Re: Hello"),
        "lead_email": overrides.get("lead_email", "lead@example.com"),
        "account_email": overrides.get("account_email", "me@company.com"),
        "message_count": overrides.get("message_count", 3),
        "last_message_at": overrides.get("last_message_at", datetime.now(timezone.utc).isoformat()),
        "is_read": overrides.get("is_read", False),
        "messages": overrides.get("messages", []),
    }


# ---------------------------------------------------------------------------
# GET /api/inbox/threads
# ---------------------------------------------------------------------------

class TestListThreads:

    async def test_list_threads_empty(self, client):
        with patch(
            "app.routers.inbox.inbox_sync_service.sync_workspace_accounts",
            new_callable=AsyncMock,
            return_value={"skipped": True},
        ) as mock_sync, patch(
            "app.routers.inbox.inbox_service.list_threads",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = await client.get("/api/inbox/threads")
        assert resp.status_code == 200
        assert resp.json() == []
        mock_sync.assert_awaited_once()

    async def test_list_threads_with_data(self, client):
        threads = [
            _make_thread(subject="Sales Inquiry"),
            _make_thread(subject="Follow-up"),
        ]
        with patch(
            "app.routers.inbox.inbox_sync_service.sync_workspace_accounts",
            new_callable=AsyncMock,
            return_value={"skipped": True},
        ), patch(
            "app.routers.inbox.inbox_service.list_threads",
            new_callable=AsyncMock,
            return_value=threads,
        ):
            resp = await client.get("/api/inbox/threads")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["subject"] == "Sales Inquiry"
        assert data[1]["subject"] == "Follow-up"

    async def test_list_threads_with_pagination(self, client):
        with patch(
            "app.routers.inbox.inbox_sync_service.sync_workspace_accounts",
            new_callable=AsyncMock,
            return_value={"skipped": True},
        ), patch(
            "app.routers.inbox.inbox_service.list_threads",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_list:
            resp = await client.get("/api/inbox/threads?skip=10&limit=25")
        assert resp.status_code == 200
        mock_list.assert_called_once()
        call_kwargs = mock_list.call_args
        # Verify skip/limit were passed through
        assert call_kwargs.kwargs.get("skip") == 10 or call_kwargs[1].get("skip") == 10
        assert call_kwargs.kwargs.get("limit") == 25 or call_kwargs[1].get("limit") == 25

    async def test_list_threads_unread_only(self, client):
        with patch(
            "app.routers.inbox.inbox_sync_service.sync_workspace_accounts",
            new_callable=AsyncMock,
            return_value={"skipped": True},
        ), patch(
            "app.routers.inbox.inbox_service.list_threads",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_list:
            resp = await client.get("/api/inbox/threads?unread_only=true")
        assert resp.status_code == 200
        mock_list.assert_called_once()
        call_kwargs = mock_list.call_args
        assert call_kwargs.kwargs.get("unread_only") is True or call_kwargs[1].get("unread_only") is True


# ---------------------------------------------------------------------------
# GET /api/inbox/threads/{thread_id}/messages (get_thread)
# ---------------------------------------------------------------------------

class TestGetThreadMessages:

    async def test_get_thread_found(self, client):
        thread_id = "thread-abc123"
        messages = [
            _make_inbox_message(thread_id=thread_id, subject="Hello"),
            _make_inbox_message(thread_id=thread_id, subject="Re: Hello"),
        ]
        thread_detail = {
            "thread_id": thread_id,
            "subject": "Hello",
            "lead_email": "lead@example.com",
            "account_email": "me@company.com",
            "message_count": 2,
            "last_message_at": datetime.now(timezone.utc),
            "is_read": False,
            "messages": messages,
        }
        with patch(
            "app.routers.inbox.inbox_service.get_thread_detail",
            new_callable=AsyncMock,
            return_value=thread_detail,
        ):
            resp = await client.get(f"/api/inbox/threads/{thread_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["thread_id"] == thread_id
        assert len(data["messages"]) == 2

    async def test_get_thread_not_found(self, client):
        with patch(
            "app.routers.inbox.inbox_service.get_thread_detail",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = await client.get("/api/inbox/threads/nonexistent")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /api/inbox/threads/{thread_id}/read
# ---------------------------------------------------------------------------

class TestMarkThreadRead:

    async def test_mark_thread_read(self, client):
        thread_id = "thread-abc123"
        with patch(
            "app.routers.inbox.inbox_service.mark_thread_read",
            new_callable=AsyncMock,
            return_value=3,
        ):
            resp = await client.post(f"/api/inbox/threads/{thread_id}/read")
        assert resp.status_code == 200
        assert resp.json()["marked_read"] == 3

    async def test_mark_thread_read_none_unread(self, client):
        with patch(
            "app.routers.inbox.inbox_service.mark_thread_read",
            new_callable=AsyncMock,
            return_value=0,
        ):
            resp = await client.post("/api/inbox/threads/thread-xyz/read")
        assert resp.status_code == 200
        assert resp.json()["marked_read"] == 0


# ---------------------------------------------------------------------------
# POST /api/inbox/reply
# ---------------------------------------------------------------------------

class TestReply:

    async def test_reply_success(self, client, mock_db):
        account_id = uuid.uuid4()
        mock_account = MagicMock()
        mock_account.id = account_id
        mock_account.email = "me@company.com"
        mock_account.workspace_id = TEST_WORKSPACE_ID

        # Mock db.execute to return the account for the SELECT query
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_account
        mock_db.execute.return_value = mock_result

        with patch(
            "app.routers.inbox.email_sender.send",
            new_callable=AsyncMock,
            return_value="<msg-id-123@company.com>",
        ):
            resp = await client.post("/api/inbox/reply", json={
                "to_email": "lead@example.com",
                "account_id": str(account_id),
                "subject": "Re: Hello",
                "body": "Thanks for your interest!",
                "thread_id": "thread-abc123",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "sent"
        assert data["message_id"] == "<msg-id-123@company.com>"

    async def test_reply_account_not_found(self, client, mock_db):
        # Mock db.execute to return None (account not found)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        resp = await client.post("/api/inbox/reply", json={
            "to_email": "lead@example.com",
            "account_id": str(uuid.uuid4()),
            "subject": "Re: Hello",
            "body": "Thanks!",
        })
        assert resp.status_code == 404
        assert "Account not found" in resp.json()["detail"]

    async def test_reply_smtp_failure(self, client, mock_db):
        account_id = uuid.uuid4()
        mock_account = MagicMock()
        mock_account.id = account_id
        mock_account.email = "me@company.com"
        mock_account.workspace_id = TEST_WORKSPACE_ID

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_account
        mock_db.execute.return_value = mock_result

        with patch(
            "app.routers.inbox.email_sender.send",
            new_callable=AsyncMock,
            side_effect=ConnectionError("SMTP send failed"),
        ):
            resp = await client.post("/api/inbox/reply", json={
                "to_email": "lead@example.com",
                "account_id": str(account_id),
                "subject": "Re: Hello",
                "body": "Thanks!",
                "thread_id": "thread-abc123",
            })
        assert resp.status_code == 502

    async def test_reply_missing_fields(self, client):
        """Missing required fields returns 422."""
        resp = await client.post("/api/inbox/reply", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/inbox/stats
# ---------------------------------------------------------------------------

class TestInboxStats:

    async def test_inbox_stats(self, client):
        with patch(
            "app.routers.inbox.inbox_service.get_stats",
            new_callable=AsyncMock,
            return_value={"total": 42, "unread": 7, "auto_replies": 3},
        ):
            resp = await client.get("/api/inbox/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 42
        assert data["unread"] == 7
        assert data["auto_replies"] == 3

    async def test_inbox_stats_empty(self, client):
        with patch(
            "app.routers.inbox.inbox_service.get_stats",
            new_callable=AsyncMock,
            return_value={"total": 0, "unread": 0, "auto_replies": 0},
        ):
            resp = await client.get("/api/inbox/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["unread"] == 0


# ---------------------------------------------------------------------------
# Unauthenticated access
# ---------------------------------------------------------------------------

class TestInboxUnauthenticated:

    async def test_unauthenticated_threads(self, unauth_client):
        resp = await unauth_client.get("/api/inbox/threads")
        assert resp.status_code == 401

    async def test_unauthenticated_stats(self, unauth_client):
        resp = await unauth_client.get("/api/inbox/stats")
        assert resp.status_code == 401

    async def test_unauthenticated_reply(self, unauth_client):
        resp = await unauth_client.post("/api/inbox/reply", json={
            "to_email": "x@y.com",
            "account_id": str(uuid.uuid4()),
            "subject": "Hi",
            "body": "Hello",
        })
        assert resp.status_code == 401

    async def test_unauthenticated_mark_read(self, unauth_client):
        resp = await unauth_client.post("/api/inbox/threads/thread-123/read")
        assert resp.status_code == 401
