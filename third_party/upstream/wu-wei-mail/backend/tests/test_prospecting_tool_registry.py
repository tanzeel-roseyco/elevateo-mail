"""Tests for Phase 1 — Tool Registry and New Tools.

Covers:
- ToolRegistry registration, stage-gating, and execution
- Each tool handler returns expected JSON structure
- Unknown tool returns error
- Stage-gating filters tools correctly
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.prospecting.tool_registry import ToolRegistry, ToolContext, ToolDef

# Import tools to trigger registration
import app.services.prospecting.tools  # noqa: F401


# ===========================================================================
# ToolRegistry core
# ===========================================================================

class TestToolRegistryCore:
    """Test registry registration, retrieval, and execution."""

    def test_register_and_retrieve(self):
        registry = ToolRegistry()

        async def handler(args, ctx):
            return '{"ok": true}'

        schema = {"type": "function", "function": {"name": "test_tool", "parameters": {}}}
        registry.register("test_tool", schema, handler)

        assert "test_tool" in registry.tool_names
        tools = registry.get_tools_for_stage("DISCOVERY")
        assert len(tools) == 1
        assert tools[0]["function"]["name"] == "test_tool"

    def test_stage_gating(self):
        registry = ToolRegistry()

        async def handler(args, ctx):
            return "{}"

        schema_a = {"type": "function", "function": {"name": "tool_a", "parameters": {}}}
        schema_b = {"type": "function", "function": {"name": "tool_b", "parameters": {}}}

        registry.register("tool_a", schema_a, handler, stages={"DISCOVERY"})
        registry.register("tool_b", schema_b, handler, stages={"SELECTION"})

        discovery_tools = registry.get_tools_for_stage("DISCOVERY")
        assert len(discovery_tools) == 1
        assert discovery_tools[0]["function"]["name"] == "tool_a"

        selection_tools = registry.get_tools_for_stage("SELECTION")
        assert len(selection_tools) == 1
        assert selection_tools[0]["function"]["name"] == "tool_b"

    def test_none_stages_available_everywhere(self):
        registry = ToolRegistry()

        async def handler(args, ctx):
            return "{}"

        schema = {"type": "function", "function": {"name": "universal", "parameters": {}}}
        registry.register("universal", schema, handler, stages=None)

        for stage in ["DISCOVERY", "SELECTION", "COPYWRITING", "CAMPAIGN_SETUP", "LAUNCH_READY", "LAUNCHED"]:
            tools = registry.get_tools_for_stage(stage)
            assert len(tools) == 1

    async def test_execute_tool(self):
        registry = ToolRegistry()

        async def handler(args, ctx):
            return json.dumps({"result": args.get("query", "default")})

        schema = {"type": "function", "function": {"name": "test", "parameters": {}}}
        registry.register("test", schema, handler)

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )
        result = await registry.execute("test", {"query": "hello"}, ctx)
        assert json.loads(result)["result"] == "hello"

    async def test_execute_unknown_tool(self):
        registry = ToolRegistry()
        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )
        result = await registry.execute("nonexistent", {}, ctx)
        parsed = json.loads(result)
        assert "error" in parsed
        assert "nonexistent" in parsed["error"]

    async def test_execute_tool_exception_returns_error(self):
        registry = ToolRegistry()

        async def bad_handler(args, ctx):
            raise ValueError("Something broke")

        schema = {"type": "function", "function": {"name": "bad", "parameters": {}}}
        registry.register("bad", schema, bad_handler)

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )
        result = await registry.execute("bad", {}, ctx)
        parsed = json.loads(result)
        assert "error" in parsed
        assert "Something broke" in parsed["error"]

    def test_get_tool_names_for_stage(self):
        registry = ToolRegistry()

        async def handler(args, ctx):
            return "{}"

        registry.register("a", {"type": "function", "function": {"name": "a", "parameters": {}}}, handler, stages={"DISCOVERY"})
        registry.register("b", {"type": "function", "function": {"name": "b", "parameters": {}}}, handler, stages={"DISCOVERY", "SELECTION"})
        registry.register("c", {"type": "function", "function": {"name": "c", "parameters": {}}}, handler, stages={"SELECTION"})

        names = registry.get_tool_names_for_stage("DISCOVERY")
        assert set(names) == {"a", "b"}


# ===========================================================================
# Global registry has all tools registered
# ===========================================================================

class TestGlobalRegistry:
    """Test that importing tools registers them in the global registry."""

    def test_all_tools_registered(self):
        from app.services.prospecting.tool_registry import tool_registry

        expected_tools = {
            "search_leads", "get_lead_stats", "enrich_leads",
            "generate_copy", "create_campaign", "get_campaign_status",
        }
        registered = set(tool_registry.tool_names)
        assert expected_tools.issubset(registered), f"Missing: {expected_tools - registered}"

    def test_search_leads_in_discovery(self):
        from app.services.prospecting.tool_registry import tool_registry
        names = tool_registry.get_tool_names_for_stage("DISCOVERY")
        assert "search_leads" in names

    def test_generate_copy_not_in_discovery(self):
        from app.services.prospecting.tool_registry import tool_registry
        names = tool_registry.get_tool_names_for_stage("DISCOVERY")
        assert "generate_copy" not in names

    def test_get_lead_stats_available_everywhere(self):
        from app.services.prospecting.tool_registry import tool_registry
        for stage in ["DISCOVERY", "SELECTION", "COPYWRITING", "CAMPAIGN_SETUP", "LAUNCH_READY", "LAUNCHED"]:
            names = tool_registry.get_tool_names_for_stage(stage)
            assert "get_lead_stats" in names, f"get_lead_stats not in {stage}"

    def test_campaign_tools_in_campaign_stage(self):
        from app.services.prospecting.tool_registry import tool_registry
        names = tool_registry.get_tool_names_for_stage("CAMPAIGN_SETUP")
        assert "create_campaign" in names

    def test_campaign_status_in_launched(self):
        from app.services.prospecting.tool_registry import tool_registry
        names = tool_registry.get_tool_names_for_stage("LAUNCHED")
        assert "get_campaign_status" in names


# ===========================================================================
# Individual tool handler tests
# ===========================================================================

class TestSearchLeadsHandler:
    """Test search_leads tool handler."""

    async def test_returns_compact_json(self):
        from app.services.prospecting.tools.search_leads import handle_search_leads

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )

        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch("app.services.prospecting.lead_discovery_service.lead_discovery_service") as mock_svc:
            mock_svc.create_run = AsyncMock(return_value=mock_run)
            mock_svc.execute_run = AsyncMock(return_value=mock_run)

            source_result = MagicMock()
            source_result.all.return_value = [("web_scraper", 5)]
            company_result = MagicMock()
            company_result.all.return_value = [("Acme",)]
            ctx.db.execute = AsyncMock(side_effect=[source_result, company_result])

            result = await handle_search_leads({"query": "SaaS CTOs"}, ctx)

        parsed = json.loads(result)
        assert parsed["total_leads_found"] == 5
        assert "run_id" in parsed
        assert parsed["cycles_executed"] == 1
        assert parsed["auto_expanded"] is False
        assert "discovery_plan" in parsed
        assert parsed["discovery_plan"]["objective"] == "discover_new_leads"
        assert parsed["discovery_plan"]["planned_cycles"] == 3

    async def test_auto_expands_until_target_or_cycle_limit(self):
        from app.services.prospecting.tools.search_leads import handle_search_leads

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )

        run_1 = MagicMock()
        run_1.id = uuid.uuid4()
        run_1.status = "completed"
        run_2 = MagicMock()
        run_2.id = uuid.uuid4()
        run_2.status = "completed"

        with patch("app.services.prospecting.lead_discovery_service.lead_discovery_service") as mock_svc:
            mock_svc.create_run = AsyncMock(side_effect=[run_1, run_2])
            mock_svc.execute_run = AsyncMock(side_effect=[run_1, run_2])

            source_result_1 = MagicMock()
            source_result_1.all.return_value = [("web_scraper", 4)]
            company_result_1 = MagicMock()
            company_result_1.all.return_value = [("Alpha",)]

            source_result_2 = MagicMock()
            source_result_2.all.return_value = [("company_db", 6)]
            company_result_2 = MagicMock()
            company_result_2.all.return_value = [("Beta",)]

            ctx.db.execute = AsyncMock(
                side_effect=[source_result_1, company_result_1, source_result_2, company_result_2]
            )

            result = await handle_search_leads(
                {
                    "query": "financial insurance firms",
                    "target_min_leads": 8,
                    "max_cycles": 3,
                },
                ctx,
            )

        parsed = json.loads(result)
        assert parsed["total_leads_found"] == 10
        assert parsed["met_target"] is True
        assert parsed["cycles_executed"] == 2
        assert parsed["auto_expanded"] is True
        assert len(parsed["run_ids"]) == 2
        assert parsed["discovery_plan"]["planned_cycles"] == 3
        assert len(parsed["cycle_breakdown"]) == 2
        assert parsed["cycle_breakdown"][0]["strategy"] == "strict_icp_match"
        assert mock_svc.create_run.call_count == 2
        assert mock_svc.execute_run.call_count == 2

    async def test_auto_expand_can_be_disabled(self):
        from app.services.prospecting.tools.search_leads import handle_search_leads

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )

        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch("app.services.prospecting.lead_discovery_service.lead_discovery_service") as mock_svc:
            mock_svc.create_run = AsyncMock(return_value=mock_run)
            mock_svc.execute_run = AsyncMock(return_value=mock_run)

            source_result = MagicMock()
            source_result.all.return_value = [("web_scraper", 4)]
            company_result = MagicMock()
            company_result.all.return_value = [("Alpha",)]
            ctx.db.execute = AsyncMock(side_effect=[source_result, company_result])

            result = await handle_search_leads(
                {
                    "query": "financial insurance firms",
                    "target_min_leads": 20,
                    "auto_expand": False,
                },
                ctx,
            )

        parsed = json.loads(result)
        assert parsed["total_leads_found"] == 4
        assert parsed["met_target"] is False
        assert parsed["cycles_executed"] == 1
        assert parsed["auto_expanded"] is False
        assert parsed["discovery_plan"]["planned_cycles"] == 1
        assert parsed["discovery_plan"]["auto_expand"] is False
        assert mock_svc.create_run.call_count == 1


class TestGetLeadStatsHandler:
    """Test get_lead_stats tool handler."""

    async def test_returns_stats(self):
        from app.services.prospecting.tools.get_lead_stats import handle_get_lead_stats

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )

        run_id = uuid.uuid4()
        run_result = MagicMock()
        run_result.scalars.return_value.all.return_value = [run_id]

        total_result = MagicMock()
        total_result.scalar.return_value = 25

        band_result = MagicMock()
        band_result.all.return_value = [("READY_HIGH_CONFIDENCE", 10), ("HOLD", 15)]

        source_result = MagicMock()
        source_result.all.return_value = [("web_scraper", 25)]

        company_result = MagicMock()
        company_result.all.return_value = [("Acme", 5), ("Globex", 3)]

        industry_result = MagicMock()
        industry_result.all.return_value = [("SaaS", 15), ("Healthcare", 10)]

        ctx.db.execute = AsyncMock(side_effect=[
            run_result, total_result, band_result, source_result, company_result, industry_result,
        ])

        result = await handle_get_lead_stats({}, ctx)
        parsed = json.loads(result)
        assert parsed["total"] == 25
        assert "by_readiness_band" in parsed
        assert "top_companies" in parsed

    async def test_no_runs_returns_zero(self):
        from app.services.prospecting.tools.get_lead_stats import handle_get_lead_stats

        ctx = ToolContext(
            db=AsyncMock(),
            workspace_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
        )

        run_result = MagicMock()
        run_result.scalars.return_value.all.return_value = []
        ctx.db.execute = AsyncMock(return_value=run_result)

        result = await handle_get_lead_stats({}, ctx)
        parsed = json.loads(result)
        assert parsed["total"] == 0
