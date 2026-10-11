"""Tests for OAuth routes — Google/Microsoft authorize and callbacks."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


# ---------------------------------------------------------------------------
# GET /api/oauth/providers
# ---------------------------------------------------------------------------

class TestOAuthProviders:

    async def test_returns_provider_availability(self, client):
        resp = await client.get("/api/oauth/providers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["google"]["enabled"] is True
        assert data["microsoft"]["enabled"] is True

    async def test_google_only_configuration(self, client):
        with patch("app.routers.oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = "google-client-id"
            mock_settings.GOOGLE_CLIENT_SECRET = "google-client-secret"
            mock_settings.GOOGLE_REDIRECT_URI = "http://localhost:8000/api/oauth/google/callback"
            mock_settings.MICROSOFT_CLIENT_ID = ""
            mock_settings.MICROSOFT_CLIENT_SECRET = ""
            mock_settings.MICROSOFT_REDIRECT_URI = ""
            resp = await client.get("/api/oauth/providers")

        assert resp.status_code == 200
        data = resp.json()
        assert data["google"]["enabled"] is True
        assert data["microsoft"]["enabled"] is False


# ---------------------------------------------------------------------------
# GET /api/oauth/google/authorize
# ---------------------------------------------------------------------------

class TestGoogleAuthorize:

    async def test_returns_auth_url(self, client):
        with patch(
            "app.routers.oauth.oauth_service.get_google_auth_url",
            return_value="https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=xyz",
        ):
            resp = await client.get("/api/oauth/google/authorize")

        assert resp.status_code == 200
        data = resp.json()
        assert "auth_url" in data
        assert "accounts.google.com" in data["auth_url"]

    async def test_not_configured(self, client):
        """When GOOGLE_CLIENT_ID is empty → 501."""
        with patch("app.routers.oauth.settings") as mock_settings:
            mock_settings.GOOGLE_CLIENT_ID = ""
            resp = await client.get("/api/oauth/google/authorize")
        assert resp.status_code == 501


# ---------------------------------------------------------------------------
# GET /api/oauth/google/callback
# ---------------------------------------------------------------------------

class TestGoogleCallback:

    async def test_callback_success(self, client, mock_db):
        """Successful Google callback creates an email account and redirects."""
        # Create a valid state JWT
        from app.utils.security import create_access_token
        from datetime import timedelta
        state = create_access_token(
            data={
                "sub": str(TEST_USER_ID),
                "workspace_id": str(TEST_WORKSPACE_ID),
                "purpose": "oauth_state",
            },
            expires_delta=timedelta(minutes=15),
        )

        token_data = {
            "access_token": "google-access-token",
            "refresh_token": "google-refresh-token",
            "expires_in": 3600,
            "email": "user@gmail.com",
            "name": "Google User",
        }

        with patch(
            "app.routers.oauth.oauth_service.exchange_google_code",
            new_callable=AsyncMock,
            return_value=token_data,
        ):
            resp = await client.get(
                "/api/oauth/google/callback",
                params={"code": "auth-code-123", "state": state},
                follow_redirects=False,
            )

        # Should redirect to frontend
        assert resp.status_code == 307
        assert "connected=google" in resp.headers.get("location", "")
        mock_db.add.assert_called_once()

    async def test_callback_exchange_failure(self, client, mock_db):
        """Failed token exchange → 400."""
        from app.utils.security import create_access_token
        from datetime import timedelta
        state = create_access_token(
            data={
                "sub": str(TEST_USER_ID),
                "workspace_id": str(TEST_WORKSPACE_ID),
                "purpose": "oauth_state",
            },
            expires_delta=timedelta(minutes=15),
        )

        with patch(
            "app.routers.oauth.oauth_service.exchange_google_code",
            new_callable=AsyncMock,
            side_effect=ValueError("Network error"),
        ):
            resp = await client.get(
                "/api/oauth/google/callback",
                params={"code": "bad-code", "state": state},
                follow_redirects=False,
            )

        assert resp.status_code == 400
        assert "failed" in resp.json()["detail"].lower()

    async def test_callback_invalid_state(self, client, mock_db):
        """Invalid state JWT → 401."""
        resp = await client.get(
            "/api/oauth/google/callback",
            params={"code": "code", "state": "invalid-jwt"},
            follow_redirects=False,
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/oauth/microsoft/authorize
# ---------------------------------------------------------------------------

class TestMicrosoftAuthorize:

    async def test_returns_auth_url(self, client):
        with patch(
            "app.routers.oauth.oauth_service.get_microsoft_auth_url",
            return_value="https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test",
        ):
            resp = await client.get("/api/oauth/microsoft/authorize")

        assert resp.status_code == 200
        data = resp.json()
        assert "auth_url" in data
        assert "microsoftonline.com" in data["auth_url"]

    async def test_not_configured(self, client):
        """When MICROSOFT_CLIENT_ID is empty → 501."""
        with patch("app.routers.oauth.settings") as mock_settings:
            mock_settings.MICROSOFT_CLIENT_ID = ""
            resp = await client.get("/api/oauth/microsoft/authorize")
        assert resp.status_code == 501


# ---------------------------------------------------------------------------
# GET /api/oauth/microsoft/callback
# ---------------------------------------------------------------------------

class TestMicrosoftCallback:

    async def test_callback_success(self, client, mock_db):
        """Successful Microsoft callback creates an email account and redirects."""
        from app.utils.security import create_access_token
        from datetime import timedelta
        state = create_access_token(
            data={
                "sub": str(TEST_USER_ID),
                "workspace_id": str(TEST_WORKSPACE_ID),
                "purpose": "oauth_state",
            },
            expires_delta=timedelta(minutes=15),
        )

        token_data = {
            "access_token": "ms-access-token",
            "refresh_token": "ms-refresh-token",
            "expires_in": 3600,
            "email": "user@outlook.com",
            "name": "MS User",
        }

        with patch(
            "app.routers.oauth.oauth_service.exchange_microsoft_code",
            new_callable=AsyncMock,
            return_value=token_data,
        ):
            resp = await client.get(
                "/api/oauth/microsoft/callback",
                params={"code": "ms-auth-code", "state": state},
                follow_redirects=False,
            )

        assert resp.status_code == 307
        assert "connected=microsoft" in resp.headers.get("location", "")
        mock_db.add.assert_called_once()

    async def test_callback_exchange_failure(self, client, mock_db):
        """Failed Microsoft token exchange → 400."""
        from app.utils.security import create_access_token
        from datetime import timedelta
        state = create_access_token(
            data={
                "sub": str(TEST_USER_ID),
                "workspace_id": str(TEST_WORKSPACE_ID),
                "purpose": "oauth_state",
            },
            expires_delta=timedelta(minutes=15),
        )

        with patch(
            "app.routers.oauth.oauth_service.exchange_microsoft_code",
            new_callable=AsyncMock,
            side_effect=ValueError("Token exchange failed"),
        ):
            resp = await client.get(
                "/api/oauth/microsoft/callback",
                params={"code": "bad-code", "state": state},
                follow_redirects=False,
            )

        assert resp.status_code == 400
