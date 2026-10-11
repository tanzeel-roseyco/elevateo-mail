"""get_campaign_status tool — gets status/stats for the conversation's campaign."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select, func

from app.models.prospecting import ProspectingConversation
from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

GET_CAMPAIGN_STATUS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "get_campaign_status",
        "description": (
            "Get the status and statistics of the campaign created in this conversation. "
            "Returns campaign status, lead count, and email metrics (sent, opens, replies, bounces). "
            "Call this when the user asks about campaign performance or status."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}


async def handle_get_campaign_status(args: dict[str, Any], ctx: ToolContext) -> str:
    """Get campaign status from conversation metadata."""
    try:
        # Get campaign_id from conversation metadata
        conv_result = await ctx.db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == ctx.conversation_id,
                ProspectingConversation.workspace_id == ctx.workspace_id,
            )
        )
        conv = conv_result.scalar_one_or_none()
        if not conv:
            return json.dumps({"error": "Conversation not found"})

        meta = conv.metadata_json or {}
        campaign_id_str = meta.get("campaign_id")
        if not campaign_id_str:
            return json.dumps({
                "error": "No campaign created yet in this conversation.",
                "status": "none",
            })

        import uuid
        campaign_id = uuid.UUID(campaign_id_str)

        # Query campaign
        from app.models.campaign import Campaign
        from app.models.sent_email import SentEmail

        campaign_result = await ctx.db.execute(
            select(Campaign).where(
                Campaign.id == campaign_id,
                Campaign.workspace_id == ctx.workspace_id,
            )
        )
        campaign = campaign_result.scalar_one_or_none()
        if not campaign:
            return json.dumps({"error": "Campaign not found", "status": "deleted"})

        # Get email metrics from SentEmail + EmailEvent
        sent_count = 0
        opens = 0
        replies = 0
        bounces = 0
        try:
            from app.models.email_event import EmailEvent

            # Count sent emails
            sent_result = await ctx.db.execute(
                select(func.count()).select_from(SentEmail).where(
                    SentEmail.campaign_id == campaign_id,
                )
            )
            sent_count = sent_result.scalar() or 0

            # Count events by type
            if sent_count > 0:
                event_result = await ctx.db.execute(
                    select(
                        EmailEvent.event_type,
                        func.count(),
                    )
                    .join(SentEmail, EmailEvent.sent_email_id == SentEmail.id)
                    .where(SentEmail.campaign_id == campaign_id)
                    .group_by(EmailEvent.event_type)
                )
                for event_type, count in event_result.all():
                    if event_type == "open":
                        opens = count
                    elif event_type == "reply":
                        replies = count
                    elif event_type == "bounce":
                        bounces = count
        except Exception:
            # Metrics may not be available — that's OK
            pass

        # Get lead count from campaign_leads relationship
        lead_count = len(campaign.campaign_leads) if hasattr(campaign, 'campaign_leads') and campaign.campaign_leads else 0

        return json.dumps({
            "campaign_id": str(campaign.id),
            "name": campaign.name,
            "status": campaign.status,
            "lead_count": lead_count,
            "sent": sent_count,
            "opens": opens,
            "replies": replies,
            "bounces": bounces,
        })

    except Exception as e:
        logger.exception("get_campaign_status failed")
        return json.dumps({"error": str(e)})


tool_registry.register(
    name="get_campaign_status",
    schema=GET_CAMPAIGN_STATUS_SCHEMA,
    handler=handle_get_campaign_status,
    stages={"LAUNCH_READY", "LAUNCHED"},
)
