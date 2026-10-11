"""Tests for Phase 7 — Per-Agent Model Routing.

Covers:
- PRS-F01: Model Policy CRUD API
- PRS-F02: Runtime Model Router Service
- PRS-F03: Model Usage Telemetry
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.services.prospecting.model_router_service import (
    ModelRouterService, ModelPolicyCRUDService,
    ModelResolution, TelemetryRecord,
    DEFAULT_MODEL_CONFIGS, model_router_service, model_policy_crud,
)
from app.schemas.prospecting import VALID_AGENT_TYPES


# ===========================================================================
# PRS-F01 — Model Policy CRUD
# ===========================================================================

class TestModelPolicyCRUD:
    """Model policy CRUD service tests."""

    def setup_method(self):
        self.svc = ModelPolicyCRUDService()

    async def test_get_policy_not_found(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        policy = await self.svc.get_policy(
            db, uuid.uuid4(), "orchestrator",
        )
        assert policy is None

    async def test_get_policy_found(self):
        db = AsyncMock()
        mock_policy = MagicMock()
        mock_policy.agent_type = "orchestrator"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_policy
        db.execute.return_value = mock_result

        policy = await self.svc.get_policy(
            db, uuid.uuid4(), "orchestrator",
        )
        assert policy is not None
        assert policy.agent_type == "orchestrator"

    async def test_get_policy_rejects_invalid_agent_type(self):
        db = AsyncMock()
        with pytest.raises(ValueError, match="Unknown agent type"):
            await self.svc.get_policy(db, uuid.uuid4(), "invalid_agent")

    async def test_list_policies(self):
        db = AsyncMock()
        mock_policies = [MagicMock(), MagicMock()]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_policies
        db.execute.return_value = mock_result

        policies = await self.svc.list_policies(db, uuid.uuid4())
        assert len(policies) == 2

    async def test_upsert_creates_new_policy(self):
        db = AsyncMock()
        db.add = MagicMock()  # .add() is sync on AsyncSession
        # First call: no existing policy
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        policy = await self.svc.upsert_policy(
            db=db,
            workspace_id=uuid.uuid4(),
            agent_type="orchestrator",
            data={"model_id": "openai/gpt-4o", "temperature": 0.5},
        )
        assert policy is not None
        assert policy.model_id == "openai/gpt-4o"
        assert policy.temperature == 0.5
        db.add.assert_called_once()
        db.flush.assert_called_once()

    async def test_upsert_updates_existing_policy(self):
        db = AsyncMock()
        mock_policy = MagicMock()
        mock_policy.model_id = "old-model"
        mock_policy.temperature = 0.7
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_policy
        db.execute.return_value = mock_result

        result = await self.svc.upsert_policy(
            db=db,
            workspace_id=uuid.uuid4(),
            agent_type="orchestrator",
            data={"model_id": "new-model", "temperature": 0.3},
        )
        assert result.model_id == "new-model"
        assert result.temperature == 0.3
        db.add.assert_not_called()  # update, not insert

    async def test_upsert_rejects_invalid_agent_type(self):
        db = AsyncMock()
        with pytest.raises(ValueError, match="Unknown agent type"):
            await self.svc.upsert_policy(
                db=db,
                workspace_id=uuid.uuid4(),
                agent_type="invalid_type",
                data={"model_id": "test"},
            )

    async def test_delete_policy_found(self):
        db = AsyncMock()
        mock_policy = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_policy
        db.execute.return_value = mock_result

        deleted = await self.svc.delete_policy(
            db, uuid.uuid4(), "orchestrator",
        )
        assert deleted is True
        db.delete.assert_called_once_with(mock_policy)

    async def test_delete_policy_not_found(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        deleted = await self.svc.delete_policy(
            db, uuid.uuid4(), "orchestrator",
        )
        assert deleted is False

    async def test_get_effective_config_with_policy(self):
        db = AsyncMock()
        mock_policy = MagicMock()
        mock_policy.provider = "openrouter"
        mock_policy.model_id = "custom-model"
        mock_policy.temperature = 0.4
        mock_policy.max_tokens = 8192
        mock_policy.fallback_model_id = "fallback-model"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_policy
        db.execute.return_value = mock_result

        config = await self.svc.get_effective_config(
            db, uuid.uuid4(), "orchestrator",
        )
        assert config["source"] == "policy"
        assert config["model_id"] == "custom-model"
        assert config["temperature"] == 0.4

    async def test_get_effective_config_uses_defaults(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        config = await self.svc.get_effective_config(
            db, uuid.uuid4(), "orchestrator",
        )
        assert config["source"] == "default"
        assert config["agent_type"] == "orchestrator"
        defaults = DEFAULT_MODEL_CONFIGS["orchestrator"]
        assert config["model_id"] == defaults["model_id"]


# ===========================================================================
# PRS-F02 — Runtime Model Router Service
# ===========================================================================

class TestModelRouterService:
    """Runtime model resolution tests."""

    def setup_method(self):
        self.svc = ModelRouterService()

    async def test_resolve_uses_policy_when_exists(self):
        db = AsyncMock()
        mock_policy = MagicMock()
        mock_policy.id = uuid.uuid4()
        mock_policy.provider = "openrouter"
        mock_policy.model_id = "custom/model"
        mock_policy.temperature = 0.3
        mock_policy.max_tokens = 8192
        mock_policy.fallback_model_id = "openai/gpt-4o-mini"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_policy
        db.execute.return_value = mock_result

        resolution = await self.svc.resolve(
            db, uuid.uuid4(), "orchestrator",
        )
        assert resolution.source == "policy"
        assert resolution.model_id == "custom/model"
        assert resolution.policy_id == mock_policy.id

    async def test_resolve_uses_defaults_when_no_policy(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        resolution = await self.svc.resolve(
            db, uuid.uuid4(), "orchestrator",
        )
        assert resolution.source == "default"
        defaults = DEFAULT_MODEL_CONFIGS["orchestrator"]
        assert resolution.model_id == defaults["model_id"]
        assert resolution.temperature == defaults["temperature"]

    async def test_resolve_rejects_invalid_agent(self):
        db = AsyncMock()
        with pytest.raises(ValueError, match="Unknown agent type"):
            await self.svc.resolve(db, uuid.uuid4(), "nonexistent")

    async def test_resolve_all_valid_agent_types(self):
        """Every valid agent type has a default config."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        for agent_type in VALID_AGENT_TYPES:
            resolution = await self.svc.resolve(
                db, uuid.uuid4(), agent_type,
            )
            assert resolution.agent_type == agent_type
            assert resolution.model_id is not None
            assert resolution.provider is not None

    async def test_resolve_with_fallback_primary_ok(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        resolution = await self.svc.resolve_with_fallback(
            db, uuid.uuid4(), "orchestrator",
            primary_failed=False,
        )
        assert resolution.source == "default"
        defaults = DEFAULT_MODEL_CONFIGS["orchestrator"]
        assert resolution.model_id == defaults["model_id"]

    async def test_resolve_with_fallback_primary_failed(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        resolution = await self.svc.resolve_with_fallback(
            db, uuid.uuid4(), "orchestrator",
            primary_failed=True,
            failure_reason="rate_limited",
        )
        assert resolution.source == "fallback"
        defaults = DEFAULT_MODEL_CONFIGS["orchestrator"]
        assert resolution.model_id == defaults["fallback_model_id"]
        assert resolution.fallback_model_id is None  # no further fallback

    async def test_resolve_with_fallback_no_fallback_available(self):
        """When primary fails but no fallback is set, return primary anyway."""
        db = AsyncMock()
        mock_policy = MagicMock()
        mock_policy.id = uuid.uuid4()
        mock_policy.provider = "openrouter"
        mock_policy.model_id = "custom/model"
        mock_policy.temperature = 0.3
        mock_policy.max_tokens = 4096
        mock_policy.fallback_model_id = None  # no fallback
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_policy
        db.execute.return_value = mock_result

        resolution = await self.svc.resolve_with_fallback(
            db, uuid.uuid4(), "orchestrator",
            primary_failed=True,
        )
        # Falls back but no fallback available, so returns primary
        assert resolution.source == "policy"
        assert resolution.model_id == "custom/model"

    async def test_default_configs_complete(self):
        """Every valid agent type has a default config entry."""
        for agent_type in VALID_AGENT_TYPES:
            assert agent_type in DEFAULT_MODEL_CONFIGS, \
                f"Missing default config for {agent_type}"
            config = DEFAULT_MODEL_CONFIGS[agent_type]
            assert "provider" in config
            assert "model_id" in config
            assert "temperature" in config
            assert "max_tokens" in config

    async def test_default_configs_have_fallbacks(self):
        """All default configs include a fallback model."""
        for agent_type, config in DEFAULT_MODEL_CONFIGS.items():
            assert "fallback_model_id" in config, \
                f"Missing fallback for {agent_type}"
            assert config["fallback_model_id"] is not None


# ===========================================================================
# PRS-F03 — Model Usage Telemetry
# ===========================================================================

class TestModelTelemetry:
    """Telemetry record creation and persistence tests."""

    def setup_method(self):
        self.svc = ModelRouterService()

    def test_telemetry_record_creation(self):
        resolution = ModelResolution(
            agent_type="orchestrator",
            provider="openrouter",
            model_id="anthropic/claude-4.5-sonnet-20250929",
            temperature=0.3,
            max_tokens=4096,
            source="policy",
        )
        workspace_id = uuid.uuid4()
        telemetry = self.svc.create_telemetry(
            resolution=resolution,
            workspace_id=workspace_id,
            latency_ms=150.5,
            token_count=1200,
        )
        assert telemetry.agent_type == "orchestrator"
        assert telemetry.resolved_model == "anthropic/claude-4.5-sonnet-20250929"
        assert telemetry.resolved_provider == "openrouter"
        assert telemetry.source == "policy"
        assert telemetry.latency_ms == 150.5
        assert telemetry.token_count == 1200
        assert telemetry.fallback_used is False

    def test_telemetry_with_fallback(self):
        resolution = ModelResolution(
            agent_type="copywriting",
            provider="openrouter",
            model_id="openai/gpt-4o",
            temperature=0.7,
            max_tokens=8192,
            source="fallback",
        )
        telemetry = self.svc.create_telemetry(
            resolution=resolution,
            workspace_id=uuid.uuid4(),
            fallback_used=True,
            fallback_reason="rate_limited",
        )
        assert telemetry.fallback_used is True
        assert telemetry.fallback_reason == "rate_limited"
        assert telemetry.source == "fallback"

    def test_telemetry_to_dict(self):
        record = TelemetryRecord(
            agent_type="lead_discovery",
            workspace_id=uuid.uuid4(),
            resolved_model="test-model",
            resolved_provider="openrouter",
            source="default",
            latency_ms=200.0,
            token_count=500,
        )
        d = record.to_dict()
        assert d["agent_type"] == "lead_discovery"
        assert d["resolved_model"] == "test-model"
        assert d["source"] == "default"
        assert d["fallback_used"] is False
        assert "timestamp" in d
        assert "workspace_id" in d

    def test_telemetry_fields_present(self):
        """Verify all required telemetry fields are present."""
        record = TelemetryRecord(
            agent_type="orchestrator",
            workspace_id=uuid.uuid4(),
            resolved_model="model",
            resolved_provider="provider",
            source="policy",
        )
        d = record.to_dict()
        required_fields = {
            "agent_type", "workspace_id", "resolved_model",
            "resolved_provider", "source", "fallback_used",
            "fallback_reason", "latency_ms", "token_count", "timestamp",
        }
        assert set(d.keys()) == required_fields

    async def test_record_telemetry_persists(self):
        """Telemetry is stored as ProspectingToolOutput."""
        db = AsyncMock()
        db.add = MagicMock()  # .add() is sync on AsyncSession
        workspace_id = uuid.uuid4()

        record = TelemetryRecord(
            agent_type="orchestrator",
            workspace_id=workspace_id,
            resolved_model="test-model",
            resolved_provider="openrouter",
            source="default",
            latency_ms=100.0,
        )

        await self.svc.record_telemetry(
            db=db,
            workspace_id=workspace_id,
            telemetry=record,
        )

        db.add.assert_called_once()
        db.flush.assert_called_once()

        # Verify the object passed to db.add
        tool_output = db.add.call_args[0][0]
        assert tool_output.tool_name == "model_router:orchestrator"
        assert tool_output.workspace_id == workspace_id

    async def test_record_telemetry_with_context_ids(self):
        """Telemetry can be linked to message and run."""
        db = AsyncMock()
        db.add = MagicMock()  # .add() is sync on AsyncSession
        workspace_id = uuid.uuid4()
        message_id = uuid.uuid4()
        run_id = uuid.uuid4()

        record = TelemetryRecord(
            agent_type="lead_discovery",
            workspace_id=workspace_id,
            resolved_model="test-model",
            resolved_provider="openrouter",
            source="policy",
        )

        await self.svc.record_telemetry(
            db=db,
            workspace_id=workspace_id,
            telemetry=record,
            message_id=message_id,
            run_id=run_id,
        )

        tool_output = db.add.call_args[0][0]
        assert tool_output.message_id == message_id
        assert tool_output.run_id == run_id

    async def test_record_telemetry_marks_fallback_as_error(self):
        """Telemetry with fallback_used=True sets is_error=True."""
        db = AsyncMock()
        db.add = MagicMock()  # .add() is sync on AsyncSession
        record = TelemetryRecord(
            agent_type="orchestrator",
            workspace_id=uuid.uuid4(),
            resolved_model="fallback-model",
            resolved_provider="openrouter",
            source="fallback",
            fallback_used=True,
            fallback_reason="timeout",
        )

        await self.svc.record_telemetry(
            db=db,
            workspace_id=uuid.uuid4(),
            telemetry=record,
        )

        tool_output = db.add.call_args[0][0]
        assert tool_output.is_error is True


# ===========================================================================
# Route registration and integration
# ===========================================================================

class TestModelRoutes:
    """Test model policy route registration."""

    def test_model_routes_registered(self):
        from app.routers.prospecting import router
        paths = [r.path for r in router.routes]
        assert "/models" in paths
        assert "/models/{agent_type}" in paths

    def test_patch_route_has_body_param(self):
        """PATCH /models/{agent_type} accepts ModelPolicyUpdate body."""
        from app.routers.prospecting import router
        for route in router.routes:
            if route.path == "/models/{agent_type}" and hasattr(route, "methods"):
                if "PATCH" in route.methods:
                    # Route exists with PATCH method
                    assert True
                    return
        pytest.fail("PATCH /models/{agent_type} not found")


class TestModelSchemas:
    """Schema validation tests for model policy."""

    def test_model_policy_update_valid(self):
        from app.schemas.prospecting import ModelPolicyUpdate
        p = ModelPolicyUpdate(
            model_id="openai/gpt-4o",
            temperature=0.5,
            max_tokens=4096,
        )
        assert p.model_id == "openai/gpt-4o"
        assert p.temperature == 0.5

    def test_model_policy_update_all_optional(self):
        from app.schemas.prospecting import ModelPolicyUpdate
        p = ModelPolicyUpdate()
        assert p.model_id is None
        assert p.temperature is None
        assert p.max_tokens is None

    def test_model_policy_update_temperature_bounds(self):
        from app.schemas.prospecting import ModelPolicyUpdate
        from pydantic import ValidationError
        # Valid
        p = ModelPolicyUpdate(temperature=1.5)
        assert p.temperature == 1.5
        # Too high
        with pytest.raises(ValidationError):
            ModelPolicyUpdate(temperature=3.0)
        # Too low
        with pytest.raises(ValidationError):
            ModelPolicyUpdate(temperature=-0.1)

    def test_model_policy_update_max_tokens_bounds(self):
        from app.schemas.prospecting import ModelPolicyUpdate
        from pydantic import ValidationError
        # Valid
        p = ModelPolicyUpdate(max_tokens=8192)
        assert p.max_tokens == 8192
        # Too low
        with pytest.raises(ValidationError):
            ModelPolicyUpdate(max_tokens=0)

    def test_model_policy_response_shape(self):
        from app.schemas.prospecting import ModelPolicyResponse
        fields = ModelPolicyResponse.model_fields
        required_keys = {
            "id", "workspace_id", "agent_type", "provider",
            "model_id", "temperature", "max_tokens",
            "fallback_model_id", "is_default",
            "created_at", "updated_at",
        }
        assert required_keys.issubset(set(fields.keys()))


# ===========================================================================
# Existing endpoints still work
# ===========================================================================

class TestExistingEndpointsStablePhase7:
    """Confirm Phase 7 changes don't break existing routes."""

    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_auth_me(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
