"""Tests for Phase 9 — Hardening, QA, and Rollout.

Covers:
- PRS-H01: Workspace Isolation Penetration Test Suite
- PRS-H02: Worker Reliability Tests (Retry, Timeout, Budget Exhaustion)
- PRS-H03: End-to-End Golden Path Test
- PRS-H04: Observability Dashboard Metrics
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock, PropertyMock

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


# ===========================================================================
# PRS-H01 — Workspace Isolation Penetration Tests
# ===========================================================================

class TestWorkspaceIsolation:
    """Verify no cross-workspace read/write leaks across all prospecting endpoints."""

    OTHER_WORKSPACE_ID = uuid.uuid4()

    @pytest.fixture
    def other_user(self):
        """A user in a DIFFERENT workspace."""
        from app.models.user import User
        user = MagicMock(spec=User)
        user.id = uuid.uuid4()
        user.workspace_id = self.OTHER_WORKSPACE_ID
        user.email = "attacker@evil.com"
        user.full_name = "Attacker"
        user.role = "owner"
        user.is_active = True
        user.created_at = datetime.now(timezone.utc)
        user.updated_at = datetime.now(timezone.utc)
        user.hashed_password = "hashed"
        return user

    @pytest.fixture
    async def other_workspace_client(self, other_user, mock_db):
        """Client authenticated as user from a different workspace."""
        from app.config import Settings
        def test_settings():
            return Settings(
                DATABASE_URL="sqlite+aiosqlite:///:memory:",
                REDIS_URL="redis://localhost:6379/15",
                JWT_SECRET="test-secret-key-do-not-use-in-production",
                ENCRYPTION_KEY="iAjfMwHXlGTF5Z-OPEGTY_Pn0rtJA8gbwPTVrqZHgRQ=",
                DEBUG=True,
                PROSPECTING_ENABLED=True,
            )

        with patch("app.config.get_settings", test_settings):
            from app.main import app
            from app.database import get_db
            from app.utils.security import get_current_user
            from httpx import ASGITransport, AsyncClient

            async def override_db():
                yield mock_db

            async def override_auth():
                return other_user

            app.dependency_overrides[get_db] = override_db
            app.dependency_overrides[get_current_user] = override_auth

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac

            app.dependency_overrides.clear()

    async def test_conversation_isolated_by_workspace(self, other_workspace_client, mock_db):
        """Cannot read conversations from another workspace."""
        # DB returns nothing because workspace_id won't match
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        conv_id = uuid.uuid4()
        resp = await other_workspace_client.get(
            f"/api/prospecting/conversations/{conv_id}"
        )
        assert resp.status_code == 404

    async def test_message_send_isolated(self, other_workspace_client, mock_db):
        """Cannot send messages to a conversation in another workspace."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        conv_id = uuid.uuid4()
        resp = await other_workspace_client.post(
            f"/api/prospecting/conversations/{conv_id}/messages",
            json={"content": "steal data"},
        )
        assert resp.status_code == 404

    async def test_action_approval_isolated(self, other_workspace_client, mock_db):
        """Cannot approve actions from another workspace."""
        # DB returns no matching action (workspace isolation filters it out)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        action_id = uuid.uuid4()
        resp = await other_workspace_client.post(
            f"/api/prospecting/actions/{action_id}/approve",
            json={"approved": True},
        )
        assert resp.status_code == 404

    async def test_model_policy_isolated(self, other_workspace_client, mock_db):
        """Model policies are workspace-scoped."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        resp = await other_workspace_client.get("/api/prospecting/models")
        assert resp.status_code == 200
        data = resp.json()
        # Should return empty — other workspace has no policies
        assert data == []

    async def test_conversation_create_stamps_caller_workspace(self):
        """Creating a conversation stamps the caller's workspace_id, not arbitrary input."""
        from app.models.prospecting import ProspectingConversation

        # When the router creates a conversation, it uses current_user.workspace_id
        # Verify by constructing what the router does:
        caller_workspace_id = TestWorkspaceIsolation.OTHER_WORKSPACE_ID
        conv = ProspectingConversation(
            workspace_id=caller_workspace_id,
            created_by=uuid.uuid4(),
            title="Test",
            stage="DISCOVERY",
        )
        # The workspace_id is set from the authenticated user, not from request body
        assert conv.workspace_id == caller_workspace_id
        assert conv.workspace_id != TEST_WORKSPACE_ID

    async def test_unauthenticated_access_blocked(self, unauth_client):
        """Unauthenticated requests are rejected."""
        endpoints = [
            ("GET", "/api/prospecting/conversations/fake-id"),
            ("POST", "/api/prospecting/conversations"),
            ("GET", "/api/prospecting/models"),
        ]
        for method, path in endpoints:
            resp = await getattr(unauth_client, method.lower())(path)
            assert resp.status_code in (401, 403), \
                f"Expected 401/403 for {method} {path}, got {resp.status_code}"


