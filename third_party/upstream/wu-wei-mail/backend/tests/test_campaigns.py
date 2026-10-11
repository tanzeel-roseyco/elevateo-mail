"""Tests for campaign routes — CRUD, start/pause/resume."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


def _make_campaign(**overrides):
    """Create a mock Campaign with sensible defaults."""
    c = MagicMock()
    c.id = overrides.get("id", uuid.uuid4())
    c.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    c.name = overrides.get("name", "Test Campaign")
    c.status = overrides.get("status", "draft")
    c.description = overrides.get("description", None)
    c.timezone = overrides.get("timezone", "UTC")
    c.send_days = overrides.get("send_days", {"mon": True, "tue": True, "wed": True, "thu": True, "fri": True, "sat": False, "sun": False})
    c.send_start_hour = overrides.get("send_start_hour", 9)
    c.send_end_hour = overrides.get("send_end_hour", 17)
    c.daily_limit = overrides.get("daily_limit", 100)
    c.stop_on_reply = overrides.get("stop_on_reply", True)
    c.track_opens = overrides.get("track_opens", True)
    c.track_clicks = overrides.get("track_clicks", True)
    c.sequences = overrides.get("sequences", [])
    c.campaign_leads = overrides.get("campaign_leads", [])
    c.campaign_accounts = overrides.get("campaign_accounts", [])
    c.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    c.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return c


# ---------------------------------------------------------------------------
# GET /api/campaigns
# ---------------------------------------------------------------------------

class TestListCampaigns:

    async def test_list_empty(self, client):
        with patch(
            "app.routers.campaigns.campaign_service.list_campaigns",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = await client.get("/api/campaigns/")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_with_data(self, client):
        campaigns = [_make_campaign(name="Alpha"), _make_campaign(name="Beta")]
        with patch(
            "app.routers.campaigns.campaign_service.list_campaigns",
            new_callable=AsyncMock,
            return_value=campaigns,
        ):
            resp = await client.get("/api/campaigns/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "Alpha"
        assert data[1]["name"] == "Beta"


# ---------------------------------------------------------------------------
# POST /api/campaigns
# ---------------------------------------------------------------------------

class TestCreateCampaign:

    async def test_create_success(self, client):
        cid = uuid.uuid4()
        created = _make_campaign(id=cid, name="New Campaign")

        with patch(
            "app.routers.campaigns.campaign_service.create_campaign",
            new_callable=AsyncMock,
            return_value=created,
        ), patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            return_value=created,
        ):
            resp = await client.post("/api/campaigns/", json={
                "name": "New Campaign",
                "daily_limit": 50,
            })

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Campaign"
        assert data["status"] == "draft"

    async def test_create_missing_name(self, client):
        resp = await client.post("/api/campaigns/", json={})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/campaigns/{id}
# ---------------------------------------------------------------------------

class TestGetCampaign:

    async def test_get_found(self, client):
        cid = uuid.uuid4()
        campaign = _make_campaign(id=cid, name="Found Me")

        with patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            return_value=campaign,
        ):
            resp = await client.get(f"/api/campaigns/{cid}")

        assert resp.status_code == 200
        assert resp.json()["name"] == "Found Me"

    async def test_get_not_found(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            side_effect=ValueError("Campaign not found"),
        ):
            resp = await client.get(f"/api/campaigns/{cid}")

        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# PATCH /api/campaigns/{id}
# ---------------------------------------------------------------------------

class TestUpdateCampaign:

    async def test_update_success(self, client):
        cid = uuid.uuid4()
        updated = _make_campaign(id=cid, name="Updated Name", daily_limit=200)

        with patch(
            "app.routers.campaigns.campaign_service.update_campaign",
            new_callable=AsyncMock,
            return_value=updated,
        ), patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            return_value=updated,
        ):
            resp = await client.patch(f"/api/campaigns/{cid}", json={"name": "Updated Name"})

        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    async def test_update_not_found(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.update_campaign",
            new_callable=AsyncMock,
            side_effect=ValueError("Campaign not found"),
        ):
            resp = await client.patch(f"/api/campaigns/{cid}", json={"name": "X"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/campaigns/{id}
# ---------------------------------------------------------------------------

class TestDeleteCampaign:

    async def test_delete_success(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.delete_campaign",
            new_callable=AsyncMock,
        ):
            resp = await client.delete(f"/api/campaigns/{cid}")
        assert resp.status_code == 204

    async def test_delete_not_found(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.delete_campaign",
            new_callable=AsyncMock,
            side_effect=ValueError("Campaign not found"),
        ):
            resp = await client.delete(f"/api/campaigns/{cid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/campaigns/{id}/start | pause | resume
# ---------------------------------------------------------------------------

class TestCampaignActions:

    async def test_start_campaign(self, client):
        cid = uuid.uuid4()
        started = _make_campaign(id=cid, status="active")

        with patch(
            "app.routers.campaigns.campaign_service.start_campaign",
            new_callable=AsyncMock,
        ), patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            return_value=started,
        ):
            resp = await client.post(f"/api/campaigns/{cid}/start")

        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    async def test_start_already_active(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.start_campaign",
            new_callable=AsyncMock,
            side_effect=ValueError("Cannot start campaign in 'active' status"),
        ):
            resp = await client.post(f"/api/campaigns/{cid}/start")
        assert resp.status_code == 400

    async def test_pause_campaign(self, client):
        cid = uuid.uuid4()
        paused = _make_campaign(id=cid, status="paused")

        with patch(
            "app.routers.campaigns.campaign_service.pause_campaign",
            new_callable=AsyncMock,
        ), patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            return_value=paused,
        ):
            resp = await client.post(f"/api/campaigns/{cid}/pause")

        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"

    async def test_pause_not_active(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.pause_campaign",
            new_callable=AsyncMock,
            side_effect=ValueError("Campaign is not active"),
        ):
            resp = await client.post(f"/api/campaigns/{cid}/pause")
        assert resp.status_code == 400

    async def test_resume_campaign(self, client):
        cid = uuid.uuid4()
        resumed = _make_campaign(id=cid, status="active")

        with patch(
            "app.routers.campaigns.campaign_service.resume_campaign",
            new_callable=AsyncMock,
        ), patch(
            "app.routers.campaigns.campaign_service.get_campaign",
            new_callable=AsyncMock,
            return_value=resumed,
        ):
            resp = await client.post(f"/api/campaigns/{cid}/resume")

        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    async def test_resume_not_paused(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.resume_campaign",
            new_callable=AsyncMock,
            side_effect=ValueError("Campaign is not paused"),
        ):
            resp = await client.post(f"/api/campaigns/{cid}/resume")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/campaigns/{id}/leads and /accounts
# ---------------------------------------------------------------------------

class TestCampaignAssignment:

    async def test_add_leads(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.add_leads",
            new_callable=AsyncMock,
            return_value=3,
        ):
            resp = await client.post(f"/api/campaigns/{cid}/leads", json={
                "lead_ids": [str(uuid.uuid4()) for _ in range(3)],
            })
        assert resp.status_code == 200
        assert resp.json()["added"] == 3

    async def test_add_accounts(self, client):
        cid = uuid.uuid4()
        with patch(
            "app.routers.campaigns.campaign_service.add_accounts",
            new_callable=AsyncMock,
            return_value=2,
        ):
            resp = await client.post(f"/api/campaigns/{cid}/accounts", json={
                "account_ids": [str(uuid.uuid4()) for _ in range(2)],
                "weights": [60, 40],
            })
        assert resp.status_code == 200
        assert resp.json()["added"] == 2
