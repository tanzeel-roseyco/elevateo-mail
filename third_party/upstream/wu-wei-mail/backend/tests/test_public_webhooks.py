"""Tests for public workflow webhook security and dispatch behavior."""

import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import TEST_WORKSPACE_ID


def _result_with_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _signature(body: str) -> str:
    return hmac.new(
        "test-webhook-signing-secret".encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()


class TestPublicInboundWebhook:
    async def test_missing_signature_rejected(self, client):
        workflow_id = uuid.uuid4()
        body = json.dumps({"email": "lead@example.com"})
        response = await client.post(
            f"/api/webhooks/inbound/{workflow_id}",
            content=body,
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 401
        assert "signature" in response.json()["detail"].lower()

    async def test_invalid_signature_rejected(self, client):
        workflow_id = uuid.uuid4()
        body = json.dumps({"email": "lead@example.com"})
        response = await client.post(
            f"/api/webhooks/inbound/{workflow_id}",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Webhook-Signature": "invalid",
            },
        )

        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()

    async def test_valid_signature_dispatches_workflow(self, client, mock_db):
        workflow_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workflow = MagicMock()
        workflow.id = workflow_id
        workflow.workspace_id = TEST_WORKSPACE_ID
        workflow.campaign_id = campaign_id
        workflow.status = "published"
        workflow.canonical_json = {
            "nodes": [
                {"id": "trigger-1", "type": "trigger_inbound_webhook"},
            ]
        }
        mock_db.execute = AsyncMock(
            side_effect=[
                _result_with_scalar(workflow),  # workflow lookup
                _result_with_scalar(None),  # lead lookup (not found -> create)
            ]
        )

        body = json.dumps(
            {"email": "lead@example.com", "first_name": "Ada", "source": "website"}
        )
        with patch(
            "app.routers.webhooks.workflow_runtime.dispatch_event_trigger",
            new_callable=AsyncMock,
            return_value=MagicMock(),
        ) as dispatch:
            response = await client.post(
                f"/api/webhooks/inbound/{workflow_id}",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Signature": _signature(body),
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["enrolled"] is True
        dispatch.assert_awaited_once()