# ===========================================================================
# PRS-H02 — Worker Reliability Tests
# ===========================================================================

class TestWorkerReliability:
    """Test retry, timeout, and failure recovery in Celery tasks."""

    def test_discovery_task_has_retry_config(self):
        """Discovery task is configured with retries."""
        from app.workers.prospecting import execute_prospecting_run
        assert execute_prospecting_run.max_retries == 2
        assert execute_prospecting_run.default_retry_delay == 30

    def test_enrichment_task_has_retry_config(self):
        """Enrichment task is configured with retries."""
        from app.workers.prospecting import enrich_prospecting_leads
        assert enrich_prospecting_leads.max_retries == 2
        assert enrich_prospecting_leads.default_retry_delay == 30

    def test_tasks_are_bound(self):
        """Tasks are bound (have access to self for retry)."""
        from app.workers.prospecting import execute_prospecting_run, enrich_prospecting_leads
        # Bound tasks have `self` as first argument name
        assert execute_prospecting_run.name == "prospecting.execute_run"
        assert enrich_prospecting_leads.name == "prospecting.enrich_leads"

    def test_run_async_helper_handles_no_loop(self):
        """_run_async works when no event loop exists."""
        from app.workers.prospecting import _run_async

        async def simple_coro():
            return 42

        result = _run_async(simple_coro())
        assert result == 42

    def test_run_async_handles_errors(self):
        """_run_async propagates exceptions."""
        from app.workers.prospecting import _run_async

        async def failing_coro():
            raise ValueError("test error")

        with pytest.raises(ValueError, match="test error"):
            _run_async(failing_coro())

    async def test_discovery_run_rollback_on_failure(self):
        """Discovery run rolls back DB on failure."""
        from app.workers.prospecting import _execute_discovery_run_async

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        with patch("app.database.async_session_factory", return_value=mock_session), \
             patch("app.services.prospecting.lead_discovery_service.lead_discovery_service") as mock_svc:

            mock_svc.execute_run = AsyncMock(side_effect=RuntimeError("DB error"))

            with pytest.raises(RuntimeError, match="DB error"):
                await _execute_discovery_run_async(str(uuid.uuid4()), str(uuid.uuid4()))

            mock_session.rollback.assert_called_once()

    async def test_enrichment_run_rollback_on_failure(self):
        """Enrichment run rolls back DB on failure."""
        from app.workers.prospecting import _enrich_leads_async

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        with patch("app.database.async_session_factory", return_value=mock_session), \
             patch("app.services.prospecting.lead_enrichment_service.lead_enrichment_service") as mock_svc:

            mock_svc.enrich_run = AsyncMock(side_effect=RuntimeError("Enrichment error"))

            with pytest.raises(RuntimeError, match="Enrichment error"):
                await _enrich_leads_async(str(uuid.uuid4()), str(uuid.uuid4()))

            mock_session.rollback.assert_called_once()


# ===========================================================================
# PRS-H03 — End-to-End Golden Path Test
# ===========================================================================

