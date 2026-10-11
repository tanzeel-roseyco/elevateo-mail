"""Tests for workspace personalization settings (OpenRouter key + model id)."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.prospecting.openrouter_settings_service import (
    OpenRouterSettingsService,
)


class TestOpenRouterSettingsService:
    async def test_resolve_api_key_prefers_workspace_secret(self):
        svc = OpenRouterSettingsService()
        db = AsyncMock()
        secret = MagicMock()
        secret.is_active = True
        secret.encrypted_value = "encrypted"
        result = MagicMock()
        result.scalar_one_or_none.return_value = secret
        db.execute.return_value = result

        mock_settings = MagicMock()
        mock_settings.OPENROUTER_API_KEY = "env-key"

        with patch(
            "app.services.prospecting.openrouter_settings_service.decrypt",
            return_value="workspace-key",
        ), patch(
            "app.services.prospecting.openrouter_settings_service.get_settings",
            return_value=mock_settings,
        ):
            value, source = await svc.resolve_api_key(db, uuid.uuid4())

        assert value == "workspace-key"
        assert source == "workspace"

    async def test_resolve_api_key_falls_back_to_env(self):
        svc = OpenRouterSettingsService()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result

        mock_settings = MagicMock()
        mock_settings.OPENROUTER_API_KEY = "env-key"

        with patch(
            "app.services.prospecting.openrouter_settings_service.get_settings",
            return_value=mock_settings,
        ):
            value, source = await svc.resolve_api_key(db, uuid.uuid4())

        assert value == "env-key"
        assert source == "env"

    async def test_update_settings_upserts_copywriting_model(self):
        svc = OpenRouterSettingsService()
        db = AsyncMock()
        ws_id = uuid.uuid4()

        with patch.object(
            svc,
            "set_api_key",
            new_callable=AsyncMock,
        ) as mock_set_key, patch(
            "app.services.prospecting.openrouter_settings_service.model_policy_crud.upsert_policy",
            new_callable=AsyncMock,
        ) as mock_upsert, patch.object(
            svc,
            "get_settings",
            new_callable=AsyncMock,
            return_value={
                "api_key_configured": True,
                "api_key_source": "workspace",
                "model_id": "openai/gpt-4o-mini",
                "model_source": "policy",
            },
        ):
            payload = await svc.update_settings(
                db=db,
                workspace_id=ws_id,
                api_key="sk-test",
                model_id="openai/gpt-4o-mini",
            )

        mock_set_key.assert_awaited_once_with(db, ws_id, "sk-test")
        mock_upsert.assert_awaited_once()
        assert payload["model_id"] == "openai/gpt-4o-mini"


class TestPersonalizationSettingsRoutes:
    async def test_get_personalization_settings(self, client):
        expected = {
            "api_key_configured": True,
            "api_key_source": "workspace",
            "model_id": "openai/gpt-4o-mini",
            "model_source": "policy",
        }
        with patch(
            "app.routers.prospecting.openrouter_settings_service.get_settings",
            new_callable=AsyncMock,
            return_value=expected,
        ):
            resp = await client.get("/api/prospecting/personalization/settings")

        assert resp.status_code == 200
        assert resp.json() == expected

    async def test_patch_personalization_settings(self, client):
        expected = {
            "api_key_configured": True,
            "api_key_source": "workspace",
            "model_id": "anthropic/claude-3.5-sonnet",
            "model_source": "policy",
        }
        with patch(
            "app.routers.prospecting.openrouter_settings_service.update_settings",
            new_callable=AsyncMock,
            return_value=expected,
        ) as mock_update:
            resp = await client.patch(
                "/api/prospecting/personalization/settings",
                json={
                    "api_key": "sk-abc123",
                    "model_id": "anthropic/claude-3.5-sonnet",
                },
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["api_key_configured"] is True
        assert body["model_id"] == "anthropic/claude-3.5-sonnet"
        mock_update.assert_awaited_once()

