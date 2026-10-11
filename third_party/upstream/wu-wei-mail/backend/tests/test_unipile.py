"""Tests for Unipile integration layer — client, accounts, webhooks, user resolution."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.unipile.client import UnipileClient, UnipileError
from app.services.unipile.linkedin_users import LinkedInUserService
from app.services.unipile.webhooks import UnipileWebhookService, WEBHOOK_TYPE_MAP
from tests.conftest import TEST_WORKSPACE_ID


# ===================================================================
# Client tests
# ===================================================================

class TestUnipileClient:
    def test_headers(self):
        client = UnipileClient(api_key="test-key", base_url="https://api.test.com")
        headers = client._headers()
        assert headers["X-API-KEY"] == "test-key"
        assert headers["Content-Type"] == "application/json"


# ===================================================================
# LinkedIn user resolution
# ===================================================================

class TestLinkedInUserService:
    def test_extract_vanity_full_url(self):
        svc = LinkedInUserService()
        assert svc._extract_vanity("https://www.linkedin.com/in/john-doe-123/") == "john-doe-123"

    def test_extract_vanity_without_https(self):
        svc = LinkedInUserService()
        assert svc._extract_vanity("linkedin.com/in/janedoe") == "janedoe"

    def test_extract_vanity_invalid(self):
        svc = LinkedInUserService()
        assert svc._extract_vanity("https://example.com") is None

    def test_extract_vanity_empty(self):
        svc = LinkedInUserService()
        assert svc._extract_vanity("") is None


# ===================================================================
# Webhook normalization
# ===================================================================

class TestUnipileWebhookService:
    def test_webhook_type_map_coverage(self):
        """Ensure all expected webhook types are mapped."""
        assert "new_relation" in WEBHOOK_TYPE_MAP
        assert "message_received" in WEBHOOK_TYPE_MAP
        assert "account_connected" in WEBHOOK_TYPE_MAP
        assert "account_disconnected" in WEBHOOK_TYPE_MAP

    def test_verify_signature_no_secret_debug(self):
        """In debug mode with no secret, signature verification should pass."""
        svc = UnipileWebhookService()
        with patch("app.services.unipile.webhooks.get_settings") as mock_settings:
            settings = MagicMock()
            settings.WEBHOOK_SIGNING_SECRET = ""
            settings.DEBUG = True
            mock_settings.return_value = settings
            assert svc.verify_signature(b"test", "") is True

    def test_verify_signature_no_secret_production(self):
        """In production with no secret, signature verification should fail."""
        svc = UnipileWebhookService()
        with patch("app.services.unipile.webhooks.get_settings") as mock_settings:
            settings = MagicMock()
            settings.WEBHOOK_SIGNING_SECRET = ""
            settings.DEBUG = False
            mock_settings.return_value = settings
            assert svc.verify_signature(b"test", "") is False

    @pytest.mark.asyncio
    async def test_process_webhook_unknown_type(self):
        """Unknown event types should return None."""
        svc = UnipileWebhookService()
        db = AsyncMock()
        result = await svc.process_webhook(db, {"event": "unknown_event_type"})
        assert result is None

    @pytest.mark.asyncio
    async def test_process_webhook_no_workspace(self):
        """Events from unresolvable accounts should return None."""
        svc = UnipileWebhookService()
        db = AsyncMock()

        # Mock _resolve_workspace to return None
        svc._resolve_workspace = AsyncMock(return_value=None)

        result = await svc.process_webhook(db, {
            "event": "new_relation",
            "account_id": "unknown_account",
        })
        assert result is None


# ===================================================================
# Outreach API tests
# ===================================================================

class TestOutreachAPI:
    @pytest.mark.asyncio
    async def test_list_accounts(self, client):
        with patch("app.routers.outreach.unipile_account_service") as svc:
            svc.list_accounts = AsyncMock(return_value=[])
            resp = await client.get("/api/outreach/accounts")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_accounts_with_channel_filter(self, client):
        with patch("app.routers.outreach.unipile_account_service") as svc:
            svc.list_accounts = AsyncMock(return_value=[])
            resp = await client.get("/api/outreach/accounts?channel=linkedin")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_generate_auth_link(self, client):
        with patch("app.routers.outreach.unipile_account_service") as svc:
            svc.generate_hosted_auth_link = AsyncMock(return_value={"url": "https://auth.unipile.com/test"})
            resp = await client.post("/api/outreach/accounts/linkedin/hosted-auth-link")
        assert resp.status_code == 200
        assert "url" in resp.json()

    @pytest.mark.asyncio
    async def test_disconnect_account(self, client):
        account_id = uuid.uuid4()
        with patch("app.routers.outreach.unipile_account_service") as svc:
            svc.disconnect_account = AsyncMock()
            resp = await client.post(f"/api/outreach/accounts/{account_id}/disconnect")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_disconnect_account_not_found(self, client):
        account_id = uuid.uuid4()
        with patch("app.routers.outreach.unipile_account_service") as svc:
            svc.disconnect_account = AsyncMock(side_effect=ValueError("Not found"))
            resp = await client.post(f"/api/outreach/accounts/{account_id}/disconnect")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unipile_callback_invalid_workspace(self, client):
        resp = await client.post(
            "/api/outreach/accounts/unipile-callback",
            json={"name": "not-a-uuid", "account_id": "test"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_webhook_processed(self, client):
        with patch("app.routers.outreach.unipile_webhook_service") as svc:
            svc.verify_signature = MagicMock(return_value=True)
            mock_event = MagicMock()
            mock_event.id = uuid.uuid4()
            svc.process_webhook = AsyncMock(return_value=mock_event)
            resp = await client.post(
                "/api/outreach/webhooks/unipile",
                json={"event": "new_relation", "account_id": "test"},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "processed"

    @pytest.mark.asyncio
    async def test_webhook_invalid_signature(self, client):
        with patch("app.routers.outreach.unipile_webhook_service") as svc:
            svc.verify_signature = MagicMock(return_value=False)
            resp = await client.post(
                "/api/outreach/webhooks/unipile",
                json={"event": "test"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_auth_required_on_accounts(self, unauth_client):
        resp = await unauth_client.get("/api/outreach/accounts")
        assert resp.status_code == 401