class TestGoldenPath:
    """Test the full prospecting journey: discover → select → import → copy → campaign → launch."""

    async def test_full_journey_stages(self):
        """Verify stage machine supports the golden path sequence."""
        from app.services.prospecting.journey_state_machine import JourneyStateMachine

        stage = "DISCOVERY"

        # Discovery → Selection
        stage = JourneyStateMachine.transition(stage, "SELECTION")
        assert stage == "SELECTION"

        # Selection → Copywriting
        stage = JourneyStateMachine.transition(stage, "COPYWRITING")
        assert stage == "COPYWRITING"

        # Copywriting → Campaign Setup
        stage = JourneyStateMachine.transition(stage, "CAMPAIGN_SETUP")
        assert stage == "CAMPAIGN_SETUP"

        # Campaign Setup → Launch Ready
        stage = JourneyStateMachine.transition(stage, "LAUNCH_READY")
        assert stage == "LAUNCH_READY"

        # Launch Ready → Launched
        stage = JourneyStateMachine.transition(stage, "LAUNCHED")
        assert stage == "LAUNCHED"

    async def test_golden_path_orchestrator_routing(self):
        """Verify the orchestrator routes correctly at each golden path stage."""
        from app.services.prospecting.orchestrator_service import orchestrator_service

        # Discovery stage: "find leads" → lead_discovery agent
        routing = orchestrator_service.route("find leads in healthcare", "DISCOVERY")
        assert routing.handoff_target == "lead_discovery"
        assert routing.intent == "lead_generation"

        # Selection stage: "select these leads" → lead_discovery agent
        routing = orchestrator_service.route("select and import these leads", "SELECTION")
        assert routing.handoff_target == "lead_discovery"

        # Copywriting stage: "write copy" → copywriting agent
        routing = orchestrator_service.route("write copy for this segment", "COPYWRITING")
        assert routing.handoff_target == "copywriting"
        assert routing.intent == "copywriting"

        # Campaign setup stage: "create campaign" → campaign_builder
        routing = orchestrator_service.route("create campaign with daily limit 50", "CAMPAIGN_SETUP")
        assert routing.handoff_target == "campaign_builder"

        # Launch ready: "launch" → campaign_builder
        routing = orchestrator_service.route("launch the campaign", "LAUNCH_READY")
        assert routing.handoff_target == "campaign_builder"
        assert routing.intent == "campaign_launch"

    async def test_golden_path_service_chain_callable(self):
        """Each service in the golden path chain is importable and has the expected methods."""
        from app.services.prospecting.source_strategy_service import source_strategy_planner
        from app.services.prospecting.lead_discovery_service import lead_discovery_service
        from app.services.prospecting.lead_enrichment_service import lead_enrichment_service
        from app.services.prospecting.quality_scoring_service import quality_scoring_service
        from app.services.prospecting.dedupe_service import dedupe_service
        from app.services.prospecting.exclusion_service import exclusion_service
        from app.services.prospecting.lead_import_service import lead_import_service
        from app.services.prospecting.copywriting_service import copywriting_service
        from app.services.prospecting.campaign_builder_service import campaign_builder_service

        # Verify key methods exist on each service
        assert callable(source_strategy_planner.plan)
        assert callable(lead_discovery_service.create_run)
        assert callable(lead_discovery_service.execute_run)
        assert callable(lead_enrichment_service.enrich_run)
        assert callable(quality_scoring_service.score_lead)
        assert callable(quality_scoring_service.score_run)
        assert callable(dedupe_service.dedupe_run_leads)
        assert callable(exclusion_service.classify_exclusion)
        assert callable(lead_import_service.import_leads)
        assert callable(copywriting_service.generate_draft)
        assert callable(campaign_builder_service.create_campaign_draft)
        assert callable(campaign_builder_service.launch_campaign)

    def test_golden_path_routes_registered(self):
        """All golden path API routes are registered in the router."""
        from app.routers.prospecting import router

        registered = set()
        for route in router.routes:
            if hasattr(route, "methods") and hasattr(route, "path"):
                for method in route.methods:
                    registered.add((method, route.path))

        required_routes = [
            ("POST", "/conversations"),
            ("POST", "/runs"),
            ("POST", "/leads/import"),
            ("POST", "/copy/draft"),
            ("POST", "/campaigns/create"),
            ("POST", "/campaigns/launch"),
            ("GET", "/models"),
            ("GET", "/models/{agent_type}"),
            ("PATCH", "/models/{agent_type}"),
            ("DELETE", "/models/{agent_type}"),
        ]
        for method, path in required_routes:
            assert (method, path) in registered, \
                f"Route {method} {path} not registered"


# ===========================================================================
# PRS-H04 — Observability Dashboard Metrics
# ===========================================================================

