"""generate_copy tool — generates copy variants via the copywriting service."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

GENERATE_COPY_SCHEMA = {
    "type": "function",
    "function": {
        "name": "generate_copy",
        "description": (
            "Generate cold email copy variants for the leads in this conversation. "
            "Creates multiple subject line + body variants with different angles. "
            "Call this when the user wants to write emails, generate copy, "
            "or create outreach messages."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "tone": {
                    "type": "string",
                    "enum": ["professional", "casual", "formal", "bold"],
                    "description": "Tone for the copy (defaults to professional)",
                },
                "num_variants": {
                    "type": "integer",
                    "description": "Number of copy variants to generate (1-5, default 2)",
                },
                "segment_description": {
                    "type": "string",
                    "description": "Description of the target segment (e.g. 'CFOs in fintech startups')",
                },
            },
            "required": [],
        },
    },
}


async def handle_generate_copy(args: dict[str, Any], ctx: ToolContext) -> str:
    """Generate copy variants via the copywriting service."""
    try:
        from app.services.prospecting.copywriting_service import copywriting_service

        draft = await copywriting_service.generate_draft(
            db=ctx.db,
            workspace_id=ctx.workspace_id,
            conversation_id=ctx.conversation_id,
            segment_description=args.get("segment_description"),
            tone=args.get("tone", "professional"),
            num_variants=args.get("num_variants", 2),
        )

        variants = [
            {
                "subject": v.subject,
                "body": v.body,
                "variant_label": v.variant_label,
            }
            for v in draft.variants
        ]

        return json.dumps({
            "variants": variants,
            "segment_context": draft.metadata.get("segment_context", {}),
            "tone": draft.tone,
        })

    except Exception as e:
        logger.exception("generate_copy failed")
        return json.dumps({"error": str(e), "variants": []})


tool_registry.register(
    name="generate_copy",
    schema=GENERATE_COPY_SCHEMA,
    handler=handle_generate_copy,
    stages={"COPYWRITING", "CAMPAIGN_SETUP", "LAUNCH_READY"},
)
