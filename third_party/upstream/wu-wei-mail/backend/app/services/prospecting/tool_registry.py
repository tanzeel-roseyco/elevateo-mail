"""Tool registry — decouples tool definitions from the orchestrator.

Each tool declares which journey stages it's available in.
The registry provides schemas to the LLM and executes tool calls.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class ToolContext:
    """Shared context passed to every tool handler."""
    db: AsyncSession
    workspace_id: uuid.UUID
    conversation_id: uuid.UUID


@dataclass
class ToolDef:
    """A registered tool: schema + handler + stage gates."""
    name: str
    schema: dict[str, Any]  # OpenAI function-calling format
    handler: Callable[[dict[str, Any], ToolContext], Awaitable[str]]
    stages: set[str] | None = None  # None = available in all stages


class ToolRegistry:
    """Registry of tools available to the agent loop."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}

    def register(
        self,
        name: str,
        schema: dict[str, Any],
        handler: Callable[[dict[str, Any], ToolContext], Awaitable[str]],
        stages: set[str] | None = None,
    ) -> None:
        """Register a tool with its schema, handler, and optional stage gates."""
        self._tools[name] = ToolDef(
            name=name,
            schema=schema,
            handler=handler,
            stages=stages,
        )

    def get_tools_for_stage(self, stage: str) -> list[dict[str, Any]]:
        """Return OpenAI-format tool schemas available in the given stage."""
        tools = []
        for tool_def in self._tools.values():
            if tool_def.stages is None or stage in tool_def.stages:
                tools.append(tool_def.schema)
        return tools

    def get_tool_names_for_stage(self, stage: str) -> list[str]:
        """Return tool names available in the given stage."""
        names = []
        for tool_def in self._tools.values():
            if tool_def.stages is None or stage in tool_def.stages:
                names.append(tool_def.name)
        return names

    async def execute(self, name: str, args: dict[str, Any], ctx: ToolContext) -> str:
        """Execute a tool by name. Returns JSON string result."""
        tool_def = self._tools.get(name)
        if not tool_def:
            return json.dumps({"error": f"Unknown tool: {name}"})

        try:
            return await tool_def.handler(args, ctx)
        except Exception as e:
            logger.exception("Tool '%s' failed", name)
            return json.dumps({"error": f"Tool execution failed: {str(e)}"})

    @property
    def tool_names(self) -> list[str]:
        return list(self._tools.keys())


# ---------------------------------------------------------------------------
# Global registry instance — tools register themselves at import time
# ---------------------------------------------------------------------------

tool_registry = ToolRegistry()
