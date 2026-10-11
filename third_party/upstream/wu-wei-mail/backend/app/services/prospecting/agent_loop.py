"""Iterative agent loop — replaces single-pass tool calling with multi-step reasoning.

The loop lets the LLM:
1. Reason about what to do
2. Call one or more tools
3. Observe results
4. Call more tools or respond to the user

This replaces the old _run_with_tools which only did: LLM → tool → LLM → done.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from app.services.prospecting.tool_registry import ToolContext, ToolRegistry

logger = logging.getLogger(__name__)


@dataclass
class ToolCallRecord:
    """Record of a single tool call made during the loop."""
    tool_name: str
    arguments: dict[str, Any]
    result: str
    iteration: int


@dataclass
class AgentLoopResult:
    """Result from the iterative agent loop."""
    content: str  # Final assistant text
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    iterations: int = 0
    total_tokens: int | None = None
    model_used: str | None = None
    terminated_by: str = "natural"  # "natural" | "max_iterations" | "error"


async def run_agent_loop(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_registry: ToolRegistry,
    ctx: ToolContext,
    *,
    max_iterations: int = 5,
    model: str | None = None,
) -> AgentLoopResult:
    """Iterative tool-calling loop.

    1. Call LLM with messages + tool schemas.
    2. If response has no tool_calls → done, return content as final answer.
    3. For each tool_call: execute via registry, append result.
    4. If iteration count < max_iterations, go to step 1.
    5. If max iterations reached, ask LLM to summarize (no tools).

    Args:
        messages: Conversation messages (system + history + user).
        tools: OpenAI-format tool schemas for the current stage.
        tool_registry: Registry to execute tool calls.
        ctx: Shared context (db, workspace_id, conversation_id).
        max_iterations: Safety limit to prevent runaway loops.
        model: Override model ID for the LLM.

    Returns:
        AgentLoopResult with final text, tool call records, and metadata.
    """
    from app.utils.openrouter_client import chat_completion, chat_completion_with_tools

    all_tool_calls: list[ToolCallRecord] = []
    working_messages = list(messages)  # don't mutate the caller's list
    total_tokens = 0
    iteration = 0

    while iteration < max_iterations:
        iteration += 1

        try:
            if tools:
                # Call LLM with tools available
                assistant_message = await chat_completion_with_tools(
                    messages=working_messages,
                    tools=tools,
                    model=model,
                )
            else:
                # No tools available — plain completion
                response_text = await chat_completion(
                    messages=working_messages,
                    model=model,
                )
                return AgentLoopResult(
                    content=response_text,
                    tool_calls=all_tool_calls,
                    iterations=iteration,
                    total_tokens=total_tokens or None,
                    terminated_by="natural",
                )
        except Exception as e:
            logger.exception("Agent loop LLM call failed at iteration %d", iteration)
            # Return whatever we have so far, or an error message
            if all_tool_calls:
                return AgentLoopResult(
                    content=f"I encountered an issue while processing. Here's what I found so far based on the tools I've already used.",
                    tool_calls=all_tool_calls,
                    iterations=iteration,
                    total_tokens=total_tokens or None,
                    model_used=model,
                    terminated_by="error",
                )
            raise

        # Accumulate token usage from response
        usage = assistant_message.pop("_usage", None)
        if usage:
            total_tokens += usage.get("total_tokens", 0)

        tool_calls_in_response = assistant_message.get("tool_calls", [])

        if not tool_calls_in_response:
            # LLM responded with text — we're done
            content = assistant_message.get("content", "")
            if not content:
                content = "I'm not sure how to help with that. Could you provide more details?"
            return AgentLoopResult(
                content=content,
                tool_calls=all_tool_calls,
                iterations=iteration,
                total_tokens=total_tokens or None,
                model_used=model,
                terminated_by="natural",
            )

        # LLM wants to call tools — execute them
        working_messages.append(assistant_message)

        for tc in tool_calls_in_response:
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            try:
                arguments = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {}

            # Execute tool via registry
            result_str = await tool_registry.execute(tool_name, arguments, ctx)

            # Append tool result to messages
            working_messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": result_str,
            })

            all_tool_calls.append(ToolCallRecord(
                tool_name=tool_name,
                arguments=arguments,
                result=result_str,
                iteration=iteration,
            ))

    # Max iterations reached — ask LLM to summarize without tools
    logger.warning("Agent loop reached max_iterations=%d", max_iterations)
    working_messages.append({
        "role": "system",
        "content": "You have reached the maximum number of tool calls. Please summarize your findings for the user based on the tool results you've received so far.",
    })

    try:
        final_response = await chat_completion(
            messages=working_messages,
            model=model,
        )
    except Exception:
        final_response = "I've completed several steps but reached my processing limit. Here's a summary of what I found."

    return AgentLoopResult(
        content=final_response,
        tool_calls=all_tool_calls,
        iterations=iteration,
        total_tokens=total_tokens or None,
        model_used=model,
        terminated_by="max_iterations",
    )


async def run_agent_loop_streaming(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_registry: ToolRegistry,
    ctx: ToolContext,
    *,
    max_iterations: int = 5,
    model: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Streaming variant of the agent loop.

    Yields SSE-format event dicts as the loop progresses:
    - {"event": "status", "data": {"type": "thinking", "message": "..."}}
    - {"event": "tool_call", "data": {"tool": "...", "args": {...}}}
    - {"event": "tool_result", "data": {"tool": "...", "summary": "..."}}
    - {"event": "token", "data": {"text": "..."}}
    - {"event": "done", "data": {"message_id": "...", "tool_calls": [...], ...}}

    Tool-calling iterations are non-streaming (structured JSON).
    Only the final response to the user is streamed token-by-token.
    """
    from app.utils.openrouter_client import (
        chat_completion_streaming,
        chat_completion_with_tools,
    )

    all_tool_calls: list[ToolCallRecord] = []
    working_messages = list(messages)
    total_tokens = 0
    iteration = 0

    while iteration < max_iterations:
        iteration += 1

        yield {"event": "status", "data": {"type": "thinking", "message": f"Reasoning (step {iteration})..."}}

        try:
            if tools:
                assistant_message = await chat_completion_with_tools(
                    messages=working_messages,
                    tools=tools,
                    model=model,
                )
            else:
                # No tools — stream the final response directly
                full_text = ""
                async for delta in chat_completion_streaming(
                    messages=working_messages, model=model,
                ):
                    full_text += delta
                    yield {"event": "token", "data": {"text": delta}}

                yield {
                    "event": "done",
                    "data": {
                        "content": full_text,
                        "tool_calls": [
                            {"tool": tc.tool_name, "args": tc.arguments}
                            for tc in all_tool_calls
                        ],
                        "iterations": iteration,
                        "total_tokens": total_tokens or None,
                        "model_used": model,
                        "terminated_by": "natural",
                    },
                }
                return
        except Exception:
            logger.exception("Streaming agent loop LLM call failed at iteration %d", iteration)
            if all_tool_calls:
                yield {
                    "event": "done",
                    "data": {
                        "content": "I encountered an issue while processing. Here's what I found so far.",
                        "tool_calls": [
                            {"tool": tc.tool_name, "args": tc.arguments}
                            for tc in all_tool_calls
                        ],
                        "iterations": iteration,
                        "total_tokens": total_tokens or None,
                        "model_used": model,
                        "terminated_by": "error",
                    },
                }
                return
            raise

        # Accumulate token usage from response
        usage = assistant_message.pop("_usage", None)
        if usage:
            total_tokens += usage.get("total_tokens", 0)

        tool_calls_in_response = assistant_message.get("tool_calls", [])

        if not tool_calls_in_response:
            # LLM responded with text — stream it as a single token event
            content = assistant_message.get("content", "") or "Could you provide more details?"
            yield {"event": "token", "data": {"text": content}}
            yield {
                "event": "done",
                "data": {
                    "content": content,
                    "tool_calls": [
                        {"tool": tc.tool_name, "args": tc.arguments}
                        for tc in all_tool_calls
                    ],
                    "iterations": iteration,
                    "total_tokens": total_tokens or None,
                    "model_used": model,
                    "terminated_by": "natural",
                },
            }
            return

        # Execute tool calls (non-streaming)
        working_messages.append(assistant_message)

        for tc in tool_calls_in_response:
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            try:
                arguments = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {}

            yield {"event": "tool_call", "data": {"tool": tool_name, "args": arguments}}

            result_str = await tool_registry.execute(tool_name, arguments, ctx)

            # Build a short summary for the event
            try:
                result_data = json.loads(result_str)
                summary = result_data.get("error") or f"Found {result_data.get('total_leads_found', '?')} results"
            except (json.JSONDecodeError, AttributeError):
                summary = result_str[:100]

            yield {"event": "tool_result", "data": {"tool": tool_name, "summary": summary}}

            working_messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": result_str,
            })

            all_tool_calls.append(ToolCallRecord(
                tool_name=tool_name,
                arguments=arguments,
                result=result_str,
                iteration=iteration,
            ))

    # Max iterations — stream final summary
    yield {"event": "status", "data": {"type": "thinking", "message": "Summarizing findings..."}}
    working_messages.append({
        "role": "system",
        "content": "You have reached the maximum number of tool calls. Please summarize your findings.",
    })

    full_text = ""
    try:
        async for delta in chat_completion_streaming(
            messages=working_messages, model=model,
        ):
            full_text += delta
            yield {"event": "token", "data": {"text": delta}}
    except Exception:
        full_text = "I've completed several steps but reached my processing limit."
        yield {"event": "token", "data": {"text": full_text}}

    yield {
        "event": "done",
        "data": {
            "content": full_text,
            "tool_calls": [
                {"tool": tc.tool_name, "args": tc.arguments}
                for tc in all_tool_calls
            ],
            "iterations": iteration,
            "total_tokens": total_tokens or None,
            "model_used": model,
            "terminated_by": "max_iterations",
        },
    }
