"""Tests for top-level standalone workflow endpoints."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import TEST_WORKSPACE_ID


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WORKFLOW_ID = uuid.uuid4()
CAMPAIGN_ID = uuid.uuid4()


def _mock_workflow_def(name="Test Workflow", campaign_id=None, status="draft", version=1):
    wf = MagicMock()
    wf.id = WORKFLOW_ID
    wf.workspace_id = TEST_WORKSPACE_ID
    wf.campaign_id = campaign_id
    wf.name = name
    wf.description = "Test description"
    wf.schema_version = 1
    wf.workflow_version = version
    wf.status = status
    wf.canonical_json = _minimal_workflow_json()
    wf.published_at = None
    wf.created_at = datetime.now(timezone.utc)
    wf.updated_at = datetime.now(timezone.utc)
    wf.nodes = []
    wf.edges = []
    return wf


def _minimal_workflow_json() -> dict:
    return {
        "schema_version": 1,
        "workflow_version": 1,
        "meta": {"name": "Test Workflow", "description": "", "tags": []},
        "settings": {"timezone": "UTC", "max_node_executions_per_lead": 50},
        "nodes": [
            {"id": "n_trigger", "type": "trigger_manual", "name": "Start", "config": {}},
            {"id": "n_end", "type": "end", "name": "End", "config": {}},
        ],
        "connections": [
            {"from": "n_trigger", "to": "n_end", "condition": "always", "order": 1},
        ],
        "variables": {},
        "credentials_refs": {},
        "canvas_notes": [],
        "trigger_policies": {"dedupe_window_minutes": 10, "max_catch_up_runs": 3},
    }


# ---------------------------------------------------------------------------
# Tests — List workflows
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_workflows_empty(client):
    """GET /api/workflows returns empty list when no workflows."""
    with patch(
        "app.routers.workflows.workflow_service.list_workflows",
        new_callable=AsyncMock,
        return_value=[],
    ):
        resp = await client.get("/api/workflows")
        assert resp.status_code == 200
        assert resp.json() == []


@pytest.mark.asyncio
async def test_list_workflows_returns_items(client):
    """GET /api/workflows returns workflow list items."""
    wf = _mock_workflow_def()
    with patch(
        "app.routers.workflows.workflow_service.list_workflows",
        new_callable=AsyncMock,
        return_value=[wf],
    ):
        resp = await client.get("/api/workflows")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Test Workflow"
        assert data[0]["status"] == "draft"


# ---------------------------------------------------------------------------
# Tests — Create workflow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_workflow_standalone(client):
    """POST /api/workflows creates a standalone workflow."""
    wf = _mock_workflow_def()
    with patch(
        "app.routers.workflows.workflow_service.create_standalone_workflow",
        new_callable=AsyncMock,
        return_value=wf,
    ):
        resp = await client.post("/api/workflows", json={
            "name": "My Workflow",
            "description": "Test desc",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Workflow"
        assert data["campaign_id"] is None


@pytest.mark.asyncio
async def test_create_workflow_with_campaign(client):
    """POST /api/workflows with campaign_id links the workflow."""
    wf = _mock_workflow_def(campaign_id=CAMPAIGN_ID)
    with patch(
        "app.routers.workflows.workflow_service.create_standalone_workflow",
        new_callable=AsyncMock,
        return_value=wf,
    ):
        resp = await client.post("/api/workflows", json={
            "name": "Campaign Workflow",
            "campaign_id": str(CAMPAIGN_ID),
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["campaign_id"] == str(CAMPAIGN_ID)


@pytest.mark.asyncio
async def test_create_workflow_validation_error(client):
    """POST /api/workflows returns 422 on validation error."""
    with patch(
        "app.routers.workflows.workflow_service.create_standalone_workflow",
        new_callable=AsyncMock,
        side_effect=ValueError("Name is required"),
    ):
        resp = await client.post("/api/workflows", json={
            "name": "Bad WF",
        })
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tests — Get workflow by ID
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_workflow_by_id(client):
    """GET /api/workflows/{id} returns the workflow."""
    wf = _mock_workflow_def()
    with patch(
        "app.routers.workflows.workflow_service.get_by_id",
        new_callable=AsyncMock,
        return_value=wf,
    ):
        resp = await client.get(f"/api/workflows/{WORKFLOW_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(WORKFLOW_ID)
        assert data["name"] == "Test Workflow"


@pytest.mark.asyncio
async def test_get_workflow_by_id_not_found(client):
    """GET /api/workflows/{id} returns 404 when not found."""
    with patch(
        "app.routers.workflows.workflow_service.get_by_id",
        new_callable=AsyncMock,
        side_effect=ValueError("Not found"),
    ):
        resp = await client.get(f"/api/workflows/{uuid.uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests — Update workflow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_workflow(client):
    """PUT /api/workflows/{id} updates canonical JSON."""
    wf = _mock_workflow_def()
    with patch(
        "app.routers.workflows.workflow_service.update_by_id",
        new_callable=AsyncMock,
        return_value=wf,
    ):
        resp = await client.put(
            f"/api/workflows/{WORKFLOW_ID}",
            json=_minimal_workflow_json(),
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == str(WORKFLOW_ID)


# ---------------------------------------------------------------------------
# Tests — Delete workflow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_workflow(client):
    """DELETE /api/workflows/{id} deletes the workflow."""
    with patch(
        "app.routers.workflows.workflow_service.delete_workflow",
        new_callable=AsyncMock,
    ):
        resp = await client.delete(f"/api/workflows/{WORKFLOW_ID}")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_delete_workflow_not_found(client):
    """DELETE /api/workflows/{id} returns 404 when not found."""
    with patch(
        "app.routers.workflows.workflow_service.delete_workflow",
        new_callable=AsyncMock,
        side_effect=ValueError("Not found"),
    ):
        resp = await client.delete(f"/api/workflows/{uuid.uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests — Data sources
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_data_sources(client):
    """GET /api/workflows/data-sources returns campaigns and lead lists."""
    with patch(
        "app.routers.workflows.workflow_service.get_data_sources",
        new_callable=AsyncMock,
        return_value={
            "campaigns": [{"id": str(CAMPAIGN_ID), "name": "Campaign 1", "status": "active"}],
            "lead_lists": [{"id": str(uuid.uuid4()), "name": "Hot Leads"}],
        },
    ):
        resp = await client.get("/api/workflows/data-sources")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["campaigns"]) == 1
        assert len(data["lead_lists"]) == 1
        assert data["campaigns"][0]["name"] == "Campaign 1"


# ---------------------------------------------------------------------------
# Tests — Simulate standalone
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_simulate_standalone_workflow(client):
    """POST /api/workflows/{id}/simulate returns simulation result."""
    wf = _mock_workflow_def()
    with patch(
        "app.routers.workflows.workflow_service.get_by_id",
        new_callable=AsyncMock,
        return_value=wf,
    ), patch(
        "app.routers.workflows.simulate_workflow",
    ) as mock_sim:
        mock_result = MagicMock()
        mock_result.steps = []
        mock_result.reached_end = True
        mock_result.error = None
        mock_result.total_nodes_visited = 2
        mock_result.warnings = []
        mock_sim.return_value = mock_result

        resp = await client.post(
            f"/api/workflows/{WORKFLOW_ID}/simulate",
            json={"scenario": {}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reached_end"] is True
