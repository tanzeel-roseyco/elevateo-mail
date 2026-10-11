"""Tests for the iterative agent loop.

Covers:
- Natural termination when LLM returns text (no tool_calls)
- Tool execution and result feedback
- Max iterations termination
- Tool failure recovery
- Empty tools list (plain completion path)
- Malformed tool call arguments
- LLM error handling (with and without prior tool calls)
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.prospecting.agent_loop import (
    AgentLoopResult,
    ToolCallRecord,
    run_agent_loop,
)
from app.services.prospecting.tool_registry import ToolContext, ToolRegistry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ctx() -> ToolContext:
    return ToolContext(
        db=AsyncMock(),
        workspace_id=uuid.uuid4(),
        conversation_id=uuid.uuid4(),
    )


def _make_text_response(text: str = "Here are your results!") -> dict:
    return {"role": "assistant", "content": text}


def _make_tool_call_response(
    tool_name: str = "search_leads",
    arguments: dict | None = None,
    call_id: str = "call_abc123",
) -> dict:
    if arguments is None:
        arguments = {"query": "SaaS CTOs"}
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


def _make_registry_with_tool(
    tool_name: str = "search_leads",
    result: str = '{"total_leads_found": 10}',
) -> ToolRegistry:
    """Create a ToolRegistry with one mock tool."""
    registry = ToolRegistry()
    handler = AsyncMock(return_value=result)
    registry.register(
        name=tool_name,
        schema={"type": "function", "function": {"name": tool_name, "parameters": {}}},
        handler=handler,
        stages=None,
    )
    return registry


# ===========================================================================
# 1. Natural termination — LLM returns text, no tool calls
# ===========================================================================

class TestNaturalTermination:
    """Agent loop terminates when LLM responds with text (no tool_calls)."""

    async def test_text_response_returns_immediately(self):
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = _make_text_response("I can help with that!")

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "hello"}],
                tools=[{"type": "function", "function": {"name": "test"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.content == "I can help with that!"
        assert result.tool_calls == []
        assert result.iterations == 1
        assert result.terminated_by == "natural"

    async def test_empty_content_gets_default(self):
        """If LLM returns no content and no tool_calls, default message is used."""
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = {"role": "assistant", "content": ""}

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "hello"}],
                tools=[{"type": "function", "function": {"name": "test"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert "more details" in result.content.lower()
        assert result.terminated_by == "natural"


# ===========================================================================
# 2. No tools — plain completion path
# ===========================================================================

class TestNoToolsPath:
    """When tools list is empty, use plain chat_completion."""

    async def test_empty_tools_uses_chat_completion(self):
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = "Plain response without tools."

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "hello"}],
                tools=[],
                tool_registry=registry,
                ctx=ctx,
            )

        mock_llm.assert_called_once()
        assert result.content == "Plain response without tools."
        assert result.iterations == 1
        assert result.terminated_by == "natural"
        assert result.tool_calls == []


# ===========================================================================
# 3. Tool execution and feedback
# ===========================================================================

class TestToolExecution:
    """Agent loop executes tools and feeds results back to LLM."""

    async def test_single_tool_call_then_text(self):
        """LLM calls one tool, gets result, then responds with text."""
        registry = _make_registry_with_tool("search_leads", '{"total": 10}')
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            # First call: LLM requests a tool call
            # Second call: LLM responds with text after seeing tool result
            mock_llm.side_effect = [
                _make_tool_call_response("search_leads", {"query": "SaaS"}),
                _make_text_response("Found 10 leads in SaaS."),
            ]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "Find SaaS leads"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.content == "Found 10 leads in SaaS."
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].tool_name == "search_leads"
        assert result.tool_calls[0].arguments == {"query": "SaaS"}
        assert result.tool_calls[0].result == '{"total": 10}'
        assert result.tool_calls[0].iteration == 1
        assert result.iterations == 2
        assert result.terminated_by == "natural"

    async def test_multiple_tool_calls_in_one_response(self):
        """LLM returns multiple tool_calls in a single response."""
        registry = ToolRegistry()
        handler = AsyncMock(side_effect=['{"total": 5}', '{"total": 8}'])
        registry.register(
            name="search_leads",
            schema={"type": "function", "function": {"name": "search_leads"}},
            handler=handler,
            stages=None,
        )
        ctx = _make_ctx()

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

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = [
                multi_tool_response,
                _make_text_response("Found leads in both sectors."),
            ]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "Search SaaS and Healthcare"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.content == "Found leads in both sectors."
        assert len(result.tool_calls) == 2
        assert result.tool_calls[0].arguments == {"query": "SaaS"}
        assert result.tool_calls[1].arguments == {"query": "Healthcare"}
        assert handler.call_count == 2

    async def test_multi_iteration_tool_calls(self):
        """LLM calls tools across two iterations before responding."""
        registry = _make_registry_with_tool("search_leads", '{"total": 5}')
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = [
                _make_tool_call_response("search_leads", {"query": "round1"}, "call_1"),
                _make_tool_call_response("search_leads", {"query": "round2"}, "call_2"),
                _make_text_response("Done with two rounds."),
            ]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "Search deeply"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.iterations == 3
        assert len(result.tool_calls) == 2
        assert result.tool_calls[0].iteration == 1
        assert result.tool_calls[1].iteration == 2
        assert result.terminated_by == "natural"

    async def test_tool_result_appended_to_messages(self):
        """Tool results are correctly appended as 'tool' role messages."""
        registry = _make_registry_with_tool("search_leads", '{"total": 42}')
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = [
                _make_tool_call_response("search_leads", {"query": "test"}, "call_x"),
                _make_text_response("Done."),
            ]

            await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        # The second LLM call should have received tool result messages
        second_call_messages = mock_llm.call_args_list[1][1].get("messages") or mock_llm.call_args_list[1][0][0]
        tool_msgs = [m for m in second_call_messages if m.get("role") == "tool"]
        assert len(tool_msgs) == 1
        assert tool_msgs[0]["content"] == '{"total": 42}'
        assert tool_msgs[0]["tool_call_id"] == "call_x"


# ===========================================================================
# 4. Max iterations termination
# ===========================================================================

class TestMaxIterations:
    """Agent loop stops after max_iterations and asks LLM to summarize."""

    async def test_max_iterations_triggers_summary(self):
        registry = _make_registry_with_tool("search_leads")
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_tool_llm, \
            patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_plain_llm:
            # LLM always wants to call tools (never naturally terminates)
            mock_tool_llm.return_value = _make_tool_call_response()
            # Final summary call
            mock_plain_llm.return_value = "Here's a summary of my findings."

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
                max_iterations=2,
            )

        assert result.terminated_by == "max_iterations"
        assert result.iterations == 2
        assert result.content == "Here's a summary of my findings."
        assert len(result.tool_calls) == 2  # one per iteration
        # Summary LLM call was made (plain, no tools)
        mock_plain_llm.assert_called_once()

    async def test_max_iterations_summary_failure_uses_fallback(self):
        """If summary LLM call fails, use a hardcoded fallback."""
        registry = _make_registry_with_tool("search_leads")
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_tool_llm, \
            patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_plain_llm:
            mock_tool_llm.return_value = _make_tool_call_response()
            mock_plain_llm.side_effect = RuntimeError("API down")

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
                max_iterations=1,
            )

        assert result.terminated_by == "max_iterations"
        assert "processing limit" in result.content.lower()


# ===========================================================================
# 5. Tool failure recovery
# ===========================================================================

class TestToolFailureRecovery:
    """Tools that raise exceptions return error JSON to the LLM."""

    async def test_tool_exception_returns_error_json(self):
        """If a tool handler raises, the registry returns error JSON."""
        registry = ToolRegistry()
        handler = AsyncMock(side_effect=RuntimeError("DB timeout"))
        registry.register(
            name="search_leads",
            schema={"type": "function", "function": {"name": "search_leads"}},
            handler=handler,
            stages=None,
        )
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = [
                _make_tool_call_response("search_leads"),
                _make_text_response("The search failed, but I can try again."),
            ]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.terminated_by == "natural"
        assert len(result.tool_calls) == 1
        # The error was captured in the tool result
        assert "error" in result.tool_calls[0].result.lower()
        assert "DB timeout" in result.tool_calls[0].result

    async def test_unknown_tool_returns_error_json(self):
        """Unknown tool name returns error JSON, loop continues."""
        registry = ToolRegistry()  # Empty — no tools registered
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = [
                _make_tool_call_response("nonexistent_tool"),
                _make_text_response("I couldn't find that tool."),
            ]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "nonexistent_tool"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.terminated_by == "natural"
        assert "nonexistent_tool" in result.tool_calls[0].result


# ===========================================================================
# 6. LLM error handling
# ===========================================================================

class TestLLMErrorHandling:
    """Handle LLM call failures during the loop."""

    async def test_first_iteration_error_propagates(self):
        """If LLM fails on first call with no prior tools, exception propagates."""
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = RuntimeError("API unavailable")

            with pytest.raises(RuntimeError, match="API unavailable"):
                await run_agent_loop(
                    messages=[{"role": "user", "content": "test"}],
                    tools=[{"type": "function", "function": {"name": "test"}}],
                    tool_registry=registry,
                    ctx=ctx,
                )

    async def test_error_after_tool_calls_returns_partial(self):
        """If LLM fails after successful tool calls, return partial result."""
        registry = _make_registry_with_tool("search_leads", '{"total": 5}')
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            # First call: tool call succeeds
            # Second call: LLM fails
            mock_llm.side_effect = [
                _make_tool_call_response("search_leads"),
                RuntimeError("API timeout"),
            ]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.terminated_by == "error"
        assert len(result.tool_calls) == 1
        assert "encountered an issue" in result.content.lower()

    async def test_plain_completion_error_propagates(self):
        """If chat_completion fails when no tools available, exception propagates."""
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = RuntimeError("API down")

            with pytest.raises(RuntimeError, match="API down"):
                await run_agent_loop(
                    messages=[{"role": "user", "content": "test"}],
                    tools=[],
                    tool_registry=registry,
                    ctx=ctx,
                )


# ===========================================================================
# 7. Malformed arguments handling
# ===========================================================================

class TestMalformedArguments:
    """Handle malformed tool call arguments gracefully."""

    async def test_invalid_json_arguments_default_to_empty(self):
        registry = _make_registry_with_tool("search_leads")
        ctx = _make_ctx()

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

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.side_effect = [bad_response, _make_text_response("Done.")]

            result = await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "search_leads"}}],
                tool_registry=registry,
                ctx=ctx,
            )

        assert result.tool_calls[0].arguments == {}
        assert result.terminated_by == "natural"


# ===========================================================================
# 8. Model passthrough
# ===========================================================================

class TestModelPassthrough:
    """Model parameter is forwarded to LLM calls."""

    async def test_model_passed_to_tool_llm(self):
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion_with_tools",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = _make_text_response("ok")

            await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[{"type": "function", "function": {"name": "test"}}],
                tool_registry=registry,
                ctx=ctx,
                model="openai/gpt-4o",
            )

        assert mock_llm.call_args[1].get("model") == "openai/gpt-4o"

    async def test_model_passed_to_plain_llm(self):
        registry = ToolRegistry()
        ctx = _make_ctx()

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_llm:
            mock_llm.return_value = "ok"

            await run_agent_loop(
                messages=[{"role": "user", "content": "test"}],
                tools=[],
                tool_registry=registry,
                ctx=ctx,
                model="anthropic/claude-3-haiku",
            )

        assert mock_llm.call_args[1].get("model") == "anthropic/claude-3-haiku"


# ===========================================================================
# 9. Dataclass validation
# ===========================================================================

class TestDataclasses:
    """Verify dataclass defaults and structure."""

    def test_agent_loop_result_defaults(self):
        result = AgentLoopResult(content="test")
        assert result.tool_calls == []
        assert result.iterations == 0
        assert result.total_tokens is None
        assert result.terminated_by == "natural"

    def test_tool_call_record_fields(self):
        record = ToolCallRecord(
            tool_name="search_leads",
            arguments={"query": "test"},
            result='{"total": 5}',
            iteration=1,
        )
        assert record.tool_name == "search_leads"
        assert record.arguments == {"query": "test"}
        assert record.result == '{"total": 5}'
        assert record.iteration == 1
