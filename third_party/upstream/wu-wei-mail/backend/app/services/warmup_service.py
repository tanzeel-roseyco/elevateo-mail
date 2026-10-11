"""Warmup service — core lifecycle logic for enrollment, pause, resume, and status."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.email_account import EmailAccount
from app.models.warmup import (
    WarmupProgram, WarmupAccountState, WarmupProviderLink, WarmupAction,
    WarmupDailyMetric, WarmupPhase,
)
from app.models.prospecting import WorkspaceIntegrationSecret
from app.services.warmup_providers.base import WarmupProviderAdapter
from app.services.warmup_providers.mailreach_adapter import MailReachAdapter
from app.services.warmup_providers.noop_adapter import NoopWarmupAdapter
from app.services.warmup_policy_engine import check_safety_guardrails
from app.services import warmup_health_scorer
from app.utils.encryption import decrypt

logger = logging.getLogger(__name__)


class WarmupService:
    """Core warmup lifecycle service."""

    # --- Program CRUD ---

    async def get_or_create_program(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        create_data: dict[str, Any] | None = None,
    ) -> WarmupProgram:
        """Get existing program or create with defaults."""
        result = await db.execute(
            select(WarmupProgram).where(WarmupProgram.workspace_id == workspace_id)
        )
        program = result.scalar_one_or_none()
        if program:
            if create_data:
                for key, value in create_data.items():
                    if hasattr(program, key):
                        setattr(program, key, value)
            return program

        program = WarmupProgram(
            workspace_id=workspace_id,
            **(create_data or {}),
        )
        db.add(program)
        await db.flush()
        return program

    async def get_program(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
    ) -> WarmupProgram | None:
        result = await db.execute(
            select(WarmupProgram).where(WarmupProgram.workspace_id == workspace_id)
        )
        return result.scalar_one_or_none()

    # --- Enrollment ---

    async def enroll_account(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        account_id: uuid.UUID,
        target_volume: int = 50,
    ) -> WarmupAccountState:
        """Enroll an account in warmup."""
        # Validate account ownership
        account = await self._get_account(db, workspace_id, account_id)
        if not account:
            raise ValueError("Account not found in workspace")

        # Get or create program
        program = await self.get_or_create_program(db, workspace_id)

        # DNS check if required
        if program.dns_required:
            if not account.spf_verified or not account.dmarc_verified:
                raise ValueError(
                    "DNS verification required: SPF and DMARC must pass before warmup enrollment"
                )

        # Check not already enrolled
        existing = await db.execute(
            select(WarmupAccountState).where(
                WarmupAccountState.workspace_id == workspace_id,
                WarmupAccountState.account_id == account_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Account is already enrolled in warmup")

        now = datetime.now(timezone.utc)

        # Create state
        state = WarmupAccountState(
            workspace_id=workspace_id,
            account_id=account_id,
            program_id=program.id,
            phase=WarmupPhase.ENROLLING,
            target_volume=target_volume,
            current_allowed_volume=5,
            enrolled_at=now,
            phase_started_at=now,
        )
        db.add(state)
        await db.flush()

        # Call provider adapter
        adapter = await self._get_provider_adapter(db, workspace_id)
        try:
            provider_result = await adapter.enroll_account(
                email=account.email,
                smtp_host=account.smtp_host or "",
                smtp_port=account.smtp_port,
                smtp_username=account.smtp_username or account.email,
                smtp_password=decrypt(account.smtp_password) if account.smtp_password else "",
            )

            # Create provider link
            link = WarmupProviderLink(
                workspace_id=workspace_id,
                account_state_id=state.id,
                provider_name=get_settings().WARMUP_PROVIDER,
                provider_account_id=provider_result["provider_account_id"],
                provider_status=provider_result.get("status", "active"),
                sync_status="synced",
                last_synced_at=now,
                provider_metadata=provider_result.get("metadata"),
            )
            db.add(link)
        except Exception as e:
            logger.warning("Provider enrollment failed (continuing with local tracking): %s", e)

        # Advance to ramping
        state.phase = WarmupPhase.RAMPING
        state.phase_started_at = now

        # Update EmailAccount cache fields
        account.warmup_enabled = True
        account.warmup_level = 5

        # Log action
        action = WarmupAction(
            workspace_id=workspace_id,
            account_state_id=state.id,
            action_type="enroll",
            source="user",
            detail={"target_volume": target_volume},
        )
        db.add(action)
        await db.flush()

        return state

    # --- Pause / Resume ---

    async def pause_account(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        account_id: uuid.UUID,
        reason: str | None = None,
        source: str = "user",
    ) -> WarmupAccountState:
        """Pause warmup for an account."""
        state = await self._get_state(db, workspace_id, account_id)
        if not state:
            raise ValueError("Account is not enrolled in warmup")

        if state.phase in (WarmupPhase.PAUSED, WarmupPhase.GRADUATED):
            raise ValueError(f"Cannot pause: account is in phase '{state.phase}'")

        now = datetime.now(timezone.utc)

        # Call provider
        adapter = await self._get_provider_adapter(db, workspace_id)
        link = await self._get_provider_link(db, state.id)
        if link:
            try:
                await adapter.pause_account(link.provider_account_id)
            except Exception as e:
                logger.warning("Provider pause failed: %s", e)

        state.phase = WarmupPhase.PAUSED
        state.phase_started_at = now
        state.paused_at = now
        state.pause_reason = reason

        # Update EmailAccount cache
        account = await self._get_account(db, workspace_id, account_id)
        if account:
            account.warmup_enabled = False

        action = WarmupAction(
            workspace_id=workspace_id,
            account_state_id=state.id,
            action_type="pause",
            source=source,
            detail={"reason": reason},
        )
        db.add(action)
        await db.flush()

        return state

    async def resume_account(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> WarmupAccountState:
        """Resume warmup for a paused account."""
        state = await self._get_state(db, workspace_id, account_id)
        if not state:
            raise ValueError("Account is not enrolled in warmup")

        if state.phase != WarmupPhase.PAUSED:
            raise ValueError(f"Cannot resume: account is in phase '{state.phase}', not 'paused'")

        now = datetime.now(timezone.utc)

        # Call provider
        adapter = await self._get_provider_adapter(db, workspace_id)
        link = await self._get_provider_link(db, state.id)
        if link:
            try:
                await adapter.resume_account(link.provider_account_id)
            except Exception as e:
                logger.warning("Provider resume failed: %s", e)

        state.phase = WarmupPhase.RAMPING
        state.phase_started_at = now
        state.paused_at = None
        state.pause_reason = None

        # Update EmailAccount cache
        account = await self._get_account(db, workspace_id, account_id)
        if account:
            account.warmup_enabled = True
            account.warmup_level = state.current_allowed_volume

        action = WarmupAction(
            workspace_id=workspace_id,
            account_state_id=state.id,
            action_type="resume",
            source="user",
        )
        db.add(action)
        await db.flush()

        return state

    # --- Status ---

    async def get_account_status(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Assemble full status dict for an account's warmup state."""
        state = await self._get_state(db, workspace_id, account_id)
        if not state:
            raise ValueError("Account is not enrolled in warmup")

        # Get provider link
        link = await self._get_provider_link(db, state.id)

        # Get recent metrics (last 14 days)
        metrics_result = await db.execute(
            select(WarmupDailyMetric)
            .where(WarmupDailyMetric.account_state_id == state.id)
            .order_by(WarmupDailyMetric.date.desc())
            .limit(14)
        )
        metrics = list(metrics_result.scalars().all())
        metrics.reverse()  # chronological order

        # Compute risk flags
        program = await self.get_program(db, workspace_id)
        metrics_dicts = [
            {
                "sent": m.sent, "delivered": m.delivered, "opened": m.opened,
                "replied": m.replied, "bounced": m.bounced, "spam_reported": m.spam_reported,
                "inbox_placed": m.inbox_placed, "spam_placed": m.spam_placed,
            }
            for m in metrics
        ]
        risk_flags = []
        if program:
            risk_flags = check_safety_guardrails(state, program, metrics_dicts)

        return {
            "account_id": state.account_id,
            "workspace_id": state.workspace_id,
            "phase": state.phase,
            "target_volume": state.target_volume,
            "current_allowed_volume": state.current_allowed_volume,
            "actual_sent_today": state.actual_sent_today,
            "warmup_health_score": state.warmup_health_score,
            "inbox_placement_rate": state.inbox_placement_rate,
            "enrolled_at": state.enrolled_at,
            "graduated_at": state.graduated_at,
            "paused_at": state.paused_at,
            "pause_reason": state.pause_reason,
            "provider_name": link.provider_name if link else None,
            "provider_status": link.provider_status if link else None,
            "last_synced_at": link.last_synced_at if link else None,
            "risk_flags": risk_flags,
            "recent_metrics": [
                {
                    "date": m.date,
                    "sent": m.sent, "delivered": m.delivered, "opened": m.opened,
                    "replied": m.replied, "bounced": m.bounced, "spam_reported": m.spam_reported,
                    "inbox_placed": m.inbox_placed, "spam_placed": m.spam_placed,
                }
                for m in metrics
            ],
        }

    # --- Timeline ---

    async def get_account_timeline(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        account_id: uuid.UUID,
        limit: int = 50,
    ) -> list[WarmupAction]:
        """Get action log for an account's warmup, newest first."""
        state = await self._get_state(db, workspace_id, account_id)
        if not state:
            raise ValueError("Account is not enrolled in warmup")

        result = await db.execute(
            select(WarmupAction)
            .where(WarmupAction.account_state_id == state.id)
            .order_by(WarmupAction.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # --- Private helpers ---

    async def _get_account(
        self, db: AsyncSession, workspace_id: uuid.UUID, account_id: uuid.UUID
    ) -> EmailAccount | None:
        result = await db.execute(
            select(EmailAccount).where(
                EmailAccount.id == account_id,
                EmailAccount.workspace_id == workspace_id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_state(
        self, db: AsyncSession, workspace_id: uuid.UUID, account_id: uuid.UUID
    ) -> WarmupAccountState | None:
        result = await db.execute(
            select(WarmupAccountState).where(
                WarmupAccountState.workspace_id == workspace_id,
                WarmupAccountState.account_id == account_id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_provider_link(
        self, db: AsyncSession, account_state_id: uuid.UUID
    ) -> WarmupProviderLink | None:
        result = await db.execute(
            select(WarmupProviderLink).where(
                WarmupProviderLink.account_state_id == account_state_id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_provider_adapter(
        self, db: AsyncSession, workspace_id: uuid.UUID
    ) -> WarmupProviderAdapter:
        """Factory: returns the appropriate adapter based on config.

        Resolution order for mailreach:
        1. WorkspaceIntegrationSecret (workspace-scoped, encrypted)
        2. settings.MAILREACH_API_KEY (global env-var fallback)
        3. NoopWarmupAdapter if no key found
        """
        settings = get_settings()
        if settings.WARMUP_PROVIDER == "none":
            return NoopWarmupAdapter()

        if settings.WARMUP_PROVIDER == "mailreach":
            api_key: str | None = None

            # Try workspace-scoped secret first
            result = await db.execute(
                select(WorkspaceIntegrationSecret).where(
                    WorkspaceIntegrationSecret.workspace_id == workspace_id,
                    WorkspaceIntegrationSecret.integration_type == "mailreach",
                    WorkspaceIntegrationSecret.key_name == "api_key",
                    WorkspaceIntegrationSecret.is_active == True,  # noqa: E712
                )
            )
            secret = result.scalar_one_or_none()
            if secret:
                api_key = decrypt(secret.encrypted_value)

            # Fall back to global env-var
            if not api_key and settings.MAILREACH_API_KEY:
                api_key = settings.MAILREACH_API_KEY

            if api_key:
                return MailReachAdapter(api_key=api_key)

            logger.warning(
                "WARMUP_PROVIDER=mailreach but no API key found for workspace %s — using noop",
                workspace_id,
            )
            return NoopWarmupAdapter()

        return NoopWarmupAdapter()


warmup_service = WarmupService()
