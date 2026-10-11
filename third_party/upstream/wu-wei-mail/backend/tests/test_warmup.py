"""Warmup API + integration tests — feature flag, program CRUD, enrollment, pause/resume, status, timeline."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID


# ---------------------------------------------------------------------------
# Import smoke tests
# ---------------------------------------------------------------------------

class TestImportSmoke:
    """All warmup modules import correctly and models are registered."""

    def test_models_importable(self):
        from app.models.warmup import (
            WarmupProgram, WarmupAccountState, WarmupProviderLink,
            WarmupAction, WarmupDailyMetric, WarmupSeedIdentity,
        )
        assert WarmupProgram.__tablename__ == "warmup_programs"
        assert WarmupAccountState.__tablename__ == "warmup_account_states"
        assert WarmupProviderLink.__tablename__ == "warmup_provider_links"
        assert WarmupAction.__tablename__ == "warmup_actions"
        assert WarmupDailyMetric.__tablename__ == "warmup_daily_metrics"
        assert WarmupSeedIdentity.__tablename__ == "warmup_seed_identities"

    def test_models_in_init(self):
        from app.models import (
            WarmupProgram, WarmupAccountState, WarmupProviderLink,
            WarmupAction, WarmupDailyMetric, WarmupSeedIdentity,
        )
        assert WarmupProgram is not None
        assert WarmupSeedIdentity is not None

    def test_schemas_importable(self):
        from app.schemas.warmup import (
            WarmupProgramCreate, WarmupProgramResponse,
            WarmupEnrollRequest, WarmupAccountStatusResponse,
            WarmupDailyMetricResponse, WarmupActionResponse,
        )
        assert WarmupProgramCreate is not None
        assert WarmupAccountStatusResponse is not None

    def test_services_importable(self):
        from app.services.warmup_service import WarmupService, warmup_service
        from app.services.warmup_policy_engine import compute_daily_volume, should_graduate
        from app.services.warmup_health_scorer import compute
        assert warmup_service is not None

    def test_providers_importable(self):
        from app.services.warmup_providers.base import WarmupProviderAdapter
        from app.services.warmup_providers.noop_adapter import NoopWarmupAdapter
        from app.services.warmup_providers.mailreach_adapter import MailReachAdapter
        assert WarmupProviderAdapter is not None

    def test_router_importable(self):
        from app.routers.warmup import router
        assert router is not None


# ---------------------------------------------------------------------------
# Feature flag tests
# ---------------------------------------------------------------------------

class TestFeatureFlag:
    """Endpoints return 404 when WARMUP_ENABLED=False, accessible when True."""

    @staticmethod
    def _disabled_settings():
        from app.config import Settings
        return Settings(
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
            REDIS_URL="redis://localhost:6379/15",
            JWT_SECRET="test-secret-key-do-not-use-in-production",
            ENCRYPTION_KEY="",
            DEBUG=True,
            WARMUP_ENABLED=False,
        )

    @pytest.mark.anyio
    async def test_program_404_when_disabled(self, client):
        """GET /api/warmup/program → 404 when warmup is disabled."""
        with patch("app.routers.warmup.get_settings", self._disabled_settings):
            resp = await client.get("/api/warmup/program")
        assert resp.status_code == 404
        assert "not enabled" in resp.json()["detail"].lower()

    @pytest.mark.anyio
    async def test_start_404_when_disabled(self, client):
        """POST /api/warmup/accounts/{id}/start → 404 when warmup is disabled."""
        with patch("app.routers.warmup.get_settings", self._disabled_settings):
            resp = await client.post(f"/api/warmup/accounts/{uuid.uuid4()}/start")
        assert resp.status_code == 404

    @pytest.mark.anyio
    async def test_status_404_when_disabled(self, client):
        """GET /api/warmup/accounts/{id}/status → 404 when warmup is disabled."""
        with patch("app.routers.warmup.get_settings", self._disabled_settings):
            resp = await client.get(f"/api/warmup/accounts/{uuid.uuid4()}/status")
        assert resp.status_code == 404

    @pytest.mark.anyio
    async def test_timeline_404_when_disabled(self, client):
        """GET /api/warmup/accounts/{id}/timeline → 404 when warmup is disabled."""
        with patch("app.routers.warmup.get_settings", self._disabled_settings):
            resp = await client.get(f"/api/warmup/accounts/{uuid.uuid4()}/timeline")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Helper to create a warmup-enabled client
# ---------------------------------------------------------------------------

@pytest.fixture
async def warmup_client(mock_user, mock_db):
    """Client with WARMUP_ENABLED=True."""
    from tests.conftest import get_test_settings

    def warmup_settings():
        settings = get_test_settings()
        settings.WARMUP_ENABLED = True
        settings.WARMUP_PROVIDER = "none"
        return settings

    with patch("app.config.get_settings", warmup_settings), \
         patch("app.routers.warmup.get_settings", warmup_settings):
        from app.main import app
        from app.database import get_db
        from app.utils.security import get_current_user
        from httpx import ASGITransport, AsyncClient

        async def override_get_db():
            yield mock_db

        async def override_get_current_user():
            return mock_user

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Program CRUD
# ---------------------------------------------------------------------------

class TestProgramCRUD:

    @pytest.mark.anyio
    async def test_create_program(self, warmup_client, mock_db):
        """POST /api/warmup/program creates or updates a program."""
        from app.models.warmup import WarmupProgram
        from datetime import datetime, timezone

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        now = datetime.now(timezone.utc)

        # The service will flush and then return the program
        # We mock the whole service
        program = WarmupProgram(
            id=uuid.uuid4(),
            workspace_id=TEST_WORKSPACE_ID,
            mode="managed",
            default_target_volume=50,
            ramp_increment_per_day=3,
            max_daily_warmup=200,
            dns_required=True,
            auto_pause_on_bounce_rate=0.08,
            auto_pause_on_complaint_rate=0.003,
            created_at=now,
            updated_at=now,
        )

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.get_or_create_program = AsyncMock(return_value=program)
            resp = await warmup_client.post(
                "/api/warmup/program",
                json={"default_target_volume": 50},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["mode"] == "managed"
        assert data["default_target_volume"] == 50

    @pytest.mark.anyio
    async def test_get_program_not_found(self, warmup_client):
        """GET /api/warmup/program → 404 when no program exists."""
        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.get_program = AsyncMock(return_value=None)
            resp = await warmup_client.get("/api/warmup/program")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Enrollment
# ---------------------------------------------------------------------------

class TestEnrollment:

    @pytest.mark.anyio
    async def test_enroll_success(self, warmup_client):
        """POST /api/warmup/accounts/{id}/start → success."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.enroll_account = AsyncMock()
            mock_svc.get_account_status = AsyncMock(return_value={
                "account_id": account_id,
                "workspace_id": TEST_WORKSPACE_ID,
                "phase": "ramping",
                "target_volume": 50,
                "current_allowed_volume": 5,
                "actual_sent_today": 0,
                "warmup_health_score": 1.0,
                "inbox_placement_rate": 1.0,
                "enrolled_at": "2026-02-07T00:00:00Z",
                "graduated_at": None,
                "paused_at": None,
                "pause_reason": None,
                "provider_name": "none",
                "provider_status": "active",
                "last_synced_at": None,
                "risk_flags": [],
                "recent_metrics": [],
            })

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/start",
                json={"target_volume": 50},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["phase"] == "ramping"
        assert data["target_volume"] == 50

    @pytest.mark.anyio
    async def test_enroll_dns_required_fails(self, warmup_client):
        """POST /api/warmup/accounts/{id}/start → 400 if DNS check fails."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.enroll_account = AsyncMock(
                side_effect=ValueError("DNS verification required: SPF and DMARC must pass")
            )

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/start",
                json={"target_volume": 50},
            )

        assert resp.status_code == 400
        assert "DNS" in resp.json()["detail"]

    @pytest.mark.anyio
    async def test_enroll_already_enrolled(self, warmup_client):
        """POST /api/warmup/accounts/{id}/start → 400 if already enrolled."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.enroll_account = AsyncMock(
                side_effect=ValueError("Account is already enrolled in warmup")
            )

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/start",
                json={"target_volume": 50},
            )

        assert resp.status_code == 400
        assert "already enrolled" in resp.json()["detail"].lower()

    @pytest.mark.anyio
    async def test_enroll_account_not_found(self, warmup_client):
        """POST /api/warmup/accounts/{id}/start → 400 if account not found."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.enroll_account = AsyncMock(
                side_effect=ValueError("Account not found in workspace")
            )

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/start",
                json={"target_volume": 50},
            )

        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Pause / Resume
# ---------------------------------------------------------------------------

class TestPauseResume:

    @pytest.mark.anyio
    async def test_pause_success(self, warmup_client):
        """POST /api/warmup/accounts/{id}/pause → success."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.pause_account = AsyncMock()
            mock_svc.get_account_status = AsyncMock(return_value={
                "account_id": account_id,
                "workspace_id": TEST_WORKSPACE_ID,
                "phase": "paused",
                "target_volume": 50,
                "current_allowed_volume": 20,
                "actual_sent_today": 0,
                "warmup_health_score": 0.9,
                "inbox_placement_rate": 0.95,
                "enrolled_at": "2026-02-07T00:00:00Z",
                "graduated_at": None,
                "paused_at": "2026-02-07T12:00:00Z",
                "pause_reason": "user request",
                "provider_name": None,
                "provider_status": None,
                "last_synced_at": None,
                "risk_flags": [],
                "recent_metrics": [],
            })

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/pause",
                json={"reason": "user request"},
            )

        assert resp.status_code == 200
        assert resp.json()["phase"] == "paused"

    @pytest.mark.anyio
    async def test_resume_success(self, warmup_client):
        """POST /api/warmup/accounts/{id}/resume → success."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.resume_account = AsyncMock()
            mock_svc.get_account_status = AsyncMock(return_value={
                "account_id": account_id,
                "workspace_id": TEST_WORKSPACE_ID,
                "phase": "ramping",
                "target_volume": 50,
                "current_allowed_volume": 20,
                "actual_sent_today": 0,
                "warmup_health_score": 0.9,
                "inbox_placement_rate": 0.95,
                "enrolled_at": "2026-02-07T00:00:00Z",
                "graduated_at": None,
                "paused_at": None,
                "pause_reason": None,
                "provider_name": None,
                "provider_status": None,
                "last_synced_at": None,
                "risk_flags": [],
                "recent_metrics": [],
            })

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/resume",
            )

        assert resp.status_code == 200
        assert resp.json()["phase"] == "ramping"

    @pytest.mark.anyio
    async def test_resume_not_paused_fails(self, warmup_client):
        """POST /api/warmup/accounts/{id}/resume → 400 if not paused."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.resume_account = AsyncMock(
                side_effect=ValueError("Cannot resume: account is in phase 'ramping', not 'paused'")
            )

            resp = await warmup_client.post(
                f"/api/warmup/accounts/{account_id}/resume",
            )

        assert resp.status_code == 400
        assert "paused" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Status + Timeline
