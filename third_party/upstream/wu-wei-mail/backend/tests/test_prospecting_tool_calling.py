"""Tests for the orchestrator tool-calling pipeline.

Covers:
- OpenRouter chat_completion_with_tools function
- ORCHESTRATOR_TOOLS schema validation
- OrchestratorService._run_with_tools tool loop
- OrchestratorService._tool_search_leads compact metadata
- OrchestratorService._handle_tool_call dispatch
- OrchestratorService.process_message integration with tools
- Fallback behavior when tool-calling fails
- Edge cases (no tool_calls, malformed args, discovery failure)
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.prospecting.orchestrator_service import (
    OrchestratorService,
    ORCHESTRATOR_SYSTEM_PROMPT,
    RoutingDecision,
    UserIntent,
)
from app.services.prospecting.tool_registry import tool_registry
import app.services.prospecting.tools  # noqa: F401 — trigger registration
from app.services.prospecting.journey_state_machine import JourneyStage

# Backwards-compatible alias used by schema validation tests
ORCHESTRATOR_TOOLS = tool_registry.get_tools_for_stage("DISCOVERY")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_routing(
    intent=UserIntent.LEAD_GENERATION,
    stage=JourneyStage.DISCOVERY,
    next_action="execute_discovery_run",
    handoff_target="lead_discovery",
) -> RoutingDecision:
    return RoutingDecision(
        intent=intent,
        stage=stage,
        next_action=next_action,
        handoff_target=handoff_target,
    )


def _mock_conversation(stage="DISCOVERY"):
    conv = MagicMock()
    conv.id = uuid.uuid4()
    conv.workspace_id = uuid.uuid4()
    conv.stage = stage
    return conv


def _mock_tool_call_response(
    tool_name="search_leads",
    arguments=None,
    call_id="call_abc123",
):
    """Build a mock assistant message containing a tool_call."""
    if arguments is None:
        arguments = {"query": "SaaS CTOs in San Francisco", "industry": "SaaS", "role": "CTO"}
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": call_id,
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": json.dumps(arguments),
                },
            }
        ],
    }


def _mock_text_response(text="Here are your results!"):
    """Build a mock assistant message with text content (no tool_calls)."""
    return {"role": "assistant", "content": text}


# ===========================================================================
# 1. Tool definitions schema validation
# ===========================================================================

class TestOrchestratorToolSchema:
    """Validate the ORCHESTRATOR_TOOLS constant is well-formed."""

    def test_tools_is_non_empty_list(self):
        assert isinstance(ORCHESTRATOR_TOOLS, list)
        assert len(ORCHESTRATOR_TOOLS) >= 1

    def test_search_leads_tool_exists(self):
        names = [t["function"]["name"] for t in ORCHESTRATOR_TOOLS]
        assert "search_leads" in names

    def test_search_leads_has_required_structure(self):
        tool = ORCHESTRATOR_TOOLS[0]
        assert tool["type"] == "function"
        fn = tool["function"]
        assert "name" in fn
        assert "description" in fn
        assert "parameters" in fn

    def test_search_leads_parameters(self):
        params = ORCHESTRATOR_TOOLS[0]["function"]["parameters"]
        assert params["type"] == "object"
        props = params["properties"]
        assert "query" in props
        assert "industry" in props
        assert "role" in props
        assert "location" in props
        assert "company_size" in props
        assert "company_type" in props
        assert "keywords" in props

    def test_query_is_only_required_param(self):
        params = ORCHESTRATOR_TOOLS[0]["function"]["parameters"]
        assert params["required"] == ["query"]

    def test_keywords_is_array_type(self):
        props = ORCHESTRATOR_TOOLS[0]["function"]["parameters"]["properties"]
        assert props["keywords"]["type"] == "array"
        assert props["keywords"]["items"]["type"] == "string"


class TestSystemPrompt:
    """Validate the system prompt template."""

    def test_has_stage_placeholder(self):
        assert "{stage}" in ORCHESTRATOR_SYSTEM_PROMPT

    def test_has_context_placeholder(self):
        assert "{context}" in ORCHESTRATOR_SYSTEM_PROMPT

    def test_mentions_search_leads_tool(self):
        assert "search_leads" in ORCHESTRATOR_SYSTEM_PROMPT

    def test_format_with_stage_and_context(self):
        """Prompt renders without errors."""
        result = ORCHESTRATOR_SYSTEM_PROMPT.format(stage="DISCOVERY", context="")
        assert "DISCOVERY" in result


# ===========================================================================
# 2. chat_completion_with_tools (openrouter_client)
# ===========================================================================

class TestChatCompletionWithTools:
    """Tests for openrouter_client.chat_completion_with_tools."""

    async def test_sends_tools_in_payload(self):
        """Verify tools are included in the API request body."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "Hello"}}]
        }

        with patch("app.utils.openrouter_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient:
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = "test-key"
            settings.OPENROUTER_MODEL = "test-model"
            settings.OPENROUTER_TEMPERATURE = 0.7
            settings.OPENROUTER_MAX_TOKENS = 2000
            settings.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
            settings.OPENROUTER_APP_URL = "http://localhost"
            settings.OPENROUTER_APP_NAME = "test"
            settings.OPENROUTER_TIMEOUT_SECONDS = 90
            mock_settings.return_value = settings

            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            from app.utils.openrouter_client import chat_completion_with_tools

            result = await chat_completion_with_tools(
                messages=[{"role": "user", "content": "Find leads"}],
                tools=ORCHESTRATOR_TOOLS,
            )

            # Verify the POST call included tools
            call_args = mock_client_instance.post.call_args
            payload = call_args.kwargs.get("json") or call_args[1].get("json")
            assert "tools" in payload
            assert payload["tools"] == ORCHESTRATOR_TOOLS

    async def test_returns_full_message_dict(self):
        """Returns the complete message dict, not just content."""
        expected_message = {"role": "assistant", "content": "Hello", "tool_calls": []}
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"choices": [{"message": expected_message}]}

        with patch("app.utils.openrouter_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient:
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = "test-key"
            settings.OPENROUTER_MODEL = "test-model"
            settings.OPENROUTER_TEMPERATURE = 0.7
            settings.OPENROUTER_MAX_TOKENS = 2000
            settings.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
            settings.OPENROUTER_APP_URL = "http://localhost"
            settings.OPENROUTER_APP_NAME = "test"
            settings.OPENROUTER_TIMEOUT_SECONDS = 90
            mock_settings.return_value = settings

            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            from app.utils.openrouter_client import chat_completion_with_tools

            result = await chat_completion_with_tools(
                messages=[{"role": "user", "content": "test"}],
                tools=ORCHESTRATOR_TOOLS,
            )
            assert isinstance(result, dict)
            assert result == expected_message

    async def test_returns_tool_calls_from_model(self):
        """When model returns tool_calls, they are in the result."""
        tool_call_msg = _mock_tool_call_response()
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"choices": [{"message": tool_call_msg}]}

        with patch("app.utils.openrouter_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient:
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = "test-key"
            settings.OPENROUTER_MODEL = "test-model"
            settings.OPENROUTER_TEMPERATURE = 0.7
            settings.OPENROUTER_MAX_TOKENS = 2000
            settings.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
            settings.OPENROUTER_APP_URL = "http://localhost"
            settings.OPENROUTER_APP_NAME = "test"
            settings.OPENROUTER_TIMEOUT_SECONDS = 90
            mock_settings.return_value = settings

            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            from app.utils.openrouter_client import chat_completion_with_tools

            result = await chat_completion_with_tools(
                messages=[{"role": "user", "content": "test"}],
                tools=ORCHESTRATOR_TOOLS,
            )
            assert "tool_calls" in result
            assert len(result["tool_calls"]) == 1
            assert result["tool_calls"][0]["function"]["name"] == "search_leads"

    async def test_raises_on_no_choices(self):
        """Raises ValueError when API returns empty choices."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"choices": []}

        with patch("app.utils.openrouter_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient:
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = "test-key"
            settings.OPENROUTER_MODEL = "test-model"
            settings.OPENROUTER_TEMPERATURE = 0.7
            settings.OPENROUTER_MAX_TOKENS = 2000
            settings.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
            settings.OPENROUTER_APP_URL = "http://localhost"
            settings.OPENROUTER_APP_NAME = "test"
            settings.OPENROUTER_TIMEOUT_SECONDS = 90
            mock_settings.return_value = settings

            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client_instance

            from app.utils.openrouter_client import chat_completion_with_tools

            with pytest.raises(ValueError, match="no choices"):
                await chat_completion_with_tools(
                    messages=[{"role": "user", "content": "test"}],
                    tools=ORCHESTRATOR_TOOLS,
                )

    async def test_raises_on_missing_api_key(self):
        """Raises ValueError when API key is not configured."""
        with patch("app.utils.openrouter_client.get_settings") as mock_settings:
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = ""
            mock_settings.return_value = settings

            from app.utils.openrouter_client import chat_completion_with_tools

            with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
                await chat_completion_with_tools(
                    messages=[{"role": "user", "content": "test"}],
                    tools=ORCHESTRATOR_TOOLS,
                )


# ===========================================================================
# 3. _handle_tool_call dispatch
# ===========================================================================

@pytest.mark.skip(reason="Tests legacy code path — _handle_tool_call now delegates to tool_registry.execute")
class TestHandleToolCall:
    """Tests for OrchestratorService._handle_tool_call."""

    def setup_method(self):
        self.svc = OrchestratorService()
        self.db = AsyncMock()
        self.workspace_id = uuid.uuid4()
        self.conversation_id = uuid.uuid4()

    async def test_dispatches_search_leads(self):
        """search_leads tool name dispatches to _tool_search_leads."""
        with patch.object(self.svc, "_tool_search_leads", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = '{"total_leads_found": 5}'

            result = await self.svc._handle_tool_call(
                tool_name="search_leads",
                arguments={"query": "test"},
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )
            mock_search.assert_called_once_with(
                {"query": "test"}, self.db, self.workspace_id, self.conversation_id,
            )
            assert '"total_leads_found": 5' in result

    async def test_unknown_tool_returns_error(self):
        """Unknown tool name returns error JSON."""
        result = await self.svc._handle_tool_call(
            tool_name="nonexistent_tool",
            arguments={},
            db=self.db,
            workspace_id=self.workspace_id,
            conversation_id=self.conversation_id,
        )
        parsed = json.loads(result)
        assert "error" in parsed
        assert "nonexistent_tool" in parsed["error"]


# ===========================================================================
# 4. _tool_search_leads — compact metadata
# ===========================================================================

@pytest.mark.skip(reason="Tests legacy code path — _tool_search_leads replaced by tool_registry search_leads handler")
class TestToolSearchLeads:
    """Tests for OrchestratorService._tool_search_leads."""

    def setup_method(self):
        self.svc = OrchestratorService()
        self.workspace_id = uuid.uuid4()
        self.conversation_id = uuid.uuid4()

    async def test_returns_compact_metadata(self):
        """Result contains run_id, total_leads_found, sources, sample_companies."""
        db = AsyncMock()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch(
            "app.services.prospecting.lead_discovery_service.lead_discovery_service",
        ) as mock_discovery:
            mock_discovery.create_run = AsyncMock(return_value=mock_run)
            mock_discovery.execute_run = AsyncMock(return_value=mock_run)

            # Mock: source breakdown (also provides total count)
            source_result = MagicMock()
            source_result.all.return_value = [("web_scraper", 10), ("linkedin_search", 5)]

            # Mock: company names
            company_result = MagicMock()
            company_result.all.return_value = [("Acme Corp",), ("Globex",), ("Initech",)]

            db.execute = AsyncMock(side_effect=[source_result, company_result])

            result_str = await self.svc._tool_search_leads(
                arguments={"query": "SaaS CTOs", "industry": "SaaS"},
                db=db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        result = json.loads(result_str)
        assert result["run_id"] == str(mock_run.id)
        assert result["status"] == "completed"
        assert result["total_leads_found"] == 15
        assert result["sources"] == {"web_scraper": 10, "linkedin_search": 5}
        assert result["sample_companies"] == ["Acme Corp", "Globex", "Initech"]

    async def test_returns_error_on_discovery_failure(self):
        """If discovery raises, return error JSON (don't propagate exception)."""
        db = AsyncMock()

        with patch(
            "app.services.prospecting.lead_discovery_service.lead_discovery_service",
        ) as mock_discovery:
            mock_discovery.create_run = AsyncMock(
                side_effect=RuntimeError("DB connection lost"),
            )

            result_str = await self.svc._tool_search_leads(
                arguments={"query": "test"},
                db=db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        result = json.loads(result_str)
        assert "error" in result
        assert result["total_leads_found"] == 0

    async def test_filters_empty_argument_values(self):
        """Empty string values in arguments are filtered out before ICP criteria."""
        db = AsyncMock()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch(
            "app.services.prospecting.lead_discovery_service.lead_discovery_service",
        ) as mock_discovery:
            mock_discovery.create_run = AsyncMock(return_value=mock_run)
            mock_discovery.execute_run = AsyncMock(return_value=mock_run)

            source_result = MagicMock()
            source_result.all.return_value = []
            company_result = MagicMock()
            company_result.all.return_value = []
            db.execute = AsyncMock(side_effect=[source_result, company_result])

            await self.svc._tool_search_leads(
                arguments={"query": "test", "industry": "", "role": None, "location": "NYC"},
                db=db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

            # Verify ICP criteria passed to create_run excludes empty values
            create_call = mock_discovery.create_run.call_args
            icp = create_call.kwargs.get("icp_criteria") or create_call[1].get("icp_criteria")
            assert "industry" not in icp  # empty string filtered
            assert "role" not in icp  # None filtered
            assert icp["query"] == "test"
            assert icp["location"] == "NYC"

    async def test_zero_leads_still_returns_valid_json(self):
        """Even with 0 leads, response is valid JSON with all fields."""
        db = AsyncMock()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch(
            "app.services.prospecting.lead_discovery_service.lead_discovery_service",
        ) as mock_discovery:
            mock_discovery.create_run = AsyncMock(return_value=mock_run)
            mock_discovery.execute_run = AsyncMock(return_value=mock_run)

            source_result = MagicMock()
            source_result.all.return_value = []
            company_result = MagicMock()
            company_result.all.return_value = []
            db.execute = AsyncMock(side_effect=[source_result, company_result])

            result_str = await self.svc._tool_search_leads(
                arguments={"query": "nonexistent niche"},
                db=db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        result = json.loads(result_str)
        assert result["total_leads_found"] == 0
        assert result["sample_companies"] == []
        assert result["sources"] == {}


# ===========================================================================
# 5. _run_with_tools — the tool loop
# ===========================================================================

@pytest.mark.skip(reason="Tests legacy code path — _run_with_tools replaced by run_agent_loop in agent_loop.py")
class TestRunWithTools:
    """Tests for OrchestratorService._run_with_tools."""

    def setup_method(self):
        self.svc = OrchestratorService()
        self.routing = _make_routing()
        self.db = AsyncMock()
        self.workspace_id = uuid.uuid4()
        self.conversation_id = uuid.uuid4()

    async def test_text_response_no_tool_calls(self):
        """If LLM responds with text (no tool_calls), return (text, [])."""
        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_tools:
            mock_tools.return_value = _mock_text_response("I can help with that!")

            text, results = await self.svc._run_with_tools(
                routing=self.routing,
                user_message="Find SaaS leads",
                conversation_history=[],
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        assert text == "I can help with that!"
        assert results == []

    async def test_fallback_when_no_content_and_no_tools(self):
        """If no tool_calls and no content, use fallback response."""
        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_tools:
            mock_tools.return_value = {"role": "assistant", "content": ""}

            text, results = await self.svc._run_with_tools(
                routing=self.routing,
                user_message="Find leads",
                conversation_history=[],
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        # Should use fallback since content is empty
        assert len(text) > 0
        assert results == []

    async def test_full_tool_loop(self):
        """Full loop: LLM → tool_call → execute tool → send result → final text."""
        tool_result = json.dumps({
            "run_id": str(uuid.uuid4()),
            "status": "completed",
            "total_leads_found": 12,
            "sources": {"web_scraper": 12},
            "sample_companies": ["Acme Corp"],
        })

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_with_tools, \
            patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_completion, \
            patch.object(
            self.svc, "_handle_tool_call", new_callable=AsyncMock,
        ) as mock_handle:
            # First call returns a tool_call
            mock_with_tools.return_value = _mock_tool_call_response(
                arguments={"query": "SaaS CTOs", "industry": "SaaS"},
            )
            # Tool execution returns compact metadata
            mock_handle.return_value = tool_result
            # Second call returns final text
            mock_completion.return_value = "I found 12 leads in the SaaS industry."

            text, results = await self.svc._run_with_tools(
                routing=self.routing,
                user_message="Find SaaS CTOs",
                conversation_history=[],
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        assert text == "I found 12 leads in the SaaS industry."
        assert len(results) == 1
        assert results[0]["tool_name"] == "search_leads"
        assert results[0]["arguments"]["query"] == "SaaS CTOs"
        assert results[0]["result"] == tool_result

        # Verify the second LLM call received tool results
        second_call_messages = mock_completion.call_args[0][0]
        roles = [m.get("role") for m in second_call_messages]
        assert "tool" in roles  # Tool result was included

    async def test_malformed_tool_arguments(self):
        """Gracefully handle invalid JSON in tool call arguments."""
        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_with_tools, \
            patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_completion, \
            patch.object(
            self.svc, "_handle_tool_call", new_callable=AsyncMock,
        ) as mock_handle:
            # Return a tool_call with invalid JSON arguments
            bad_response = {
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": "call_bad",
                    "type": "function",
                    "function": {
                        "name": "search_leads",
                        "arguments": "this is not json{{{",
                    },
                }],
            }
            mock_with_tools.return_value = bad_response
            mock_handle.return_value = '{"total_leads_found": 0}'
            mock_completion.return_value = "No leads found."

            text, results = await self.svc._run_with_tools(
                routing=self.routing,
                user_message="Find leads",
                conversation_history=[],
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        # Should not crash — arguments default to {}
        assert text == "No leads found."
        assert results[0]["arguments"] == {}

    async def test_multiple_tool_calls(self):
        """Handle multiple tool_calls in one response."""
        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_with_tools, \
            patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_completion, \
            patch.object(
            self.svc, "_handle_tool_call", new_callable=AsyncMock,
        ) as mock_handle:
            # Two tool calls in one response
            multi_tool_response = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "search_leads",
                            "arguments": json.dumps({"query": "SaaS"}),
                        },
                    },
                    {
                        "id": "call_2",
                        "type": "function",
                        "function": {
                            "name": "search_leads",
                            "arguments": json.dumps({"query": "Healthcare"}),
                        },
                    },
                ],
            }
            mock_with_tools.return_value = multi_tool_response
            mock_handle.side_effect = [
                '{"total_leads_found": 5}',
                '{"total_leads_found": 8}',
            ]
            mock_completion.return_value = "Found leads in both sectors."

            text, results = await self.svc._run_with_tools(
                routing=self.routing,
                user_message="Find SaaS and Healthcare leads",
                conversation_history=[],
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        assert text == "Found leads in both sectors."
        assert len(results) == 2
        assert mock_handle.call_count == 2

    async def test_conversation_history_included(self):
        """Conversation history is included in the LLM messages."""
        history = [
            {"role": "user", "content": "I sell to enterprises"},
            {"role": "assistant", "content": "Got it, enterprise focus."},
        ]

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_with_tools:
            mock_with_tools.return_value = _mock_text_response("Searching now...")

            await self.svc._run_with_tools(
                routing=self.routing,
                user_message="Find leads",
                conversation_history=history,
                db=self.db,
                workspace_id=self.workspace_id,
                conversation_id=self.conversation_id,
            )

        call_messages = mock_with_tools.call_args.kwargs.get("messages") or mock_with_tools.call_args[0][0]
        # system + 2 history + 1 user = 4 messages
        assert len(call_messages) == 4
        assert call_messages[1]["content"] == "I sell to enterprises"
        assert call_messages[2]["content"] == "Got it, enterprise focus."


# ===========================================================================
# 6. process_message integration with tools
# ===========================================================================

class TestProcessMessageWithTools:
    """Integration tests for process_message using the agent loop."""

    def setup_method(self):
        self.svc = OrchestratorService()
        self.workspace_id = uuid.uuid4()
        self.conversation_id = uuid.uuid4()
        self.user_id = uuid.uuid4()

    def _setup_db_mocks(self, db, conversation):
        """Configure db.execute to return conversation, messages, model policy, and context results.

        process_message call order:
        1. select(ProspectingConversation) → conv_result
        2. select(ProspectingMessage) → msg_result
        3. model_router_service.resolve → select(AgentModelPolicy) → policy_result
        4. build_conversation_context → select(ProspectingRun) → ctx_run_result
        """
        conv_result = MagicMock()
        conv_result.scalar_one_or_none.return_value = conversation

        msg_scalars = MagicMock()
        msg_scalars.all.return_value = []
        msg_result = MagicMock()
        msg_result.scalars.return_value = msg_scalars

        # model_router_service.resolve: no policy found
        policy_result = MagicMock()
        policy_result.scalar_one_or_none.return_value = None

        # build_conversation_context queries: runs (empty = no further queries)
        ctx_run_result = MagicMock()
        ctx_run_result.all.return_value = []

        db.execute = AsyncMock(side_effect=[conv_result, msg_result, policy_result, ctx_run_result])

    def _mock_agent_loop_result(self, content="Response.", tool_calls=None):
        """Build a mock AgentLoopResult."""
        from app.services.prospecting.agent_loop import AgentLoopResult, ToolCallRecord
        tc_records = []
        if tool_calls:
            for tc in tool_calls:
                tc_records.append(ToolCallRecord(
                    tool_name=tc["tool_name"],
                    arguments=tc["arguments"],
                    result=tc.get("result", "{}"),
                    iteration=1,
                ))
        return AgentLoopResult(
            content=content,
            tool_calls=tc_records,
            iterations=1,
            terminated_by="natural",
        )

    async def test_lead_generation_uses_agent_loop(self):
        """LEAD_GENERATION intent triggers the agent loop."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="DISCOVERY")

        self._setup_db_mocks(db, conv)

        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None  # tool_action
            mock_loop.return_value = self._mock_agent_loop_result(
                content="Found 15 leads!",
                tool_calls=[{"tool_name": "search_leads", "arguments": {"query": "SaaS"}}],
            )

            routing, user_msg, assistant_msg = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Find me SaaS leads",
            )

        mock_loop.assert_called_once()
        assert assistant_msg.content == "Found 15 leads!"

    async def test_general_question_uses_agent_loop(self):
        """GENERAL_QUESTION goes through agent loop (may have no tools)."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="LAUNCHED")

        self._setup_db_mocks(db, conv)

        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None  # tool_action — agent loop handles it
            mock_loop.return_value = self._mock_agent_loop_result(
                content="Your campaign is running.",
            )

            routing, user_msg, assistant_msg = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="How is my campaign doing?",
            )

        mock_loop.assert_called_once()
        assert routing.intent == UserIntent.GENERAL_QUESTION

    async def test_copywriting_uses_agent_loop(self):
        """COPYWRITING intent goes through agent loop with generate_copy tool."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="COPYWRITING")

        self._setup_db_mocks(db, conv)

        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None
            mock_loop.return_value = self._mock_agent_loop_result(
                content="Here's your email draft...",
            )

            routing, user_msg, assistant_msg = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Write me cold email copy",
            )

        mock_loop.assert_called_once()
        assert routing.intent == UserIntent.COPYWRITING

    async def test_agent_loop_failure_falls_back(self):
        """If agent loop raises, falls back to static response."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="DISCOVERY")

        self._setup_db_mocks(db, conv)

        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None
            mock_loop.side_effect = RuntimeError("API timeout")

            routing, user_msg, assistant_msg = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Find me leads in healthcare",
            )

        mock_loop.assert_called_once()
        # Should use fallback response (not crash)
        assert len(assistant_msg.content) > 0

    async def test_icp_extracted_from_tool_arguments(self):
        """ICP criteria from search_leads args stored in routing.metadata."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="DISCOVERY")

        self._setup_db_mocks(db, conv)

        icp_args = {"query": "SaaS CTOs", "industry": "SaaS", "role": "CTO"}
        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None
            mock_loop.return_value = self._mock_agent_loop_result(
                content="Found 10 leads!",
                tool_calls=[{"tool_name": "search_leads", "arguments": icp_args}],
            )

            routing, _, _ = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Find SaaS CTOs",
            )

        assert routing.metadata["icp_criteria"] == icp_args

    async def test_lead_selection_uses_agent_loop(self):
        """LEAD_SELECTION intent goes through agent loop."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="SELECTION")

        self._setup_db_mocks(db, conv)

        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None
            mock_loop.return_value = self._mock_agent_loop_result("Selected leads.")

            routing, _, _ = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Select the top 10 leads",
            )

        mock_loop.assert_called_once()
        assert routing.intent == UserIntent.LEAD_SELECTION

    async def test_assistant_message_has_metadata(self):
        """Assistant message includes routing metadata."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        conv = _mock_conversation(stage="DISCOVERY")

        self._setup_db_mocks(db, conv)

        with patch(
            "app.services.prospecting.agent_loop.run_agent_loop",
            new_callable=AsyncMock,
        ) as mock_loop, \
            patch.object(
            self.svc, "classify_intent_llm", new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = None
            mock_loop.return_value = self._mock_agent_loop_result("Response.")

            routing, _, assistant_msg = await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Find leads",
            )

        assert assistant_msg.metadata_json["intent"] == UserIntent.LEAD_GENERATION
        assert assistant_msg.metadata_json["stage"] == "DISCOVERY"
        assert assistant_msg.agent_type == "lead_discovery"

    async def test_conversation_not_found_raises(self):
        """If conversation doesn't exist, raise ValueError."""
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)

        with pytest.raises(ValueError, match="not found"):
            await self.svc.process_message(
                db=db,
                conversation_id=self.conversation_id,
                workspace_id=self.workspace_id,
                user_id=self.user_id,
                content="Find leads",
            )


