"""Tests for workflow API endpoints — CRUD, validate, import/export, publish."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import TEST_WORKSPACE_ID


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _minimal_workflow_json() -> dict:
    return {
        "schema_version": 1,
        "workflow_version": 1,
        "meta": {"name": "Test", "description": ""},
        "settings": {"timezone": "UTC", "max_node_executions_per_lead": 50},
        "nodes": [
            {"id": "n_trigger", "type": "trigger_manual", "name": "Start", "config": {}},
            {"id": "n_email", "type": "email_send", "name": "Send", "config": {}},
            {"id": "n_end", "type": "end", "name": "End", "config": {}},
        ],
        "connections": [
            {"from": "n_trigger", "to": "n_email", "condition": "always", "order": 1},
            {"from": "n_email", "to": "n_end", "condition": "always", "order": 1},
        ],
        "variables": {},
        "credentials_refs": {},
        "canvas_notes": [],
        "trigger_policies": {"dedupe_window_minutes": 10, "max_catch_up_runs": 3},
    }


CAMPAIGN_ID = uuid.uuid4()
WORKFLOW_ID = uuid.uuid4()


def _mock_workflow_def(status="draft", version=1):
    wf = MagicMock()
    wf.id = WORKFLOW_ID
    wf.campaign_id = CAMPAIGN_ID
    wf.workspace_id = TEST_WORKSPACE_ID
    wf.configure_mock(name="Test Workflow")
    wf.description = "Test description"
    wf.schema_version = 1
    wf.workflow_version = version
    wf.status = status
    wf.canonical_json = _minimal_workflow_json()
    wf.published_at = None
    wf.created_at = datetime.now(timezone.utc)
    wf.updated_at = datetime.now(timezone.utc)
    return wf


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGetWorkflow:
    @pytest.mark.asyncio
    async def test_get_workflow_success(self, client):
        wf = _mock_workflow_def()
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_workflow = AsyncMock(return_value=wf)
            resp = await client.get(f"/api/campaigns/{CAMPAIGN_ID}/workflow")
        assert resp.status_code == 200
        data = resp.json()
        assert data["schema_version"] == 1
        assert data["status"] == "draft"

    @pytest.mark.asyncio
    async def test_get_workflow_not_found(self, client):
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_workflow = AsyncMock(side_effect=ValueError("Not found"))
            resp = await client.get(f"/api/campaigns/{CAMPAIGN_ID}/workflow")
        assert resp.status_code == 404


class TestSaveWorkflow:
    @pytest.mark.asyncio
    async def test_save_success(self, client):
        wf = _mock_workflow_def()
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.save_workflow = AsyncMock(return_value=wf)
            resp = await client.put(
                f"/api/campaigns/{CAMPAIGN_ID}/workflow",
                json=_minimal_workflow_json(),
            )
        assert resp.status_code == 200
        assert resp.json()["workflow_version"] == 1

    @pytest.mark.asyncio
    async def test_save_invalid_json(self, client):
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.save_workflow = AsyncMock(side_effect=ValueError("Validation failed"))
            resp = await client.put(
                f"/api/campaigns/{CAMPAIGN_ID}/workflow",
                json={"bad": "data"},
            )
        assert resp.status_code == 422


class TestValidateWorkflow:
    @pytest.mark.asyncio
    async def test_validate_valid(self, client):
        from app.schemas.workflow import WorkflowValidationResult
        result = WorkflowValidationResult(valid=True, errors=[], warnings=[])
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.validate_workflow = AsyncMock(return_value=result)
            resp = await client.post(
                f"/api/campaigns/{CAMPAIGN_ID}/workflow/validate",
                json=_minimal_workflow_json(),
            )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    @pytest.mark.asyncio
    async def test_validate_invalid(self, client):
        from app.schemas.workflow import WorkflowValidationResult, WorkflowValidationError
        result = WorkflowValidationResult(
            valid=False,
            errors=[WorkflowValidationError(path="nodes", message="Missing trigger")],
        )
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.validate_workflow = AsyncMock(return_value=result)
            resp = await client.post(
                f"/api/campaigns/{CAMPAIGN_ID}/workflow/validate",
                json={},
            )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False


class TestPublishWorkflow:
    @pytest.mark.asyncio
    async def test_publish_success(self, client):
        wf = _mock_workflow_def(status="published")
        wf.published_at = datetime.now(timezone.utc)
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.publish_workflow = AsyncMock(return_value=wf)
            resp = await client.post(f"/api/campaigns/{CAMPAIGN_ID}/workflow/publish")
        assert resp.status_code == 200
        assert resp.json()["status"] == "published"

    @pytest.mark.asyncio
    async def test_publish_already_published(self, client):
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.publish_workflow = AsyncMock(side_effect=ValueError("Already published"))
            resp = await client.post(f"/api/campaigns/{CAMPAIGN_ID}/workflow/publish")
        assert resp.status_code == 422


class TestExportWorkflow:
    @pytest.mark.asyncio
    async def test_export_success(self, client):
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.export_workflow = AsyncMock(return_value=_minimal_workflow_json())
            resp = await client.get(f"/api/campaigns/{CAMPAIGN_ID}/workflow/export")
        assert resp.status_code == 200
        data = resp.json()
        assert data["schema_version"] == 1
        assert len(data["nodes"]) == 3


class TestImportWorkflow:
    @pytest.mark.asyncio
    async def test_import_success(self, client):
        wf = _mock_workflow_def()
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.import_workflow = AsyncMock(return_value=wf)
            resp = await client.post(
                f"/api/campaigns/{CAMPAIGN_ID}/workflow/import",
                json=_minimal_workflow_json(),
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "draft"


class TestValidateImport:
    @pytest.mark.asyncio
    async def test_validate_import_valid(self, client):
        from app.schemas.workflow import WorkflowValidationResult
        result = WorkflowValidationResult(valid=True)
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.validate_import = AsyncMock(return_value=result)
            resp = await client.post(
                "/api/workflows/import/validate",
                json=_minimal_workflow_json(),
            )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True


class TestWorkflowStats:
    @pytest.mark.asyncio
    async def test_stats_placeholder(self, client):
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_workflow_stats = AsyncMock(return_value={"nodes": {}, "edges": {}, "lead_states": {}})
            resp = await client.get(f"/api/campaigns/{CAMPAIGN_ID}/workflow/stats")
        assert resp.status_code == 200
        assert "nodes" in resp.json()


class TestAuthRequired:
    @pytest.mark.asyncio
    async def test_unauthenticated_rejected(self, unauth_client):
        resp = await unauth_client.get(f"/api/campaigns/{CAMPAIGN_ID}/workflow")
        assert resp.status_code == 401
