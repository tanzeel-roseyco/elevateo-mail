"""Runtime model router — resolves model config per agent type per workspace.

Each agent call resolves its model from the agent_model_policies table.
If no policy exists, workspace-level or system defaults are used.
If the primary model is unavailable, the fallback model is tried.

Telemetry metadata is attached to every resolution for audit.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import AgentModelPolicy
from app.schemas.prospecting import VALID_AGENT_TYPES


# ---------------------------------------------------------------------------
# Default model configurations (used when no policy row exists)
# ---------------------------------------------------------------------------

DEFAULT_MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "orchestrator": {
        "provider": "openrouter",
        "model_id": "anthropic/claude-4.5-sonnet-20250929",
        "temperature": 0.3,
        "max_tokens": 4096,
        "fallback_model_id": "google/gemini-2.5-flash",
    },
    "lead_discovery": {
        "provider": "openrouter",
        "model_id": "anthropic/claude-4.5-sonnet-20250929",
        "temperature": 0.2,
        "max_tokens": 8192,
        "fallback_model_id": "google/gemini-2.5-flash",
    },
    "lead_enrichment": {
        "provider": "openrouter",
        "model_id": "google/gemini-2.5-flash-lite",
        "temperature": 0.1,
        "max_tokens": 4096,
        "fallback_model_id": "openai/gpt-4o-mini",
    },
    "copywriting": {
        "provider": "openrouter",
        "model_id": "anthropic/claude-4.5-sonnet-20250929",
        "temperature": 0.7,
        "max_tokens": 8192,
        "fallback_model_id": "google/gemini-2.5-flash",
    },
    "campaign_builder": {
        "provider": "openrouter",
        "model_id": "google/gemini-2.5-flash",
        "temperature": 0.2,
        "max_tokens": 4096,
        "fallback_model_id": "openai/gpt-4o-mini",
    },
}


# ---------------------------------------------------------------------------
# Resolution result
# ---------------------------------------------------------------------------

@dataclass
class ModelResolution:
    """Result of model resolution for a single agent call."""
    agent_type: str
    provider: str
    model_id: str
    temperature: float
    max_tokens: int
    fallback_model_id: str | None = None
    source: str = "default"  # "policy", "default", "fallback"
    policy_id: uuid.UUID | None = None


@dataclass
class TelemetryRecord:
    """Per-call telemetry for model usage audit."""
    agent_type: str
    workspace_id: uuid.UUID
    resolved_model: str
    resolved_provider: str
    source: str  # "policy", "default", "fallback"
    fallback_used: bool = False
    fallback_reason: str | None = None
    latency_ms: float | None = None
    token_count: int | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_type": self.agent_type,
            "workspace_id": str(self.workspace_id),
            "resolved_model": self.resolved_model,
            "resolved_provider": self.resolved_provider,
            "source": self.source,
            "fallback_used": self.fallback_used,
            "fallback_reason": self.fallback_reason,
            "latency_ms": self.latency_ms,
            "token_count": self.token_count,
            "timestamp": self.timestamp.isoformat(),
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ModelRouterService:
    """Resolves model configuration per workspace + agent type."""

    async def resolve(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        agent_type: str,
    ) -> ModelResolution:
        """Resolve model configuration for a workspace + agent type.

        Resolution order:
        1. Workspace-specific policy for this agent type.
        2. System default for this agent type.
        3. Global fallback.
        """
        if agent_type not in VALID_AGENT_TYPES:
            raise ValueError(f"Unknown agent type: {agent_type}")

        # Try workspace policy
        result = await db.execute(
            select(AgentModelPolicy).where(
                AgentModelPolicy.workspace_id == workspace_id,
                AgentModelPolicy.agent_type == agent_type,
            )
        )
        policy = result.scalar_one_or_none()

        if policy:
            return ModelResolution(
                agent_type=agent_type,
                provider=policy.provider,
                model_id=policy.model_id,
                temperature=policy.temperature,
                max_tokens=policy.max_tokens,
                fallback_model_id=policy.fallback_model_id,
                source="policy",
                policy_id=policy.id,
            )

        # Fall back to system defaults
        defaults = DEFAULT_MODEL_CONFIGS.get(agent_type)
        if defaults:
            return ModelResolution(
                agent_type=agent_type,
                provider=defaults["provider"],
                model_id=defaults["model_id"],
                temperature=defaults["temperature"],
                max_tokens=defaults["max_tokens"],
                fallback_model_id=defaults.get("fallback_model_id"),
                source="default",
            )

        # Global fallback (should not normally reach here)
        return ModelResolution(
            agent_type=agent_type,
            provider="openrouter",
            model_id="openai/gpt-4o-mini",
            temperature=0.5,
            max_tokens=4096,
            source="default",
        )

    async def resolve_with_fallback(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        agent_type: str,
        primary_failed: bool = False,
        failure_reason: str | None = None,
    ) -> ModelResolution:
        """Resolve model, falling back to secondary if primary failed.

        Call this with primary_failed=True when the primary model returned
        an error and you need the fallback.
        """
        resolution = await self.resolve(db, workspace_id, agent_type)

        if primary_failed and resolution.fallback_model_id:
            return ModelResolution(
                agent_type=agent_type,
                provider=resolution.provider,
                model_id=resolution.fallback_model_id,
                temperature=resolution.temperature,
                max_tokens=resolution.max_tokens,
                fallback_model_id=None,  # no further fallback
                source="fallback",
                policy_id=resolution.policy_id,
            )

        return resolution

    def create_telemetry(
        self,
        resolution: ModelResolution,
        workspace_id: uuid.UUID,
        fallback_used: bool = False,
        fallback_reason: str | None = None,
        latency_ms: float | None = None,
        token_count: int | None = None,
    ) -> TelemetryRecord:
        """Create a telemetry record from a model resolution."""
        return TelemetryRecord(
            agent_type=resolution.agent_type,
            workspace_id=workspace_id,
            resolved_model=resolution.model_id,
            resolved_provider=resolution.provider,
            source=resolution.source,
            fallback_used=fallback_used,
            fallback_reason=fallback_reason,
            latency_ms=latency_ms,
            token_count=token_count,
        )

    async def record_telemetry(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        telemetry: TelemetryRecord,
        message_id: uuid.UUID | None = None,
        run_id: uuid.UUID | None = None,
    ) -> None:
        """Persist telemetry as a ProspectingToolOutput record."""
        from app.models.prospecting import ProspectingToolOutput

        tool_output = ProspectingToolOutput(
            workspace_id=workspace_id,
            run_id=run_id,
            message_id=message_id,
            tool_name=f"model_router:{telemetry.agent_type}",
            input_data={
                "agent_type": telemetry.agent_type,
                "source": telemetry.source,
            },
            output_data=telemetry.to_dict(),
            duration_ms=int(telemetry.latency_ms) if telemetry.latency_ms else None,
            is_error=telemetry.fallback_used,
        )
        db.add(tool_output)
        await db.flush()


# ---------------------------------------------------------------------------
# Model Policy CRUD
# ---------------------------------------------------------------------------

class ModelPolicyCRUDService:
    """CRUD operations for workspace model policies."""

    async def get_policy(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        agent_type: str,
    ) -> AgentModelPolicy | None:
        """Get a workspace policy for a specific agent type."""
        if agent_type not in VALID_AGENT_TYPES:
            raise ValueError(f"Unknown agent type: {agent_type}. Valid: {VALID_AGENT_TYPES}")

        result = await db.execute(
            select(AgentModelPolicy).where(
                AgentModelPolicy.workspace_id == workspace_id,
                AgentModelPolicy.agent_type == agent_type,
            )
        )
        return result.scalar_one_or_none()

    async def list_policies(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> list[AgentModelPolicy]:
        """List all model policies for a workspace."""
        result = await db.execute(
            select(AgentModelPolicy)
            .where(AgentModelPolicy.workspace_id == workspace_id)
            .order_by(AgentModelPolicy.agent_type)
        )
        return list(result.scalars().all())

    async def upsert_policy(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        agent_type: str,
        data: dict[str, Any],
    ) -> AgentModelPolicy:
        """Create or update a model policy for a workspace + agent type.

        Uses upsert semantics: if a policy exists, update it; otherwise create.
        Only non-None fields in data are applied.
        """
        if agent_type not in VALID_AGENT_TYPES:
            raise ValueError(f"Unknown agent type: {agent_type}. Valid: {VALID_AGENT_TYPES}")

        # Fetch existing
        result = await db.execute(
            select(AgentModelPolicy).where(
                AgentModelPolicy.workspace_id == workspace_id,
                AgentModelPolicy.agent_type == agent_type,
            )
        )
        policy = result.scalar_one_or_none()

        if policy:
            # Update existing
            for key, value in data.items():
                if value is not None and hasattr(policy, key):
                    setattr(policy, key, value)
        else:
            # Create new — merge with defaults
            defaults = DEFAULT_MODEL_CONFIGS.get(agent_type, {})
            policy = AgentModelPolicy(
                workspace_id=workspace_id,
                agent_type=agent_type,
                provider=data.get("provider") or defaults.get("provider", "openrouter"),
                model_id=data.get("model_id") or defaults.get("model_id", "openai/gpt-4o-mini"),
                temperature=data.get("temperature") if data.get("temperature") is not None else defaults.get("temperature", 0.7),
                max_tokens=data.get("max_tokens") if data.get("max_tokens") is not None else defaults.get("max_tokens", 4096),
                fallback_model_id=data.get("fallback_model_id") or defaults.get("fallback_model_id"),
                is_default=data.get("is_default", False),
            )
            db.add(policy)

        await db.flush()
        return policy

    async def delete_policy(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        agent_type: str,
    ) -> bool:
        """Delete a policy (reverts to system defaults)."""
        policy = await self.get_policy(db, workspace_id, agent_type)
        if policy:
            await db.delete(policy)
            await db.flush()
            return True
        return False

    async def get_effective_config(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        agent_type: str,
    ) -> dict[str, Any]:
        """Get the effective config (policy or default) for an agent type."""
        policy = await self.get_policy(db, workspace_id, agent_type)
        if policy:
            return {
                "agent_type": agent_type,
                "provider": policy.provider,
                "model_id": policy.model_id,
                "temperature": policy.temperature,
                "max_tokens": policy.max_tokens,
                "fallback_model_id": policy.fallback_model_id,
                "source": "policy",
            }

        defaults = DEFAULT_MODEL_CONFIGS.get(agent_type, {})
        return {
            "agent_type": agent_type,
            "provider": defaults.get("provider", "openrouter"),
            "model_id": defaults.get("model_id", "openai/gpt-4o-mini"),
            "temperature": defaults.get("temperature", 0.7),
            "max_tokens": defaults.get("max_tokens", 4096),
            "fallback_model_id": defaults.get("fallback_model_id"),
            "source": "default",
        }


# Singletons
model_router_service = ModelRouterService()
model_policy_crud = ModelPolicyCRUDService()
