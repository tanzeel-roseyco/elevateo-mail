"""Tests for auto-responder API routes — config, regions, rules, queue, analytics."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


def _make_config(**overrides):
    """Create a mock AutoResponderConfig with sensible defaults."""
    config = MagicMock()
    config.id = overrides.get("id", uuid.uuid4())
    config.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    config.is_enabled = overrides.get("is_enabled", False)
    config.ai_model = overrides.get("ai_model", "openai/gpt-4o")
    config.ai_api_key_encrypted = overrides.get("ai_api_key_encrypted", None)
    config.tone = overrides.get("tone", "professional")
    config.brand_description = overrides.get("brand_description", None)
    config.example_phrases = overrides.get("example_phrases", None)
    config.forbidden_words = overrides.get("forbidden_words", None)
    config.signature_template = overrides.get("signature_template", None)
    config.language = overrides.get("language", "en")
    config.max_response_length = overrides.get("max_response_length", 500)
    config.confidence_threshold = overrides.get("confidence_threshold", 0.7)
    config.escalation_keywords = overrides.get("escalation_keywords", None)
    config.max_responses_per_hour = overrides.get("max_responses_per_hour", 50)
    config.cooldown_minutes = overrides.get("cooldown_minutes", 5)
    config.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    config.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return config


def _make_region(**overrides):
    """Create a mock ResponderRegion with sensible defaults."""
    region = MagicMock()
    region.id = overrides.get("id", uuid.uuid4())
    region.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    region.name = overrides.get("name", "US Region")
    region.description = overrides.get("description", None)
    region.priority = overrides.get("priority", 0)
    region.is_active = overrides.get("is_active", True)
    region.conditions = overrides.get("conditions", {"rules": [], "match_all": True})
    region.tone_override = overrides.get("tone_override", None)
    region.example_phrases_override = overrides.get("example_phrases_override", None)
    region.custom_system_prompt = overrides.get("custom_system_prompt", None)
    region.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    region.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return region


def _make_rule(**overrides):
    """Create a mock ResponderRule with sensible defaults."""
    rule = MagicMock()
    rule.id = overrides.get("id", uuid.uuid4())
    rule.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    rule.name = overrides.get("name", "Default Rule")
    rule.is_active = overrides.get("is_active", True)
    rule.priority = overrides.get("priority", 0)
    rule.campaign_id = overrides.get("campaign_id", None)
    rule.region_id = overrides.get("region_id", None)
    rule.action = overrides.get("action", "auto_respond")
    rule.response_template = overrides.get("response_template", None)
    rule.delay_minutes = overrides.get("delay_minutes", 0)
    rule.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    rule.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return rule


# ---------------------------------------------------------------------------
# GET /api/auto-responder/config
# ---------------------------------------------------------------------------

class TestGetConfig:

    async def test_get_config_returns_default(self, client):
        """GET /config returns default config when none exists."""
        config = _make_config()
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_or_create_config",
            new_callable=AsyncMock,
            return_value=config,
        ):
            resp = await client.get("/api/auto-responder/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_enabled"] is False
        assert data["ai_model"] == "openai/gpt-4o"
        assert data["tone"] == "professional"
        assert data["confidence_threshold"] == 0.7
        assert data["max_responses_per_hour"] == 50


# ---------------------------------------------------------------------------
# PATCH /api/auto-responder/config
# ---------------------------------------------------------------------------

class TestUpdateConfig:

    async def test_update_config_fields(self, client):
        """PATCH /config updates specified fields."""
        updated_config = _make_config(is_enabled=True, tone="casual", max_response_length=300)
        with patch(
            "app.routers.auto_responder.auto_responder_service.update_config",
            new_callable=AsyncMock,
            return_value=updated_config,
        ):
            resp = await client.patch("/api/auto-responder/config", json={
                "is_enabled": True,
                "tone": "casual",
                "max_response_length": 300,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_enabled"] is True
        assert data["tone"] == "casual"
        assert data["max_response_length"] == 300

    async def test_update_config_partial(self, client):
        """PATCH /config with only one field updates just that field."""
        updated_config = _make_config(confidence_threshold=0.9)
        with patch(
            "app.routers.auto_responder.auto_responder_service.update_config",
            new_callable=AsyncMock,
            return_value=updated_config,
        ):
            resp = await client.patch("/api/auto-responder/config", json={
                "confidence_threshold": 0.9,
            })
        assert resp.status_code == 200
        assert resp.json()["confidence_threshold"] == 0.9


# ---------------------------------------------------------------------------
# POST /api/auto-responder/config/test
# ---------------------------------------------------------------------------

class TestAIProviderTest:

    async def test_config_test_success(self, client):
        """POST /config/test with working AI returns success."""
        config = _make_config()
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_or_create_config",
            new_callable=AsyncMock,
            return_value=config,
        ), patch(
            "app.routers.auto_responder.auto_responder_service.get_decrypted_api_key",
            return_value="test-api-key",
        ), patch(
            "app.services.ai_provider.generate_response",
            new_callable=AsyncMock,
            return_value={"body": "Hello! I'd be happy to help you."},
        ):
            resp = await client.post("/api/auto-responder/config/test", json={
                "test_message": "Tell me about your product.",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "happy to help" in data["response_preview"].lower()

    async def test_config_test_no_api_key(self, client):
        """POST /config/test without API key returns error."""
        config = _make_config()
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_or_create_config",
            new_callable=AsyncMock,
            return_value=config,
        ), patch(
            "app.routers.auto_responder.auto_responder_service.get_decrypted_api_key",
            return_value="",
        ):
            resp = await client.post("/api/auto-responder/config/test", json={
                "test_message": "Hello",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "API key" in data["error"]


# ---------------------------------------------------------------------------
# CRUD: Regions
# ---------------------------------------------------------------------------

class TestRegionsCRUD:

    async def test_create_region(self, client):
        """POST /regions creates a new region."""
        region = _make_region(name="EU Region")
        with patch(
            "app.routers.auto_responder.auto_responder_service.create_region",
            new_callable=AsyncMock,
            return_value=region,
        ):
            resp = await client.post("/api/auto-responder/regions", json={
                "name": "EU Region",
                "conditions": {"rules": [{"field": "country", "operator": "in", "value": ["DE", "FR", "IT"]}], "match_all": True},
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "EU Region"

    async def test_list_regions(self, client):
        """GET /regions returns list of regions."""
        regions = [
            _make_region(name="US Region"),
            _make_region(name="EU Region"),
        ]
        with patch(
            "app.routers.auto_responder.auto_responder_service.list_regions",
            new_callable=AsyncMock,
            return_value=regions,
        ):
            resp = await client.get("/api/auto-responder/regions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "US Region"
        assert data[1]["name"] == "EU Region"

    async def test_list_regions_empty(self, client):
        """GET /regions returns empty list when no regions exist."""
        with patch(
            "app.routers.auto_responder.auto_responder_service.list_regions",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = await client.get("/api/auto-responder/regions")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_update_region(self, client):
        """PATCH /regions/{id} updates region fields."""
        rid = uuid.uuid4()
        updated = _make_region(id=rid, name="Updated Region", priority=10)
        with patch(
            "app.routers.auto_responder.auto_responder_service.update_region",
            new_callable=AsyncMock,
            return_value=updated,
        ):
            resp = await client.patch(f"/api/auto-responder/regions/{rid}", json={
                "name": "Updated Region",
                "priority": 10,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Updated Region"
        assert data["priority"] == 10

    async def test_update_region_not_found(self, client):
        """PATCH /regions/{id} returns 404 when region not found."""
        rid = uuid.uuid4()
        with patch(
            "app.routers.auto_responder.auto_responder_service.update_region",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = await client.patch(f"/api/auto-responder/regions/{rid}", json={
                "name": "Nonexistent",
            })
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    async def test_delete_region(self, client):
        """DELETE /regions/{id} deletes the region."""
        rid = uuid.uuid4()
        with patch(
            "app.routers.auto_responder.auto_responder_service.delete_region",
            new_callable=AsyncMock,
            return_value=True,
        ):
            resp = await client.delete(f"/api/auto-responder/regions/{rid}")
        assert resp.status_code == 204

    async def test_delete_region_not_found(self, client):
        """DELETE /regions/{id} returns 404 when region not found."""
        rid = uuid.uuid4()
        with patch(
            "app.routers.auto_responder.auto_responder_service.delete_region",
            new_callable=AsyncMock,
            return_value=False,
        ):
            resp = await client.delete(f"/api/auto-responder/regions/{rid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# CRUD: Rules
# ---------------------------------------------------------------------------

class TestRulesCRUD:

    async def test_create_rule(self, client):
        """POST /rules creates a new rule."""
        rule = _make_rule(name="Escalate Legal")
        with patch(
            "app.routers.auto_responder.auto_responder_service.create_rule",
            new_callable=AsyncMock,
            return_value=rule,
        ):
            resp = await client.post("/api/auto-responder/rules", json={
                "name": "Escalate Legal",
                "action": "escalate",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Escalate Legal"

    async def test_list_rules(self, client):
        """GET /rules returns list of rules."""
        rules = [
            _make_rule(name="Auto Respond Default"),
            _make_rule(name="Escalate Legal"),
        ]
        with patch(
            "app.routers.auto_responder.auto_responder_service.list_rules",
            new_callable=AsyncMock,
            return_value=rules,
        ):
            resp = await client.get("/api/auto-responder/rules")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "Auto Respond Default"
        assert data[1]["name"] == "Escalate Legal"

    async def test_list_rules_empty(self, client):
        """GET /rules returns empty list when no rules exist."""
        with patch(
            "app.routers.auto_responder.auto_responder_service.list_rules",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = await client.get("/api/auto-responder/rules")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_update_rule(self, client):
        """PATCH /rules/{id} updates rule fields."""
        rid = uuid.uuid4()
        updated = _make_rule(id=rid, name="Updated Rule", action="skip")
        with patch(
            "app.routers.auto_responder.auto_responder_service.update_rule",
            new_callable=AsyncMock,
            return_value=updated,
        ):
            resp = await client.patch(f"/api/auto-responder/rules/{rid}", json={
                "name": "Updated Rule",
                "action": "skip",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Updated Rule"
        assert data["action"] == "skip"

    async def test_update_rule_not_found(self, client):
        """PATCH /rules/{id} returns 404 when rule not found."""
        rid = uuid.uuid4()
        with patch(
            "app.routers.auto_responder.auto_responder_service.update_rule",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = await client.patch(f"/api/auto-responder/rules/{rid}", json={
                "name": "Nonexistent",
            })
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    async def test_delete_rule(self, client):
        """DELETE /rules/{id} deletes the rule."""
        rid = uuid.uuid4()
        with patch(
            "app.routers.auto_responder.auto_responder_service.delete_rule",
            new_callable=AsyncMock,
            return_value=True,
        ):
            resp = await client.delete(f"/api/auto-responder/rules/{rid}")
        assert resp.status_code == 204

    async def test_delete_rule_not_found(self, client):
        """DELETE /rules/{id} returns 404 when rule not found."""
        rid = uuid.uuid4()
        with patch(
            "app.routers.auto_responder.auto_responder_service.delete_rule",
            new_callable=AsyncMock,
            return_value=False,
        ):
            resp = await client.delete(f"/api/auto-responder/rules/{rid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/auto-responder/queue
# ---------------------------------------------------------------------------

class TestQueue:

    async def test_get_queue(self, client):
        """GET /queue returns paginated queue items."""
        msg_id = uuid.uuid4()
        items = [{
            "inbox_message_id": msg_id,
            "lead_email": "lead@example.com",
            "lead_name": "Jane Doe",
            "subject": "Re: Hello",
            "body_preview": "I'm interested...",
            "campaign_name": None,
            "region_name": None,
            "responder_status": "pending",
            "confidence_score": None,
            "generated_body": None,
            "received_at": datetime.now(timezone.utc),
        }]
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_queue",
            new_callable=AsyncMock,
            return_value=(items, 1),
        ):
            resp = await client.get("/api/auto-responder/queue")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["lead_email"] == "lead@example.com"
        assert data["items"][0]["responder_status"] == "pending"

    async def test_get_queue_empty(self, client):
        """GET /queue returns empty list when queue is empty."""
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_queue",
            new_callable=AsyncMock,
            return_value=([], 0),
        ):
            resp = await client.get("/api/auto-responder/queue")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_get_queue_with_filters(self, client):
        """GET /queue passes query params through."""
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_queue",
            new_callable=AsyncMock,
            return_value=([], 0),
        ) as mock_queue:
            resp = await client.get("/api/auto-responder/queue?status=escalated&skip=10&limit=25")
        assert resp.status_code == 200
        mock_queue.assert_called_once()
        call_args = mock_queue.call_args
        # Verify the status filter was passed
        assert "escalated" in str(call_args)


# ---------------------------------------------------------------------------
# GET /api/auto-responder/analytics/summary
# ---------------------------------------------------------------------------

class TestAnalyticsSummary:

    async def test_analytics_summary(self, client):
        """GET /analytics/summary returns aggregate stats."""
        summary = {
            "total_processed": 100,
            "total_responded": 80,
            "total_escalated": 15,
            "total_skipped": 5,
            "avg_confidence": 0.85,
            "avg_response_time_ms": 1200.5,
            "escalation_rate": 0.15,
        }
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_analytics_summary",
            new_callable=AsyncMock,
            return_value=summary,
        ):
            resp = await client.get("/api/auto-responder/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_processed"] == 100
        assert data["total_responded"] == 80
        assert data["total_escalated"] == 15
        assert data["total_skipped"] == 5
        assert data["avg_confidence"] == 0.85
        assert data["escalation_rate"] == 0.15

    async def test_analytics_summary_empty(self, client):
        """GET /analytics/summary returns zeros when no data."""
        summary = {
            "total_processed": 0,
            "total_responded": 0,
            "total_escalated": 0,
            "total_skipped": 0,
            "avg_confidence": None,
            "avg_response_time_ms": None,
            "escalation_rate": 0,
        }
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_analytics_summary",
            new_callable=AsyncMock,
            return_value=summary,
        ):
            resp = await client.get("/api/auto-responder/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_processed"] == 0
        assert data["escalation_rate"] == 0

    async def test_analytics_summary_with_days_param(self, client):
        """GET /analytics/summary passes days parameter through."""
        summary = {
            "total_processed": 10,
            "total_responded": 8,
            "total_escalated": 1,
            "total_skipped": 1,
            "avg_confidence": 0.9,
            "avg_response_time_ms": 900.0,
            "escalation_rate": 0.1,
        }
        with patch(
            "app.routers.auto_responder.auto_responder_service.get_analytics_summary",
            new_callable=AsyncMock,
            return_value=summary,
        ) as mock_summary:
            resp = await client.get("/api/auto-responder/analytics/summary?days=7")
        assert resp.status_code == 200
        mock_summary.assert_called_once()
        call_args = mock_summary.call_args
        assert call_args[0][2] == 7 or call_args.kwargs.get("days") == 7 or 7 in call_args[0]


# ---------------------------------------------------------------------------
# Unauthenticated access
# ---------------------------------------------------------------------------

class TestAutoResponderUnauthenticated:

    async def test_unauthenticated_config(self, unauth_client):
        resp = await unauth_client.get("/api/auto-responder/config")
        assert resp.status_code == 401

    async def test_unauthenticated_regions(self, unauth_client):
        resp = await unauth_client.get("/api/auto-responder/regions")
        assert resp.status_code == 401

    async def test_unauthenticated_rules(self, unauth_client):
        resp = await unauth_client.get("/api/auto-responder/rules")
        assert resp.status_code == 401

    async def test_unauthenticated_queue(self, unauth_client):
        resp = await unauth_client.get("/api/auto-responder/queue")
        assert resp.status_code == 401

    async def test_unauthenticated_analytics(self, unauth_client):
        resp = await unauth_client.get("/api/auto-responder/analytics/summary")
        assert resp.status_code == 401
