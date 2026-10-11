"""create_campaign tool — creates a campaign draft via the campaign builder."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

CREATE_CAMPAIGN_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_campaign",
        "description": (
            "Create a campaign draft from the current conversation's leads and copy. "
            "Requires a lead list ID and campaign name. Wires leads, copy variants, "
            "and sending accounts into a campaign ready for launch. "
            "Call this when the user wants to create or set up a campaign."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "campaign_name": {
                    "type": "string",
                    "description": "Name for the new campaign",
                },
                "lead_list_id": {
                    "type": "string",
                    "description": "UUID of the lead list to use",
                },
                "copy_variant_indices": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Indices of copy variants to include (from generate_copy results)",
                },
            },
            "required": ["campaign_name", "lead_list_id"],
        },
    },
}


async def handle_create_campaign(args: dict[str, Any], ctx: ToolContext) -> str:
    """Create a campaign draft via the campaign builder service."""
    try:
        from app.services.prospecting.campaign_builder_service import campaign_builder_service
        from sqlalchemy import select
        from app.models.prospecting import ProspectingConversation

        campaign_name = args.get("campaign_name", "Untitled Campaign")
        lead_list_id = uuid.UUID(args["lead_list_id"])

        # Get copy variants from conversation metadata or use defaults
        copy_variants = [
            {"subject": "Hello {{first_name}}", "body": "I noticed {{company}}..."},
        ]

        # Try to get copy variants from the conversation's latest message metadata
        conv_result = await ctx.db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == ctx.conversation_id,
                ProspectingConversation.workspace_id == ctx.workspace_id,
            )
        )
        conv = conv_result.scalar_one_or_none()
        if conv and conv.metadata_json:
            saved_variants = conv.metadata_json.get("copy_variants", [])
            if saved_variants:
                copy_variants = saved_variants

        result = await campaign_builder_service.create_campaign_draft(
            db=ctx.db,
            workspace_id=ctx.workspace_id,
            conversation_id=ctx.conversation_id,
            campaign_name=campaign_name,
            lead_list_id=lead_list_id,
            copy_variants=copy_variants,
        )

        # Store campaign_id in conversation metadata
        if result.campaign_id and conv:
            meta = conv.metadata_json or {}
            meta["campaign_id"] = str(result.campaign_id)
            conv.metadata_json = meta
            await ctx.db.flush()

        return json.dumps({
            "campaign_id": str(result.campaign_id) if result.campaign_id else None,
            "leads_added": result.metadata.get("leads_added", 0),
            "variants_created": result.metadata.get("variants_created", 0),
            "accounts_added": result.metadata.get("accounts_added", 0),
            "launch_status": result.launch_status,
        })

    except Exception as e:
        logger.exception("create_campaign failed")
        return json.dumps({"error": str(e)})


tool_registry.register(
    name="create_campaign",
    schema=CREATE_CAMPAIGN_SCHEMA,
    handler=handle_create_campaign,
    stages={"CAMPAIGN_SETUP", "LAUNCH_READY"},
)