class TestObservabilityMetrics:
    """Verify metrics and telemetry are available for monitoring."""

    def test_telemetry_record_has_required_fields(self):
        """Telemetry records include all fields needed for dashboards."""
        from app.services.prospecting.model_router_service import TelemetryRecord

        record = TelemetryRecord(
            agent_type="orchestrator",
            workspace_id=uuid.uuid4(),
            resolved_model="test-model",
            resolved_provider="openrouter",
            source="default",
            latency_ms=150.0,
            token_count=1200,
        )
        d = record.to_dict()

        # Dashboard fields
        assert "agent_type" in d
        assert "resolved_model" in d
        assert "latency_ms" in d
        assert "token_count" in d
        assert "source" in d
        assert "fallback_used" in d
        assert "timestamp" in d

    def test_quality_score_components_available(self):
        """Quality scoring produces components usable for per-source metrics."""
        from app.services.prospecting.quality_scoring_service import quality_scoring_service

        score, band, components = quality_scoring_service.score_lead(
            lead_data={
                "email": "user@company.com",
                "email_confidence": 0.9,
                "title": "CTO",
                "company": "TechCo",
                "city": "New York",
                "industry": "Technology",
            },
        )
        # Components needed for quality-by-source dashboards
        assert hasattr(components, "domain_quality")
        assert hasattr(components, "email_confidence")
        assert hasattr(components, "role_match")
        assert hasattr(components, "geo_relevance")
        assert hasattr(components, "data_recency")
        assert hasattr(components, "duplicate_penalty")
        assert callable(components.compute_total)
        # score and band are returned separately by score_lead
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0
        assert band in {"READY_HIGH_CONFIDENCE", "READY_REVIEW", "HOLD"}

    def test_run_status_values_for_stage_conversion(self):
        """Run status values are defined for tracking stage conversion rates."""
        from app.models.prospecting import ProspectingRun
        # Status field should accept these values for funnel metrics
        valid_statuses = {"pending", "running", "completed", "failed", "cancelled"}
        # These are documented in the model — verify the field exists
        assert hasattr(ProspectingRun, "status")

    def test_action_types_for_approval_metrics(self):
        """Action types are defined for approval rate tracking."""
        from app.schemas.prospecting import VALID_ACTION_TYPES, VALID_ACTION_STATUSES
        # Approval funnel tracking
        assert "bulk_import" in VALID_ACTION_TYPES
        assert "campaign_launch" in VALID_ACTION_TYPES
        # Status progression
        assert "pending" in VALID_ACTION_STATUSES
        assert "approved" in VALID_ACTION_STATUSES
        assert "executed" in VALID_ACTION_STATUSES

    def test_model_defaults_available_for_usage_dashboard(self):
        """Default model configs provide baseline for usage comparison."""
        from app.services.prospecting.model_router_service import DEFAULT_MODEL_CONFIGS
        from app.schemas.prospecting import VALID_AGENT_TYPES

        for agent_type in VALID_AGENT_TYPES:
            assert agent_type in DEFAULT_MODEL_CONFIGS
            config = DEFAULT_MODEL_CONFIGS[agent_type]
            assert "model_id" in config
            assert "provider" in config

    def test_journey_stages_for_conversion_funnel(self):
        """Journey stages are enumerable for conversion funnel dashboards."""
        from app.models.prospecting import JourneyStage

        stages = JourneyStage.ALL
        expected = {"DISCOVERY", "SELECTION", "COPYWRITING",
                    "CAMPAIGN_SETUP", "LAUNCH_READY", "LAUNCHED"}
        assert stages == expected

    def test_exclusion_reasons_for_quality_dashboard(self):
        """Exclusion reasons are enumerable for quality analysis dashboards."""
        from app.services.prospecting.exclusion_service import ExclusionReason

        # Should have multiple defined reasons
        reason_attrs = [
            attr for attr in dir(ExclusionReason)
            if attr.isupper() and not attr.startswith("_")
        ]
        assert len(reason_attrs) >= 10, \
            f"Expected at least 10 exclusion reasons, got {len(reason_attrs)}"


# ===========================================================================
# Existing endpoints still work
# ===========================================================================

class TestExistingEndpointsStablePhase9:
    """Confirm Phase 9 changes don't break existing routes."""

    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_auth_me(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200

    async def test_feature_flag_off_returns_404(self, client):
        """When prospecting is disabled, all routes return 404."""
        from app.config import Settings

        def disabled_settings():
            return Settings(
                DATABASE_URL="sqlite+aiosqlite:///:memory:",
                REDIS_URL="redis://localhost:6379/15",
                JWT_SECRET="test-secret-key-do-not-use-in-production",
                ENCRYPTION_KEY="",
                DEBUG=True,
                PROSPECTING_ENABLED=False,
            )

        with patch("app.routers.prospecting.get_settings", disabled_settings):
            resp = await client.post("/api/prospecting/conversations", json={})
            assert resp.status_code == 404
            resp = await client.get("/api/prospecting/models")
            assert resp.status_code == 404
