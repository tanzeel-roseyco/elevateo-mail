"""No-op warmup provider adapter — returns deterministic mock data for dev/test."""

from __future__ import annotations

import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Any


class NoopWarmupAdapter:
    """Adapter that does nothing but return plausible data. Used when WARMUP_PROVIDER=none."""

    async def enroll_account(
        self,
        email: str,
        smtp_host: str,
        smtp_port: int,
        smtp_username: str,
        smtp_password: str,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "provider_account_id": f"noop-{uuid.uuid4().hex[:12]}",
            "status": "active",
        }

    async def pause_account(self, provider_account_id: str) -> None:
        pass

    async def resume_account(self, provider_account_id: str) -> None:
        pass

    async def remove_account(self, provider_account_id: str) -> None:
        pass

    async def fetch_metrics(
        self, provider_account_id: str, since: datetime
    ) -> list[dict[str, Any]]:
        """Return 7 days of mock metrics."""
        metrics = []
        today = date.today()
        start = since.date() if isinstance(since, datetime) else since
        day = start
        while day <= today:
            metrics.append({
                "date": day.isoformat(),
                "sent": 10,
                "delivered": 9,
                "opened": 5,
                "replied": 1,
                "bounced": 0,
                "spam_reported": 0,
                "inbox_placed": 9,
                "spam_placed": 0,
            })
            day += timedelta(days=1)
        return metrics

    async def fetch_status(self, provider_account_id: str) -> dict[str, Any]:
        return {
            "status": "active",
            "metadata": {"provider": "noop"},
        }
