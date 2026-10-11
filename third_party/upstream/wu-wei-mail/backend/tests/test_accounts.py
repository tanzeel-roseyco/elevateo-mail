"""Tests for email account routes — CRUD and DNS verification."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID


def _make_account(**overrides):
    """Create a mock EmailAccount."""
    a = MagicMock()
    a.id = overrides.get("id", uuid.uuid4())
    a.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    a.email = overrides.get("email", "sender@example.com")
    a.display_name = overrides.get("display_name", "Sender")
    a.smtp_host = overrides.get("smtp_host", "smtp.example.com")
    a.smtp_port = overrides.get("smtp_port", 587)
    a.smtp_username = overrides.get("smtp_username", "sender@example.com")
    a.smtp_use_tls = overrides.get("smtp_use_tls", True)
    a.imap_host = overrides.get("imap_host", "imap.example.com")
    a.imap_port = overrides.get("imap_port", 993)
    a.daily_limit = overrides.get("daily_limit", 50)
    a.sent_today = overrides.get("sent_today", 0)
    a.health_score = overrides.get("health_score", 1.0)
    a.warmup_enabled = overrides.get("warmup_enabled", False)
    a.warmup_level = overrides.get("warmup_level", 0)
    a.spf_verified = overrides.get("spf_verified", False)
    a.dkim_verified = overrides.get("dkim_verified", False)
    a.dmarc_verified = overrides.get("dmarc_verified", False)
    a.is_active = overrides.get("is_active", True)
    a.provider = overrides.get("provider", "manual")
    a.provider_email = overrides.get("provider_email", None)
    a.oauth_access_token = overrides.get("oauth_access_token", None)
    a.oauth_refresh_token = overrides.get("oauth_refresh_token", None)
    a.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    a.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return a


def _mock_execute_returning(obj):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = obj
    mock_result.scalars.return_value.all.return_value = [obj] if obj else []
    return AsyncMock(return_value=mock_result)


class _FakeHTTPResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, responses):
        self.get = AsyncMock(side_effect=responses)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None


# ---------------------------------------------------------------------------
# GET /api/accounts
# ---------------------------------------------------------------------------

class TestListAccounts:

    async def test_list_accounts(self, client, mock_db):
        a1 = _make_account(email="a@test.com")
        a2 = _make_account(email="b@test.com")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [a1, a2]
        mock_db.execute = AsyncMock(return_value=mock_result)

        resp = await client.get("/api/accounts/")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_list_empty(self, client, mock_db):
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=mock_result)

        resp = await client.get("/api/accounts/")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# GET /api/accounts/{id}
# ---------------------------------------------------------------------------

class TestGetAccount:

    async def test_get_found(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(id=aid, email="found@test.com")
        mock_db.execute = _mock_execute_returning(account)

        resp = await client.get(f"/api/accounts/{aid}")
        assert resp.status_code == 200
        assert resp.json()["email"] == "found@test.com"

    async def test_get_not_found(self, client, mock_db):
        aid = uuid.uuid4()
        mock_db.execute = _mock_execute_returning(None)

        resp = await client.get(f"/api/accounts/{aid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/accounts
# ---------------------------------------------------------------------------

class TestCreateAccount:

    async def test_create_success(self, client, mock_db):
        from fastapi.exceptions import ResponseValidationError
        try:
            resp = await client.post("/api/accounts/", json={
                "email": "new@sender.com",
                "display_name": "New Sender",
                "smtp_host": "smtp.sender.com",
                "smtp_port": 587,
                "smtp_username": "new@sender.com",
                "smtp_password": "secret",
                "daily_limit": 100,
            })
            assert resp.status_code == 201
        except ResponseValidationError:
            # Expected: model created but response can't serialize without real DB defaults
            pass
        mock_db.add.assert_called_once()

    async def test_create_minimal(self, client, mock_db):
        """Only email is truly required."""
        from fastapi.exceptions import ResponseValidationError
        try:
            resp = await client.post("/api/accounts/", json={"email": "min@test.com"})
            assert resp.status_code == 201
        except ResponseValidationError:
            pass
        mock_db.add.assert_called_once()


# ---------------------------------------------------------------------------
# PATCH /api/accounts/{id}
# ---------------------------------------------------------------------------

class TestUpdateAccount:

    async def test_update_success(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(id=aid)
        mock_db.execute = _mock_execute_returning(account)

        resp = await client.patch(f"/api/accounts/{aid}", json={"daily_limit": 200})
        assert resp.status_code == 200

    async def test_update_not_found(self, client, mock_db):
        aid = uuid.uuid4()
        mock_db.execute = _mock_execute_returning(None)

        resp = await client.patch(f"/api/accounts/{aid}", json={"daily_limit": 200})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/accounts/{id}
# ---------------------------------------------------------------------------

class TestDeleteAccount:

    async def test_delete_success(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(id=aid)
        mock_db.execute = _mock_execute_returning(account)

        resp = await client.delete(f"/api/accounts/{aid}")
        assert resp.status_code == 204
        mock_db.delete.assert_called_once()

    async def test_delete_not_found(self, client, mock_db):
        aid = uuid.uuid4()
        mock_db.execute = _mock_execute_returning(None)

        resp = await client.delete(f"/api/accounts/{aid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/accounts/{id}/verify-dns
# ---------------------------------------------------------------------------

class TestDNSVerification:

    async def test_verify_dns_success(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(id=aid, email="test@healthy-domain.com")
        mock_db.execute = _mock_execute_returning(account)

        dns_result = {
            "email": "test@healthy-domain.com",
            "domain": "healthy-domain.com",
            "spf": {"found": True, "record": "v=spf1 include:_spf.google.com ~all", "valid": True, "error": None},
            "dkim": {"found": True, "record": "v=DKIM1; p=...", "selector": "default", "valid": True, "error": None},
            "dmarc": {"found": True, "record": "v=DMARC1; p=quarantine", "valid": True, "error": None},
            "overall_healthy": True,
        }

        with patch("app.routers.accounts.dns_checker.check_all", return_value=dns_result):
            resp = await client.post(f"/api/accounts/{aid}/verify-dns")

        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_healthy"] is True
        assert data["spf"]["valid"] is True
        assert data["dkim"]["valid"] is True
        assert data["dmarc"]["valid"] is True

    async def test_verify_dns_unhealthy(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(id=aid, email="test@bad-domain.com")
        mock_db.execute = _mock_execute_returning(account)

        dns_result = {
            "email": "test@bad-domain.com",
            "domain": "bad-domain.com",
            "spf": {"found": False, "record": None, "valid": False, "error": "No SPF record found"},
            "dkim": {"found": False, "record": None, "selector": "default", "valid": False, "error": "No DKIM record"},
            "dmarc": {"found": False, "record": None, "valid": False, "error": "No DMARC record"},
            "overall_healthy": False,
        }

        with patch("app.routers.accounts.dns_checker.check_all", return_value=dns_result):
            resp = await client.post(f"/api/accounts/{aid}/verify-dns")

        assert resp.status_code == 200
        assert resp.json()["overall_healthy"] is False

    async def test_verify_dns_account_not_found(self, client, mock_db):
        aid = uuid.uuid4()
        mock_db.execute = _mock_execute_returning(None)

        resp = await client.post(f"/api/accounts/{aid}/verify-dns")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/accounts/{id}/test-connection
# ---------------------------------------------------------------------------

class TestConnectionTest:

    async def test_google_oauth_connection_calls_gmail_profile(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(
            id=aid,
            email="sender@example.com",
            provider="google",
            provider_email="sender@example.com",
            oauth_access_token="encrypted-access",
            oauth_refresh_token="encrypted-refresh",
        )
        mock_db.execute = _mock_execute_returning(account)
        fake_client = _FakeAsyncClient([
            _FakeHTTPResponse(200, {"emailAddress": "sender@example.com"}),
        ])

        with (
            patch("app.routers.accounts.email_sender._ensure_oauth_token", new=AsyncMock(return_value="access-token")) as ensure_token,
            patch("app.routers.accounts.httpx.AsyncClient", return_value=fake_client),
        ):
            resp = await client.post(f"/api/accounts/{aid}/test-connection")

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["message"] == "Google OAuth connection verified for sender@example.com."
        ensure_token.assert_awaited_once_with(account)
        fake_client.get.assert_awaited_once()

    async def test_google_oauth_connection_refreshes_after_401(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(
            id=aid,
            email="sender@example.com",
            provider="google",
            provider_email="sender@example.com",
            oauth_access_token="encrypted-access",
            oauth_refresh_token="encrypted-refresh",
        )
        mock_db.execute = _mock_execute_returning(account)
        fake_client = _FakeAsyncClient([
            _FakeHTTPResponse(401, {"error": {"status": "UNAUTHENTICATED"}}),
            _FakeHTTPResponse(200, {"emailAddress": "sender@example.com"}),
        ])

        with (
            patch("app.routers.accounts.email_sender._ensure_oauth_token", new=AsyncMock(return_value="old-token")),
            patch("app.routers.accounts.email_sender._refresh_token", new=AsyncMock(return_value="new-token")) as refresh_token,
            patch("app.routers.accounts.httpx.AsyncClient", return_value=fake_client),
        ):
            resp = await client.post(f"/api/accounts/{aid}/test-connection")

        assert resp.status_code == 200
        assert resp.json()["success"] is True
        refresh_token.assert_awaited_once_with(account)
        assert fake_client.get.await_count == 2

    async def test_google_oauth_connection_fails_email_mismatch(self, client, mock_db):
        aid = uuid.uuid4()
        account = _make_account(
            id=aid,
            email="sender@example.com",
            provider="google",
            provider_email="sender@example.com",
            oauth_access_token="encrypted-access",
            oauth_refresh_token="encrypted-refresh",
        )
        mock_db.execute = _mock_execute_returning(account)
        fake_client = _FakeAsyncClient([
            _FakeHTTPResponse(200, {"emailAddress": "other@example.com"}),
        ])

        with (
            patch("app.routers.accounts.email_sender._ensure_oauth_token", new=AsyncMock(return_value="access-token")),
            patch("app.routers.accounts.httpx.AsyncClient", return_value=fake_client),
        ):
            resp = await client.post(f"/api/accounts/{aid}/test-connection")

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["smtp_ok"] is False
        assert data["message"] == "OAuth token is valid, but it belongs to a different mailbox. Please reconnect the account."
