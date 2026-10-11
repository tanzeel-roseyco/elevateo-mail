"""Unipile HTTP client wrapper.

Handles authentication, rate-limiting headers, and error normalization
for all Unipile API calls.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_TIMEOUT = 30.0


class UnipileError(Exception):
    """Base exception for Unipile API errors."""

    def __init__(self, status_code: int, message: str, body: Any = None):
        self.status_code = status_code
        self.message = message
        self.body = body
        super().__init__(f"Unipile {status_code}: {message}")


class UnipileClient:
    """Thin async HTTP client for the Unipile REST API."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        settings = get_settings()
        self._api_key = api_key or settings.UNIPILE_API_KEY
        self._base_url = (base_url or settings.UNIPILE_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "X-API-KEY": self._api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def get(self, path: str, params: dict | None = None) -> Any:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{self._base_url}{path}",
                headers=self._headers(),
                params=params,
            )
            return self._handle_response(resp)

    async def post(self, path: str, json: dict | None = None) -> Any:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{self._base_url}{path}",
                headers=self._headers(),
                json=json,
            )
            return self._handle_response(resp)

    async def delete(self, path: str) -> Any:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.delete(
                f"{self._base_url}{path}",
                headers=self._headers(),
            )
            return self._handle_response(resp)

    def _handle_response(self, resp: httpx.Response) -> Any:
        if resp.status_code >= 400:
            body = None
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            raise UnipileError(resp.status_code, resp.reason_phrase or "Error", body)
        if resp.status_code == 204:
            return None
        return resp.json()