# ===========================================================================
# 7. End-to-end flow validation
# ===========================================================================

@pytest.mark.skip(reason="Tests legacy code path — _tool_search_leads / _run_with_tools replaced by tool_registry + agent_loop")
class TestEndToEndToolFlow:
    """Validate the complete data flow through the tool-calling pipeline."""

    async def test_context_window_stays_compact(self):
        """Tool result is compact metadata, not full lead objects.

        This is the core requirement: the LLM context should NOT contain
        full lead records with all fields — just counts and company names.
        """
        svc = OrchestratorService()
        db = AsyncMock()
        workspace_id = uuid.uuid4()
        conversation_id = uuid.uuid4()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch(
            "app.services.prospecting.lead_discovery_service.lead_discovery_service",
        ) as mock_discovery:
            mock_discovery.create_run = AsyncMock(return_value=mock_run)
            mock_discovery.execute_run = AsyncMock(return_value=mock_run)

            source_result = MagicMock()
            source_result.all.return_value = [
                ("web_scraper", 30), ("linkedin_search", 20),
            ]

            company_result = MagicMock()
            company_result.all.return_value = [
                ("BigCorp",), ("TechStart",), ("DataFlow",),
            ]

            db.execute = AsyncMock(side_effect=[source_result, company_result])

            result_str = await svc._tool_search_leads(
                arguments={"query": "enterprise CTOs"},
                db=db,
                workspace_id=workspace_id,
                conversation_id=conversation_id,
            )

        result = json.loads(result_str)

        # Verify compactness — no full lead objects
        assert "email" not in result_str.lower()
        assert "first_name" not in result_str.lower()
        assert "last_name" not in result_str.lower()
        assert "title" not in result_str.lower()
        assert "linkedin_url" not in result_str.lower()

        # Verify required metadata is present
        assert result["total_leads_found"] == 50
        assert len(result["sample_companies"]) == 3
        assert len(result["sources"]) == 2

        # Verify token-efficiency: result should be under 500 chars
        assert len(result_str) < 500, (
            f"Tool result is {len(result_str)} chars — should be compact (<500)"
        )

    async def test_icp_flows_from_tool_args_to_discovery(self):
        """ICP criteria from LLM tool arguments flow through to lead_discovery_service."""
        svc = OrchestratorService()
        db = AsyncMock()
        workspace_id = uuid.uuid4()
        conversation_id = uuid.uuid4()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.status = "completed"

        with patch(
            "app.services.prospecting.lead_discovery_service.lead_discovery_service",
        ) as mock_discovery:
            mock_discovery.create_run = AsyncMock(return_value=mock_run)
            mock_discovery.execute_run = AsyncMock(return_value=mock_run)

            source_result = MagicMock()
            source_result.all.return_value = []
            company_result = MagicMock()
            company_result.all.return_value = []
            db.execute = AsyncMock(side_effect=[source_result, company_result])

            await svc._tool_search_leads(
                arguments={
                    "query": "B2B SaaS founders in Austin",
                    "industry": "SaaS",
                    "role": "Founder",
                    "location": "Austin, TX",
                    "company_type": "B2B",
                },
                db=db,
                workspace_id=workspace_id,
                conversation_id=conversation_id,
            )

        # Verify ICP was passed to create_run
        create_call = mock_discovery.create_run.call_args
        icp = create_call.kwargs.get("icp_criteria") or create_call[1].get("icp_criteria")
        assert icp["industry"] == "SaaS"
        assert icp["role"] == "Founder"
        assert icp["location"] == "Austin, TX"
        assert icp["company_type"] == "B2B"

    async def test_second_llm_call_receives_tool_result(self):
        """The second LLM call (chat_completion) receives tool results in messages."""
        svc = OrchestratorService()
        routing = _make_routing()
        db = AsyncMock()

        tool_metadata = json.dumps({
            "run_id": str(uuid.uuid4()),
            "total_leads_found": 8,
            "sources": {"web_scraper": 8},
            "sample_companies": ["FooBar Inc"],
        })

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_with_tools, \
            patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_completion, \
            patch.object(
            svc, "_handle_tool_call", new_callable=AsyncMock,
        ) as mock_handle:
            mock_with_tools.return_value = _mock_tool_call_response()
            mock_handle.return_value = tool_metadata
            mock_completion.return_value = "Found 8 leads from FooBar."

            await svc._run_with_tools(
                routing=routing,
                user_message="Find leads",
                conversation_history=[],
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
            )

        # Inspect the messages sent to the second LLM call
        second_call_messages = mock_completion.call_args[0][0]
        tool_messages = [m for m in second_call_messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        assert tool_messages[0]["content"] == tool_metadata
        assert tool_messages[0]["tool_call_id"] == "call_abc123"
