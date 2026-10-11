"""Tests for workspace API token management routes."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


def _make_token(**overrides):
    token = MagicMock()
    token.id = overrides.get("id", uuid.uuid4())
    token.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    token.created_by_user_id = overrides.get("created_by_user_id", TEST_USER_ID)
    token.name = overrides.get("name", "Agent token")
    token.token_prefix = overrides.get("token_prefix", "wwm_live_abcd1234")
    token.scopes = overrides.get("scopes", ["full_access"])
    token.is_active = overrides.get("is_active", True)
    token.expires_at = overrides.get("expires_at", None)
    token.last_used_at = overrides.get("last_used_at", None)
    token.last_used_ip = overrides.get("last_used_ip", None)
    token.revoked_at = overrides.get("revoked_at", None)
    token.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    token.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return token


class TestApiTokenManagement:
    async def test_create_token_returns_raw_token_once(self, client):
        token = _make_token()
        with patch(
            "app.routers.developer.api_token_service.create_token",
            new_callable=AsyncMock,
            return_value=(token, "wwm_live_abcd1234_secret"),
        ):
            resp = await client.post("/api/developer/tokens", json={
                "name": "Campaign agent",
                "scopes": ["campaigns:read", "campaigns:write"],
            })

        assert resp.status_code == 201
        body = resp.json()
        assert body["token"] == "wwm_live_abcd1234_secret"
        assert body["token_prefix"] == "wwm_live_abcd1234"

    async def test_list_tokens_never_returns_raw_token(self, client):
        with patch(
            "app.routers.developer.api_token_service.list_tokens",
            new_callable=AsyncMock,
            return_value=[_make_token()],
        ):
            resp = await client.get("/api/developer/tokens")

        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert "token" not in item
        assert item["token_prefix"].startswith("wwm_live_")

    async def test_revoke_token(self, client):
        token = _make_token(is_active=False, revoked_at=datetime.now(timezone.utc))
        with patch(
            "app.routers.developer.api_token_service.revoke_token",
            new_callable=AsyncMock,
            return_value=token,
        ):
            resp = await client.delete(f"/api/developer/tokens/{token.id}")

        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


class TestApiTokenScopeValidation:
    async def test_unknown_scope_rejected(self, client):
        resp = await client.post("/api/developer/tokens", json={
            "name": "Bad token",
            "scopes": ["campaigns:destroy"],
        })

        assert resp.status_code == 422
