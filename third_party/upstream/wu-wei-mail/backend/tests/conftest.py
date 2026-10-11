"""Shared test fixtures — mock DB, auth, and async test client."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.database import get_db
from app.models.user import User
from app.models.workspace import Workspace


# ---------------------------------------------------------------------------
# Test settings override
# ---------------------------------------------------------------------------

def get_test_settings() -> Settings:
    return Settings(
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        REDIS_URL="redis://localhost:6379/15",
        JWT_SECRET="test-secret-key-do-not-use-in-production",
        JWT_ALGORITHM="HS256",
        JWT_EXPIRE_MINUTES=60,
        GOOGLE_CLIENT_ID="test-google-client-id",
        GOOGLE_CLIENT_SECRET="test-google-client-secret",
        GOOGLE_REDIRECT_URI="http://localhost:8000/api/oauth/google/callback",
        MICROSOFT_CLIENT_ID="test-microsoft-client-id",
        MICROSOFT_CLIENT_SECRET="test-microsoft-client-secret",
        MICROSOFT_REDIRECT_URI="http://localhost:8000/api/oauth/microsoft/callback",
        FRONTEND_URL="http://localhost:3000",
        ENCRYPTION_KEY="iAjfMwHXlGTF5Z-OPEGTY_Pn0rtJA8gbwPTVrqZHgRQ=",
        CLICK_SIGNING_SECRET="test-click-signing-secret",
        WEBHOOK_SIGNING_SECRET="test-webhook-signing-secret",
        APP_NAME="Wu Wei Mail Test",
        BASE_URL="https://api.test.wuweimail.local",
        DEBUG=False,
    )


# ---------------------------------------------------------------------------
# Identifiers used across tests
# ---------------------------------------------------------------------------

TEST_USER_ID = uuid.uuid4()
TEST_WORKSPACE_ID = uuid.uuid4()


# ---------------------------------------------------------------------------
# Mock user
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_user():
    """Return a mock User object that resembles the real SQLAlchemy model."""
    user = MagicMock(spec=User)
    user.id = TEST_USER_ID
    user.workspace_id = TEST_WORKSPACE_ID
    user.email = "test@example.com"
    user.full_name = "Test User"
    user.role = "owner"
    user.is_active = True
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    user.hashed_password = "hashed"
    return user


# ---------------------------------------------------------------------------
# Mock database session
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db():
    """Return an AsyncMock that behaves like an AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.close = AsyncMock()
    db.delete = AsyncMock()
    # Configure execute() to return a result with scalar_one_or_none() → None
    # so that "check for existing" queries return None by default.
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalars.return_value.all.return_value = []
    mock_result.scalars.return_value.first.return_value = None
    mock_result.scalar.return_value = 0
    db.execute = AsyncMock(return_value=mock_result)
    return db


# ---------------------------------------------------------------------------
# Async test client with dependency overrides
# ---------------------------------------------------------------------------

@pytest.fixture
async def client(mock_user, mock_db):
    """
    httpx.AsyncClient wired to the FastAPI app with:
    - DB dependency overridden to yield mock_db
    - Auth dependency overridden to return mock_user
    - Settings overridden to test values
    """
    # Patch get_settings before importing app so the module-level call uses test settings
    with patch("app.config.get_settings", get_test_settings):
        from app.main import app
        from app.utils.security import get_current_user

        async def override_get_db():
            yield mock_db

        async def override_get_current_user():
            return mock_user

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

        # Cleanup
        app.dependency_overrides.clear()


@pytest.fixture
async def unauth_client(mock_db):
    """
    httpx.AsyncClient with NO auth override — for testing unauthenticated access.
    DB is still mocked.
    """
    with patch("app.config.get_settings", get_test_settings):
        from app.main import app

        async def override_get_db():
            yield mock_db

        app.dependency_overrides[get_db] = override_get_db
        # No auth override → the real get_current_user runs and expects a valid token

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

        app.dependency_overrides.clear()
