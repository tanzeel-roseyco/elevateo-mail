"""MailReach warmup provider adapter — calls the MailReach REST API."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class MailReachAdapter:
    """Adapter for the MailReach warmup API.

    API key is passed at call time (decrypted from WorkspaceIntegrationSecret).
    """

    def __init__(self, api_key: str):
        self._api_key = api_key
        settings = get_settings()
        self._base_url = settings.WARMUP_PROVIDER_BASE_URL.rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def enroll_account(
        self,
        email: str,
        smtp_host: str,
        smtp_port: int,
        smtp_username: str,
        smtp_password: str,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "email_account": {
                "email": email,
                "smtp_host": smtp_host,
                "smtp_port": smtp_port,
                "smtp_username": smtp_username,
                "smtp_password": smtp_password,
            },
        }
        if config:
            payload["settings"] = config

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self._base_url}/email_accounts",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()

        provider_id = str(data.get("id", data.get("email_account_id", "")))
        return {
            "provider_account_id": provider_id,
            "status": data.get("status", "active"),
            "metadata": data,
        }

    async def pause_account(self, provider_account_id: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.patch(
                f"{self._base_url}/email_accounts/{provider_account_id}",
                json={"status": "paused"},
                headers=self._headers(),
            )
            resp.raise_for_status()

    async def resume_account(self, provider_account_id: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.patch(
                f"{self._base_url}/email_accounts/{provider_account_id}",
                json={"status": "active"},
                headers=self._headers(),
            )
            resp.raise_for_status()

    async def remove_account(self, provider_account_id: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(
                f"{self._base_url}/email_accounts/{provider_account_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()

    async def fetch_metrics(
        self, provider_account_id: str, since: datetime
    ) -> list[dict[str, Any]]:
        params = {"since": since.isoformat()}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self._base_url}/email_accounts/{provider_account_id}/metrics",
                params=params,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()

        metrics = []
        for entry in data if isinstance(data, list) else data.get("metrics", []):
            metrics.append({
                "date": entry.get("date", ""),
                "sent": entry.get("sent", 0),
                "delivered": entry.get("delivered", 0),
                "opened": entry.get("opened", 0),
                "replied": entry.get("replied", 0),
                "bounced": entry.get("bounced", 0),
                "spam_reported": entry.get("spam_reported", 0),
                "inbox_placed": entry.get("inbox_placed", 0),
                "spam_placed": entry.get("spam_placed", 0),
            })
        return metrics

    async def fetch_status(self, provider_account_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self._base_url}/email_accounts/{provider_account_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()

        return {
            "status": data.get("status", "unknown"),
            "metadata": data,
        }
