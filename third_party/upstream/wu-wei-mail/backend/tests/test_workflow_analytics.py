"""Tests for workflow causal analytics — node stats, branch conversion, path analysis, drop-off."""

import uuid
from collections import namedtuple
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import TEST_WORKSPACE_ID


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

WORKFLOW_ID = uuid.uuid4()

LEAD_A = uuid.uuid4()
LEAD_B = uuid.uuid4()
LEAD_C = uuid.uuid4()


def _mock_workflow_def():
    wf = MagicMock()
    wf.id = WORKFLOW_ID
    wf.campaign_id = None
    wf.workspace_id = TEST_WORKSPACE_ID
    wf.configure_mock(name="Analytics Test Workflow")
    wf.description = "Test"
    wf.schema_version = 1
    wf.workflow_version = 1
    wf.status = "published"
    wf.canonical_json = {"schema_version": 1, "nodes": [], "connections": []}
    wf.published_at = datetime.now(timezone.utc)
    wf.created_at = datetime.now(timezone.utc)
    wf.updated_at = datetime.now(timezone.utc)
    return wf


# ---------------------------------------------------------------------------
# Unit tests for WorkflowAnalyticsService
# ---------------------------------------------------------------------------

class TestGetNodeStats:
    """get_node_stats returns correct counts and rates."""

    @pytest.mark.asyncio
    async def test_node_stats_returns_correct_counts(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        # Simulate grouped query rows: (node_id, status, cnt, avg_duration_ms)
        NodeRow = namedtuple("NodeRow", ["node_id", "status", "cnt", "avg_duration_ms"])
        rows = [
            NodeRow("n_email", "success", 8, 120.5),
            NodeRow("n_email", "error", 2, None),
            NodeRow("n_wait", "success", 10, 50.0),
            NodeRow("n_wait", "skipped", 5, None),
        ]

        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter(rows)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_node_stats(db, WORKFLOW_ID)
        nodes = result["nodes"]

        assert "n_email" in nodes
        assert nodes["n_email"]["total_executions"] == 10
        assert nodes["n_email"]["successes"] == 8
        assert nodes["n_email"]["errors"] == 2
        assert nodes["n_email"]["error_rate"] == 0.2
        assert nodes["n_email"]["avg_duration_ms"] == 120.5

        assert "n_wait" in nodes
        assert nodes["n_wait"]["total_executions"] == 15
        assert nodes["n_wait"]["successes"] == 10
        assert nodes["n_wait"]["skipped"] == 5
        assert nodes["n_wait"]["skip_rate"] == round(5 / 15, 3)

    @pytest.mark.asyncio
    async def test_node_stats_empty_workflow(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter([])

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_node_stats(db, WORKFLOW_ID)
        assert result == {"nodes": {}}


class TestGetBranchConversion:
    """get_branch_conversion calculates percentages for if/switch nodes."""

    @pytest.mark.asyncio
    async def test_if_node_branch_percentages(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        # Mock an "if" WorkflowNode
        if_node = MagicMock()
        if_node.node_id = "n_if_replied"
        if_node.node_type = "if"

        # Execution logs with different condition results
        log_yes1 = MagicMock()
        log_yes1.output_snapshot = {"condition_met": True}
        log_yes2 = MagicMock()
        log_yes2.output_snapshot = {"condition_met": True}
        log_yes3 = MagicMock()
        log_yes3.output_snapshot = {"condition_met": True}
        log_no1 = MagicMock()
        log_no1.output_snapshot = {"condition_met": False}
        log_no2 = MagicMock()
        log_no2.output_snapshot = {"condition_met": False}

        all_logs = [log_yes1, log_yes2, log_yes3, log_no1, log_no2]

        # Build scalars mock for nodes query
        nodes_scalars = MagicMock()
        nodes_scalars.all.return_value = [if_node]
        nodes_result = MagicMock()
        nodes_result.scalars.return_value = nodes_scalars

        # Build scalars mock for logs query
        logs_scalars = MagicMock()
        logs_scalars.all.return_value = all_logs
        logs_result = MagicMock()
        logs_result.scalars.return_value = logs_scalars

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[nodes_result, logs_result])

        result = await svc.get_branch_conversion(db, WORKFLOW_ID)
        branches = result["branch_nodes"]

        assert "n_if_replied" in branches
        branch = branches["n_if_replied"]
        assert branch["total"] == 5
        assert branch["branches"]["yes"]["count"] == 3
        assert branch["branches"]["yes"]["percentage"] == 60.0
        assert branch["branches"]["no"]["count"] == 2
        assert branch["branches"]["no"]["percentage"] == 40.0

    @pytest.mark.asyncio
    async def test_switch_node_branch_percentages(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        switch_node = MagicMock()
        switch_node.node_id = "n_switch_channel"
        switch_node.node_type = "switch"

        log_email = MagicMock()
        log_email.output_snapshot = {"switch_value": "email"}
        log_linkedin = MagicMock()
        log_linkedin.output_snapshot = {"switch_value": "linkedin"}
        log_email2 = MagicMock()
        log_email2.output_snapshot = {"switch_value": "email"}
        log_default = MagicMock()
        log_default.output_snapshot = {}  # no switch_value -> "default"

        nodes_scalars = MagicMock()
        nodes_scalars.all.return_value = [switch_node]
        nodes_result = MagicMock()
        nodes_result.scalars.return_value = nodes_scalars

        logs_scalars = MagicMock()
        logs_scalars.all.return_value = [log_email, log_linkedin, log_email2, log_default]
        logs_result = MagicMock()
        logs_result.scalars.return_value = logs_scalars

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[nodes_result, logs_result])

        result = await svc.get_branch_conversion(db, WORKFLOW_ID)
        branches = result["branch_nodes"]["n_switch_channel"]["branches"]

        assert branches["email"]["count"] == 2
        assert branches["linkedin"]["count"] == 1
        assert branches["default"]["count"] == 1

    @pytest.mark.asyncio
    async def test_no_branch_nodes(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        nodes_scalars = MagicMock()
        nodes_scalars.all.return_value = []
        nodes_result = MagicMock()
        nodes_result.scalars.return_value = nodes_scalars

        db = AsyncMock()
        db.execute = AsyncMock(return_value=nodes_result)

        result = await svc.get_branch_conversion(db, WORKFLOW_ID)
        assert result == {"branch_nodes": {}}


class TestGetPathAnalysis:
    """get_path_analysis groups lead paths and returns frequencies."""

    @pytest.mark.asyncio
    async def test_path_analysis_groups_lead_paths(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        # Three leads taking two different paths
        PathRow = namedtuple("PathRow", ["lead_id", "node_id"])
        rows = [
            # Lead A: trigger -> email -> end
            PathRow(LEAD_A, "n_trigger"),
            PathRow(LEAD_A, "n_email"),
            PathRow(LEAD_A, "n_end"),
            # Lead B: trigger -> email -> end (same path)
            PathRow(LEAD_B, "n_trigger"),
            PathRow(LEAD_B, "n_email"),
            PathRow(LEAD_B, "n_end"),
            # Lead C: trigger -> wait -> email -> end
            PathRow(LEAD_C, "n_trigger"),
            PathRow(LEAD_C, "n_wait"),
            PathRow(LEAD_C, "n_email"),
            PathRow(LEAD_C, "n_end"),
        ]

        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter(rows)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_path_analysis(db, WORKFLOW_ID)

        assert result["total_leads"] == 3
        assert result["unique_paths"] == 2
        assert len(result["top_paths"]) == 2

        # The most common path should be first
        top = result["top_paths"][0]
        assert top["path"] == "n_trigger -> n_email -> n_end"
        assert top["count"] == 2
        assert top["percentage"] == round(2 / 3 * 100, 1)

    @pytest.mark.asyncio
    async def test_path_analysis_empty(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter([])

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_path_analysis(db, WORKFLOW_ID)
        assert result["total_leads"] == 0
        assert result["unique_paths"] == 0
        assert result["top_paths"] == []


class TestGetDropoffAnalysis:
    """get_dropoff_analysis identifies high-failure nodes."""

    @pytest.mark.asyncio
    async def test_dropoff_identifies_high_failure_nodes(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        # Simulate grouped lead state rows: (current_node_id, status, cnt)
        StateRow = namedtuple("StateRow", ["current_node_id", "status", "cnt"])
        rows = [
            StateRow("n_email", "completed", 8),
            StateRow("n_email", "failed", 2),
            StateRow("n_wait", "waiting", 5),
            StateRow("n_wait", "completed", 3),
            StateRow("n_linkedin", "failed", 4),
            StateRow("n_linkedin", "dead_lettered", 1),
            StateRow("n_linkedin", "completed", 5),
        ]

        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter(rows)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_dropoff_analysis(db, WORKFLOW_ID)
        dropoffs = result["dropoffs"]

        assert len(dropoffs) == 3

        # Should be sorted by failed_rate descending
        # n_linkedin: 5/10 = 0.5
        # n_email: 2/10 = 0.2
        # n_wait: 0/8 = 0.0
        assert dropoffs[0]["node_id"] == "n_linkedin"
        assert dropoffs[0]["failed"] == 5  # 4 failed + 1 dead_lettered
        assert dropoffs[0]["failed_rate"] == 0.5

        assert dropoffs[1]["node_id"] == "n_email"
        assert dropoffs[1]["failed"] == 2
        assert dropoffs[1]["failed_rate"] == 0.2

        assert dropoffs[2]["node_id"] == "n_wait"
        assert dropoffs[2]["stuck"] == 5
        assert dropoffs[2]["stuck_rate"] == 0.625  # 5/8
        assert dropoffs[2]["failed_rate"] == 0.0

    @pytest.mark.asyncio
    async def test_dropoff_empty(self):
        from app.services.workflow.workflow_analytics import WorkflowAnalyticsService

        svc = WorkflowAnalyticsService()

        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter([])

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await svc.get_dropoff_analysis(db, WORKFLOW_ID)
        assert result == {"dropoffs": []}


# ---------------------------------------------------------------------------
# API endpoint integration tests (via httpx)
# ---------------------------------------------------------------------------

class TestAnalyticsEndpoints:
    """Test the /workflows/{id}/analytics/* endpoints via httpx."""

    @pytest.mark.asyncio
    async def test_node_analytics_endpoint(self, client):
        wf = _mock_workflow_def()
        mock_stats = {"nodes": {"n_email": {"total_executions": 10}}}
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_by_id = AsyncMock(return_value=wf)
            with patch("app.services.workflow.workflow_analytics.workflow_analytics_service") as analytics:
                analytics.get_node_stats = AsyncMock(return_value=mock_stats)
                resp = await client.get(f"/api/workflows/{WORKFLOW_ID}/analytics/nodes")
        assert resp.status_code == 200
        assert "nodes" in resp.json()

    @pytest.mark.asyncio
    async def test_branch_analytics_endpoint(self, client):
        wf = _mock_workflow_def()
        mock_branches = {"branch_nodes": {}}
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_by_id = AsyncMock(return_value=wf)
            with patch("app.services.workflow.workflow_analytics.workflow_analytics_service") as analytics:
                analytics.get_branch_conversion = AsyncMock(return_value=mock_branches)
                resp = await client.get(f"/api/workflows/{WORKFLOW_ID}/analytics/branches")
        assert resp.status_code == 200
        assert "branch_nodes" in resp.json()

    @pytest.mark.asyncio
    async def test_path_analytics_endpoint(self, client):
        wf = _mock_workflow_def()
        mock_paths = {"total_leads": 5, "unique_paths": 2, "top_paths": []}
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_by_id = AsyncMock(return_value=wf)
            with patch("app.services.workflow.workflow_analytics.workflow_analytics_service") as analytics:
                analytics.get_path_analysis = AsyncMock(return_value=mock_paths)
                resp = await client.get(f"/api/workflows/{WORKFLOW_ID}/analytics/paths")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_leads"] == 5

    @pytest.mark.asyncio
    async def test_dropoff_analytics_endpoint(self, client):
        wf = _mock_workflow_def()
        mock_dropoff = {"dropoffs": []}
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_by_id = AsyncMock(return_value=wf)
            with patch("app.services.workflow.workflow_analytics.workflow_analytics_service") as analytics:
                analytics.get_dropoff_analysis = AsyncMock(return_value=mock_dropoff)
                resp = await client.get(f"/api/workflows/{WORKFLOW_ID}/analytics/dropoff")
        assert resp.status_code == 200
        assert "dropoffs" in resp.json()

    @pytest.mark.asyncio
    async def test_analytics_endpoint_workflow_not_found(self, client):
        with patch("app.routers.workflows.workflow_service") as svc:
            svc.get_by_id = AsyncMock(side_effect=ValueError("Not found"))
            resp = await client.get(f"/api/workflows/{WORKFLOW_ID}/analytics/nodes")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_analytics_endpoint_unauthenticated(self, unauth_client):
        resp = await unauth_client.get(f"/api/workflows/{WORKFLOW_ID}/analytics/nodes")
        assert resp.status_code == 401
