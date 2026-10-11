"""Warmup provider adapter protocol — defines the contract for external warmup services."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class WarmupProviderAdapter(Protocol):
    """Contract that all warmup provider adapters must satisfy."""

    async def enroll_account(
        self,
        email: str,
        smtp_host: str,
        smtp_port: int,
        smtp_username: str,
        smtp_password: str,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Enroll an email account with the warmup provider.

        Returns dict with at least: {"provider_account_id": str, "status": str}
        """
        ...

    async def pause_account(self, provider_account_id: str) -> None:
        """Pause warmup for an account."""
        ...

    async def resume_account(self, provider_account_id: str) -> None:
        """Resume warmup for a paused account."""
        ...

    async def remove_account(self, provider_account_id: str) -> None:
        """Remove an account from the warmup provider."""
        ...

    async def fetch_metrics(
        self, provider_account_id: str, since: datetime
    ) -> list[dict[str, Any]]:
        """Fetch daily metrics for an account since the given date.

        Returns list of dicts with keys: date, sent, delivered, opened, replied,
        bounced, spam_reported, inbox_placed, spam_placed.
        """
        ...

    async def fetch_status(self, provider_account_id: str) -> dict[str, Any]:
        """Fetch current status from the provider.

        Returns dict with at least: {"status": str, "metadata": dict}
        """
        ...