# ---------------------------------------------------------------------------

class TestStatus:

    @pytest.mark.anyio
    async def test_status_success(self, warmup_client):
        """GET /api/warmup/accounts/{id}/status → 200 with metrics."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.get_account_status = AsyncMock(return_value={
                "account_id": account_id,
                "workspace_id": TEST_WORKSPACE_ID,
                "phase": "ramping",
                "target_volume": 50,
                "current_allowed_volume": 15,
                "actual_sent_today": 8,
                "warmup_health_score": 0.95,
                "inbox_placement_rate": 0.92,
                "enrolled_at": "2026-02-07T00:00:00Z",
                "graduated_at": None,
                "paused_at": None,
                "pause_reason": None,
                "provider_name": "mailreach",
                "provider_status": "active",
                "last_synced_at": "2026-02-07T10:00:00Z",
                "risk_flags": ["low_inbox_placement:0.450"],
                "recent_metrics": [
                    {"date": "2026-02-06", "sent": 10, "delivered": 9, "opened": 5,
                     "replied": 1, "bounced": 0, "spam_reported": 0, "inbox_placed": 9, "spam_placed": 0},
                ],
            })

            resp = await warmup_client.get(
                f"/api/warmup/accounts/{account_id}/status",
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["phase"] == "ramping"
        assert len(data["risk_flags"]) == 1
        assert len(data["recent_metrics"]) == 1

    @pytest.mark.anyio
    async def test_status_not_enrolled_404(self, warmup_client):
        """GET /api/warmup/accounts/{id}/status → 404 if not enrolled."""
        account_id = uuid.uuid4()

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.get_account_status = AsyncMock(
                side_effect=ValueError("Account is not enrolled in warmup")
            )

            resp = await warmup_client.get(
                f"/api/warmup/accounts/{account_id}/status",
            )

        assert resp.status_code == 404


class TestTimeline:

    @pytest.mark.anyio
    async def test_timeline_ordered(self, warmup_client):
        """GET /api/warmup/accounts/{id}/timeline → ordered by created_at desc."""
        account_id = uuid.uuid4()

        from app.models.warmup import WarmupAction
        from datetime import datetime, timezone

        actions = [
            MagicMock(
                id=uuid.uuid4(), action_type="enroll", status="executed",
                source="user", detail={}, created_at=datetime(2026, 2, 7, 0, 0, tzinfo=timezone.utc),
            ),
            MagicMock(
                id=uuid.uuid4(), action_type="pause", status="executed",
                source="system", detail={"reason": "auto_pause"}, created_at=datetime(2026, 2, 7, 12, 0, tzinfo=timezone.utc),
            ),
        ]

        with patch("app.routers.warmup.warmup_service") as mock_svc:
            mock_svc.get_account_timeline = AsyncMock(return_value=actions)

            resp = await warmup_client.get(
                f"/api/warmup/accounts/{account_id}/timeline",
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["action_type"] == "enroll"
        assert data[1]["action_type"] == "pause"
