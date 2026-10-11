"""Provider adapter contract tests — NoopAdapter satisfies Protocol, MailReachAdapter with mocked httpx."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
import json

import pytest

from app.services.warmup_providers.base import WarmupProviderAdapter
from app.services.warmup_providers.noop_adapter import NoopWarmupAdapter
from app.services.warmup_providers.mailreach_adapter import MailReachAdapter


# ---------------------------------------------------------------------------
# NoopAdapter
# ---------------------------------------------------------------------------

class TestNoopAdapter:

    def test_satisfies_protocol(self):
        adapter = NoopWarmupAdapter()
        assert isinstance(adapter, WarmupProviderAdapter)

    @pytest.mark.anyio
    async def test_enroll_returns_expected_shape(self):
        adapter = NoopWarmupAdapter()
        result = await adapter.enroll_account(
            email="test@example.com",
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="test",
            smtp_password="password",
        )
        assert "provider_account_id" in result
        assert "status" in result
        assert result["status"] == "active"
        assert result["provider_account_id"].startswith("noop-")

    @pytest.mark.anyio
    async def test_pause_no_error(self):
        adapter = NoopWarmupAdapter()
        await adapter.pause_account("noop-123")  # should not raise

    @pytest.mark.anyio
    async def test_resume_no_error(self):
        adapter = NoopWarmupAdapter()
        await adapter.resume_account("noop-123")

    @pytest.mark.anyio
    async def test_remove_no_error(self):
        adapter = NoopWarmupAdapter()
        await adapter.remove_account("noop-123")

    @pytest.mark.anyio
    async def test_fetch_metrics_returns_list(self):
        adapter = NoopWarmupAdapter()
        since = datetime(2026, 2, 1, tzinfo=timezone.utc)
        metrics = await adapter.fetch_metrics("noop-123", since)
        assert isinstance(metrics, list)
        assert len(metrics) > 0
        m = metrics[0]
        assert "date" in m
        assert "sent" in m
        assert "delivered" in m
        assert "bounced" in m

    @pytest.mark.anyio
    async def test_fetch_status_returns_dict(self):
        adapter = NoopWarmupAdapter()
        status = await adapter.fetch_status("noop-123")
        assert "status" in status
        assert "metadata" in status
        assert status["status"] == "active"


# ---------------------------------------------------------------------------
# MailReachAdapter (with mocked httpx)
# ---------------------------------------------------------------------------

class TestMailReachAdapter:

    def _mock_response(self, status_code=200, json_data=None):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.json.return_value = json_data or {}
        mock_resp.raise_for_status = MagicMock()
        if status_code >= 400:
            from httpx import HTTPStatusError, Request, Response
            mock_resp.raise_for_status.side_effect = HTTPStatusError(
                "error", request=MagicMock(), response=mock_resp,
            )
        return mock_resp

    @pytest.mark.anyio
    async def test_enroll_calls_correct_endpoint(self):
        adapter = MailReachAdapter(api_key="test-key")

        mock_resp = self._mock_response(json_data={
            "id": "mr-12345",
            "status": "active",
        })

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            result = await adapter.enroll_account(
                email="test@example.com",
                smtp_host="smtp.example.com",
                smtp_port=587,
                smtp_username="test",
                smtp_password="password",
            )

        assert result["provider_account_id"] == "mr-12345"
        assert result["status"] == "active"
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert "/email_accounts" in call_args[0][0]

    @pytest.mark.anyio
    async def test_pause_calls_patch(self):
        adapter = MailReachAdapter(api_key="test-key")

        mock_resp = self._mock_response()

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.patch = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            await adapter.pause_account("mr-12345")

        mock_client.patch.assert_called_once()
        call_args = mock_client.patch.call_args
        assert "mr-12345" in call_args[0][0]

    @pytest.mark.anyio
    async def test_fetch_metrics_maps_response(self):
        adapter = MailReachAdapter(api_key="test-key")

        mock_resp = self._mock_response(json_data=[
            {
                "date": "2026-02-06",
                "sent": 10,
                "delivered": 9,
                "opened": 5,
                "replied": 1,
                "bounced": 0,
                "spam_reported": 0,
                "inbox_placed": 9,
                "spam_placed": 0,
            }
        ])

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            since = datetime(2026, 2, 1, tzinfo=timezone.utc)
            metrics = await adapter.fetch_metrics("mr-12345", since)

        assert len(metrics) == 1
        assert metrics[0]["sent"] == 10
        assert metrics[0]["inbox_placed"] == 9

    @pytest.mark.anyio
    async def test_fetch_status_maps_response(self):
        adapter = MailReachAdapter(api_key="test-key")

        mock_resp = self._mock_response(json_data={
            "status": "active",
            "score": 95,
        })

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            status = await adapter.fetch_status("mr-12345")

        assert status["status"] == "active"
        assert "metadata" in status

    @pytest.mark.anyio
    async def test_enroll_error_propagates(self):
        adapter = MailReachAdapter(api_key="test-key")

        mock_resp = self._mock_response(status_code=422)

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            with pytest.raises(Exception):
                await adapter.enroll_account(
                    email="test@example.com",
                    smtp_host="smtp.example.com",
                    smtp_port=587,
                    smtp_username="test",
                    smtp_password="password",
                )
