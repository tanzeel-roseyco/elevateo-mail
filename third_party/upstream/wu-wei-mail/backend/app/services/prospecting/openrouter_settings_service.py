"""Workspace-scoped OpenRouter settings service for prospecting personalization."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.prospecting import WorkspaceIntegrationSecret
from app.services.prospecting.model_router_service import model_policy_crud
from app.utils.encryption import decrypt, encrypt

INTEGRATION_TYPE = "openrouter"
API_KEY_NAME = "api_key"
COPYWRITING_AGENT = "copywriting"


class OpenRouterSettingsService:
    """Manage OpenRouter API key and model selection per workspace."""

    async def _get_api_key_secret(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> WorkspaceIntegrationSecret | None:
        result = await db.execute(
            select(WorkspaceIntegrationSecret).where(
                WorkspaceIntegrationSecret.workspace_id == workspace_id,
                WorkspaceIntegrationSecret.integration_type == INTEGRATION_TYPE,
                WorkspaceIntegrationSecret.key_name == API_KEY_NAME,
            )
        )
        return result.scalar_one_or_none()

    async def resolve_api_key(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> tuple[str | None, str]:
        """Resolve API key with workspace override and env fallback."""
        secret = await self._get_api_key_secret(db, workspace_id)
        if secret and secret.is_active:
            try:
                value = decrypt(secret.encrypted_value)
                if value:
                    return value, "workspace"
            except Exception:
                # Treat bad secret as missing and continue to env fallback.
                pass

        settings = get_settings()
        if settings.OPENROUTER_API_KEY:
            return settings.OPENROUTER_API_KEY, "env"
        return None, "none"

    async def set_api_key(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        api_key: str,
    ) -> None:
        """Create or update the encrypted workspace API key."""
        value = api_key.strip()
        if not value:
            raise ValueError("api_key cannot be empty")

        secret = await self._get_api_key_secret(db, workspace_id)
        encrypted = encrypt(value)
        if secret:
            secret.encrypted_value = encrypted
            secret.is_active = True
        else:
            db.add(
                WorkspaceIntegrationSecret(
                    workspace_id=workspace_id,
                    integration_type=INTEGRATION_TYPE,
                    key_name=API_KEY_NAME,
                    encrypted_value=encrypted,
                    is_active=True,
                )
            )
        await db.flush()

    async def clear_api_key(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> None:
        """Remove workspace API key override."""
        secret = await self._get_api_key_secret(db, workspace_id)
        if not secret:
            return
        await db.delete(secret)
        await db.flush()

    async def get_settings(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Get effective personalization settings for the workspace."""
        api_key, api_key_source = await self.resolve_api_key(db, workspace_id)
        model_cfg = await model_policy_crud.get_effective_config(
            db=db,
            workspace_id=workspace_id,
            agent_type=COPYWRITING_AGENT,
        )
        return {
            "api_key_configured": bool(api_key),
            "api_key_source": api_key_source,
            "model_id": model_cfg["model_id"],
            "model_source": model_cfg["source"],
        }

    async def update_settings(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        *,
        api_key: str | None = None,
        model_id: str | None = None,
        clear_api_key: bool = False,
    ) -> dict[str, Any]:
        """Update workspace personalization settings."""
        if clear_api_key:
            await self.clear_api_key(db, workspace_id)
        elif api_key is not None:
            await self.set_api_key(db, workspace_id, api_key)

        if model_id is not None:
            model_value = model_id.strip()
            if not model_value:
                raise ValueError("model_id cannot be empty")
            await model_policy_crud.upsert_policy(
                db=db,
                workspace_id=workspace_id,
                agent_type=COPYWRITING_AGENT,
                data={"provider": "openrouter", "model_id": model_value},
            )

        return await self.get_settings(db, workspace_id)


openrouter_settings_service = OpenRouterSettingsService()

