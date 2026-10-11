"""list_leads tool — returns actual lead data for review without re-running search."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select, func

from app.models.prospecting import ProspectingLead, ProspectingRun
from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

LIST_LEADS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "list_leads",
        "description": (
            "List existing leads already discovered in this conversation. "
            "Returns up to 50 leads with name, company, title, email, source, "
            "quality score, and exclusion status. Also returns total_count. "
            "Use this when the user wants to REVIEW, VIEW, SHOW, or BROWSE "
            "existing leads. Do NOT use search_leads for reviewing — that "
            "runs a new search. Use list_leads instead."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "include_excluded": {
                    "type": "boolean",
                    "description": "Whether to include excluded/filtered leads. Defaults to false.",
                },
            },
            "required": [],
        },
    },
}


async def handle_list_leads(args: dict[str, Any], ctx: ToolContext) -> str:
    """Return actual lead data for all runs in the conversation."""
    include_excluded = args.get("include_excluded", False)

    try:
        # Get run IDs for this conversation
        run_result = await ctx.db.execute(
            select(ProspectingRun.id).where(
                ProspectingRun.conversation_id == ctx.conversation_id,
            )
        )
        run_ids = [r for r in run_result.scalars().all()]

        if not run_ids:
            return json.dumps({
                "leads": [],
                "total_count": 0,
                "has_leads": False,
                "message": "No leads discovered yet. Use search_leads to find prospects first.",
            })

        # Build query
        query = (
            select(ProspectingLead)
            .where(ProspectingLead.run_id.in_(run_ids))
            .order_by(ProspectingLead.quality_score.desc().nulls_last())
        )

        if not include_excluded:
            query = query.where(ProspectingLead.is_excluded == False)  # noqa: E712

        # Get total count
        count_q = (
            select(func.count())
            .select_from(ProspectingLead)
            .where(ProspectingLead.run_id.in_(run_ids))
        )
        if not include_excluded:
            count_q = count_q.where(ProspectingLead.is_excluded == False)  # noqa: E712

        total_result = await ctx.db.execute(count_q)
        total_count = total_result.scalar() or 0

        # Get excluded count for context
        excluded_result = await ctx.db.execute(
            select(func.count())
            .select_from(ProspectingLead)
            .where(
                ProspectingLead.run_id.in_(run_ids),
                ProspectingLead.is_excluded == True,  # noqa: E712
            )
        )
        excluded_count = excluded_result.scalar() or 0

        # Fetch up to 50 leads
        lead_result = await ctx.db.execute(query.limit(50))
        leads = lead_result.scalars().all()

        lead_data = [
            {
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "company": lead.company,
                "title": lead.title,
                "email": lead.email,
                "source_name": lead.source_name,
                "quality_score": lead.quality_score,
                "is_excluded": lead.is_excluded,
            }
            for lead in leads
        ]

        return json.dumps({
            "leads": lead_data,
            "total_count": total_count,
            "excluded_count": excluded_count,
            "showing": len(lead_data),
            "has_leads": True,
        })

    except Exception as e:
        logger.exception("list_leads failed")
        return json.dumps({"error": str(e), "has_leads": False})


# Register with the global registry
tool_registry.register(
    name="list_leads",
    schema=LIST_LEADS_SCHEMA,
    handler=handle_list_leads,
    stages={"DISCOVERY", "SELECTION"},
)
