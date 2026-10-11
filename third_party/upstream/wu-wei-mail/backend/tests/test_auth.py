"""Tests for auth routes — register, login, refresh, logout, /me."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


# ---------------------------------------------------------------------------
# POST /api/auth/register
# ---------------------------------------------------------------------------

class TestRegister:

    async def test_register_success(self, client, mock_db):
        """Successful registration returns access_token, user_id, workspace_id."""
        fake_user = MagicMock()
        fake_user.id = TEST_USER_ID
        fake_user.workspace_id = TEST_WORKSPACE_ID

        with patch(
            "app.routers.auth.auth_service.register",
            new_callable=AsyncMock,
            return_value=(fake_user, "fake-jwt-token", "fake-refresh-token"),
        ):
            resp = await client.post("/api/auth/register", json={
                "email": "new@example.com",
                "password": "securepass123",
                "full_name": "New User",
                "workspace_name": "My Workspace",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] == "fake-jwt-token"
        assert data["token_type"] == "bearer"
        assert data["user_id"] == str(TEST_USER_ID)
        assert data["workspace_id"] == str(TEST_WORKSPACE_ID)
        # Verify refresh token cookie is set
        assert "refresh_token" in resp.headers.get("set-cookie", "")

    async def test_register_duplicate_email(self, client, mock_db):
        """Duplicate email returns 400."""
        with patch(
            "app.routers.auth.auth_service.register",
            new_callable=AsyncMock,
            side_effect=ValueError("Email already registered"),
        ):
            resp = await client.post("/api/auth/register", json={
                "email": "dupe@example.com",
                "password": "securepass123",
                "full_name": "Dupe",
                "workspace_name": "Ws",
            })

        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]

    async def test_register_missing_fields(self, client):
        """Missing required fields returns 422."""
        resp = await client.post("/api/auth/register", json={
            "email": "only@email.com",
        })
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------

class TestLogin:

    async def test_login_success(self, client, mock_db):
        """Valid credentials return a token."""
        fake_user = MagicMock()
        fake_user.id = TEST_USER_ID
        fake_user.workspace_id = TEST_WORKSPACE_ID

        with patch(
            "app.routers.auth.auth_service.login",
            new_callable=AsyncMock,
            return_value=(fake_user, "login-jwt-token", "login-refresh-token"),
        ):
            resp = await client.post("/api/auth/login", json={
                "email": "test@example.com",
                "password": "correct-password",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] == "login-jwt-token"
        assert data["user_id"] == str(TEST_USER_ID)
        # Verify refresh token cookie is set
        assert "refresh_token" in resp.headers.get("set-cookie", "")

    async def test_login_wrong_password(self, client, mock_db):
        """Wrong password returns 401."""
        with patch(
            "app.routers.auth.auth_service.login",
            new_callable=AsyncMock,
            side_effect=ValueError("Invalid email or password"),
        ):
            resp = await client.post("/api/auth/login", json={
                "email": "test@example.com",
                "password": "wrong-password",
            })

        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]

    async def test_login_nonexistent_user(self, client, mock_db):
        """Non-existent email returns 401."""
        with patch(
            "app.routers.auth.auth_service.login",
            new_callable=AsyncMock,
            side_effect=ValueError("Invalid email or password"),
        ):
            resp = await client.post("/api/auth/login", json={
                "email": "ghost@nowhere.com",
                "password": "any-password",
            })

        assert resp.status_code == 401

    async def test_login_inactive_user(self, client, mock_db):
        """Inactive/deactivated user returns 401."""
        with patch(
            "app.routers.auth.auth_service.login",
            new_callable=AsyncMock,
            side_effect=ValueError("Account is deactivated"),
        ):
            resp = await client.post("/api/auth/login", json={
                "email": "deactivated@example.com",
                "password": "any-password",
            })

        assert resp.status_code == 401
        assert "deactivated" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------

class TestMe:

    async def test_me_authenticated(self, client, mock_user):
        """Authenticated user gets their own profile."""
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["full_name"] == "Test User"
        assert data["role"] == "owner"

    async def test_me_unauthenticated(self, unauth_client):
        """No token → 401."""
        resp = await unauth_client.get("/api/auth/me")
        assert resp.status_code == 401

    async def test_me_malformed_token(self, unauth_client):
        """Garbage Bearer token → 401."""
        resp = await unauth_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer not-a-real-jwt-token"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/refresh
# ---------------------------------------------------------------------------

class TestRefresh:

    async def test_refresh_with_cookie(self, client, mock_db):
        """Cookie-based refresh returns a new access token."""
        fake_user = MagicMock()
        fake_user.id = TEST_USER_ID
        fake_user.workspace_id = TEST_WORKSPACE_ID

        with patch(
            "app.routers.auth.auth_service.refresh",
            new_callable=AsyncMock,
            return_value=(fake_user, "new-access-token", "new-refresh-token"),
        ):
            resp = await client.post(
                "/api/auth/refresh",
                cookies={"refresh_token": "old-refresh-token"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] == "new-access-token"

    async def test_refresh_without_cookie(self, client, mock_db):
        """Missing refresh cookie returns 401."""
        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 401

    async def test_refresh_with_invalid_token(self, client, mock_db):
        """Invalid refresh token returns 401."""
        with patch(
            "app.routers.auth.auth_service.refresh",
            new_callable=AsyncMock,
            side_effect=ValueError("Invalid refresh token"),
        ):
            resp = await client.post(
                "/api/auth/refresh",
                cookies={"refresh_token": "bad-token"},
            )

        assert resp.status_code == 401

    async def test_refresh_reuse_revokes_family(self, client, mock_db):
        """Token reuse detection returns 401."""
        with patch(
            "app.routers.auth.auth_service.refresh",
            new_callable=AsyncMock,
            side_effect=ValueError("Token reuse detected"),
        ):
            resp = await client.post(
                "/api/auth/refresh",
                cookies={"refresh_token": "reused-token"},
            )

        assert resp.status_code == 401
        assert "reuse" in resp.json()["detail"].lower()

    async def test_refresh_expired_token(self, client, mock_db):
        """Expired refresh token returns 401."""
        with patch(
            "app.routers.auth.auth_service.refresh",
            new_callable=AsyncMock,
            side_effect=ValueError("Refresh token expired"),
        ):
            resp = await client.post(
                "/api/auth/refresh",
                cookies={"refresh_token": "expired-token"},
            )

        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    async def test_refresh_inactive_user(self, client, mock_db):
        """Refresh for inactive user returns 401."""
        with patch(
            "app.routers.auth.auth_service.refresh",
            new_callable=AsyncMock,
            side_effect=ValueError("User not found or inactive"),
        ):
            resp = await client.post(
                "/api/auth/refresh",
                cookies={"refresh_token": "inactive-user-token"},
            )

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------

class TestLogout:

    async def test_logout(self, client, mock_db):
        """Logout revokes tokens and clears cookie."""
        with patch(
            "app.routers.auth.auth_service.logout",
            new_callable=AsyncMock,
        ):
            resp = await client.post("/api/auth/logout")

        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_logout_clears_cookie(self, client, mock_db):
        """Logout response clears the refresh_token cookie."""
        with patch(
            "app.routers.auth.auth_service.logout",
            new_callable=AsyncMock,
        ):
            resp = await client.post("/api/auth/logout")

        assert resp.status_code == 200
        cookie_header = resp.headers.get("set-cookie", "")
        # Cookie must be present and deleted (max-age=0 or expires in the past)
        assert "refresh_token" in cookie_header
        assert 'Max-Age=0' in cookie_header or '01 Jan 1970' in cookie_header


# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------

class TestRateLimit:

    async def test_login_rate_limit(self, client, mock_db):
        """Excessive login attempts return 429."""
        from app.routers.auth import _login_attempts
        _login_attempts.clear()

        with patch(
            "app.routers.auth._increment_rate_limit_counter_redis",
            side_effect=RuntimeError("redis unavailable"),
        ):
            with patch(
                "app.routers.auth.auth_service.login",
                new_callable=AsyncMock,
                side_effect=ValueError("Invalid email or password"),
            ):
                for _ in range(11):
                    resp = await client.post("/api/auth/login", json={
                        "email": "brute@example.com",
                        "password": "wrong",
                    })

        # After 10 attempts, the 11th should be rate-limited
        assert resp.status_code == 429
        assert "Too many" in resp.json()["detail"]

        _login_attempts.clear()

    async def test_login_rate_limit_uses_redis_counter(self, client, mock_db):
        """Rate limiting can trigger from Redis without using local fallback."""
        with patch(
            "app.routers.auth._increment_rate_limit_counter_redis",
            side_effect=[11],
        ):
            resp = await client.post("/api/auth/login", json={
                "email": "brute@example.com",
                "password": "wrong",
            })

        assert resp.status_code == 429
        assert "Too many" in resp.json()["detail"]
