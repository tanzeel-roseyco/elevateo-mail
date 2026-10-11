"""Tests for API-token authentication and external scope checks."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.lead import Lead
from app.routers.external import upsert_leads_bulk
from app.schemas.external import ExternalLeadUpsertRequest
from app.utils.security import AuthPrincipal


def _make_api_token(scopes):
    token = MagicMock()
    token.id = uuid.uuid4()
    token.workspace_id = uuid.uuid4()
    token.scopes = scopes
    token.is_active = True
    token.revoked_at = None
    token.expires_at = None
    token.last_used_at = None
    token.last_used_ip = None
    token.updated_at = datetime.now(timezone.utc)
    return token


class TestApiTokenAuth:
    async def test_valid_api_token_reaches_external_route(self, unauth_client):
        campaign_id = uuid.uuid4()
        token = _make_api_token(["campaigns:read"])
        response_payload = {
            "campaign_id": str(campaign_id),
            "ready": False,
            "blockers": ["No leads assigned"],
            "warnings": [],
            "lead_count": 0,
            "account_count": 0,
            "sendable_account_count": 0,
            "variant_count": 0,
        }
        with patch(
            "app.services.api_token_service.api_token_service.authenticate_token",
            new_callable=AsyncMock,
            return_value=token,
        ), patch(
            "app.routers.external._validate_launch",
            new_callable=AsyncMock,
            return_value=response_payload,
        ):
            resp = await unauth_client.post(
                f"/api/external/v1/campaigns/{campaign_id}/validate-launch",
                headers={"Authorization": "Bearer wwm_live_test_secret"},
            )

        assert resp.status_code == 200
        assert resp.json()["campaign_id"] == str(campaign_id)

    async def test_api_token_missing_scope_is_forbidden(self, unauth_client):
        campaign_id = uuid.uuid4()
        token = _make_api_token(["leads:read"])
        with patch(
            "app.services.api_token_service.api_token_service.authenticate_token",
            new_callable=AsyncMock,
            return_value=token,
        ):
            resp = await unauth_client.post(
                f"/api/external/v1/campaigns/{campaign_id}/validate-launch",
                headers={"Authorization": "Bearer wwm_live_test_secret"},
            )

        assert resp.status_code == 403

    async def test_bad_api_token_is_unauthorized(self, unauth_client):
        campaign_id = uuid.uuid4()
        with patch(
            "app.services.api_token_service.api_token_service.authenticate_token",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = await unauth_client.post(
                f"/api/external/v1/campaigns/{campaign_id}/validate-launch",
                headers={"Authorization": "Bearer wwm_live_bad_secret"},
            )

        assert resp.status_code == 401


class TestExternalLeadUpsertWorkflowEvents:
    async def test_existing_lead_update_does_not_emit_import_event(self):
        workspace_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        lead = Lead(workspace_id=workspace_id, email="old@example.com")
        lead.id = lead_id

        principal = AuthPrincipal(
            kind="api_token",
            workspace_id=workspace_id,
            scopes=("leads:write",),
            token_id=uuid.uuid4(),
        )
        req = ExternalLeadUpsertRequest(
            leads=[{"email": "OLD@example.com", "first_name": "Updated"}],
        )

        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        db = AsyncMock()
        db.execute = AsyncMock(return_value=lead_result)
        db.flush = AsyncMock()

        with patch("app.routers.external.workflow_event_bus") as mock_bus:
            mock_bus.on_leads_imported = AsyncMock()
            mock_bus.on_list_membership_added = AsyncMock()

            resp = await upsert_leads_bulk(req=req, db=db, principal=principal)

        assert resp.created == 0
        assert resp.updated == 1
        assert lead.first_name == "Updated"
        mock_bus.on_leads_imported.assert_not_awaited()
        mock_bus.on_list_membership_added.assert_not_awaited()

    async def test_new_list_membership_emits_membership_event(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        lead = Lead(workspace_id=workspace_id, email="member@example.com")
        lead.id = lead_id

        principal = AuthPrincipal(
            kind="api_token",
            workspace_id=workspace_id,
            scopes=("leads:write",),
            token_id=uuid.uuid4(),
        )
        req = ExternalLeadUpsertRequest(
            list_id=list_id,
            leads=[{"email": "member@example.com", "company": "Acme"}],
        )

        list_result = MagicMock()
        list_result.scalar_one_or_none.return_value = list_id
        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead
        membership_result = MagicMock()
        membership_result.scalar_one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[list_result, lead_result, membership_result])
        db.add = MagicMock()
        db.flush = AsyncMock()

        with patch("app.routers.external.workflow_event_bus") as mock_bus:
            mock_bus.on_leads_imported = AsyncMock()
            mock_bus.on_list_membership_added = AsyncMock()

            resp = await upsert_leads_bulk(req=req, db=db, principal=principal)

        assert resp.created == 0
        assert resp.updated == 1
        assert resp.added_to_list == 1
        mock_bus.on_leads_imported.assert_not_awaited()
        mock_bus.on_list_membership_added.assert_awaited_once_with(
            db=db,
            workspace_id=workspace_id,
            lead_ids=[lead_id],
            list_id=list_id,
        )
