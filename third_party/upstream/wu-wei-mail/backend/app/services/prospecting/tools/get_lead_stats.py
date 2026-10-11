"""get_lead_stats tool — returns lead statistics for the current conversation."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select, func

from app.models.prospecting import ProspectingLead, ProspectingRun
from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

GET_LEAD_STATS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "get_lead_stats",
        "description": (
            "Get lead statistics for the current conversation: total count, "
            "quality breakdown by readiness band, top companies, and top industries. "
            "Call this when the user asks about their leads, wants a summary, "
            "or before making decisions about lead selection."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}


async def handle_get_lead_stats(args: dict[str, Any], ctx: ToolContext) -> str:
    """Query lead statistics for the conversation."""
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
                "total": 0,
                "message": "No discovery runs found for this conversation.",
            })

        # Total lead count
        total_result = await ctx.db.execute(
            select(func.count()).select_from(ProspectingLead).where(
                ProspectingLead.run_id.in_(run_ids),
            )
        )
        total = total_result.scalar() or 0

        # Readiness band breakdown
        band_result = await ctx.db.execute(
            select(
                ProspectingLead.readiness_band,
                func.count(),
            ).where(
                ProspectingLead.run_id.in_(run_ids),
            ).group_by(ProspectingLead.readiness_band)
        )
        by_readiness = {row[0] or "unscored": row[1] for row in band_result.all()}

        # Source breakdown
        source_result = await ctx.db.execute(
            select(
                ProspectingLead.source_name,
                func.count(),
            ).where(
                ProspectingLead.run_id.in_(run_ids),
            ).group_by(ProspectingLead.source_name)
        )
        by_source = {row[0] or "unknown": row[1] for row in source_result.all()}

        # Top companies
        company_result = await ctx.db.execute(
            select(
                ProspectingLead.company,
                func.count(),
            ).where(
                ProspectingLead.run_id.in_(run_ids),
                ProspectingLead.company.isnot(None),
            ).group_by(ProspectingLead.company)
            .order_by(func.count().desc())
            .limit(10)
        )
        top_companies = [row[0] for row in company_result.all()]

        # Top industries
        industry_result = await ctx.db.execute(
            select(
                ProspectingLead.industry,
                func.count(),
            ).where(
                ProspectingLead.run_id.in_(run_ids),
                ProspectingLead.industry.isnot(None),
            ).group_by(ProspectingLead.industry)
            .order_by(func.count().desc())
            .limit(5)
        )
        top_industries = [row[0] for row in industry_result.all()]

        return json.dumps({
            "total": total,
            "by_readiness_band": by_readiness,
            "by_source": by_source,
            "top_companies": top_companies,
            "top_industries": top_industries,
        })

    except Exception as e:
        logger.exception("get_lead_stats failed")
        return json.dumps({"error": str(e)})


tool_registry.register(
    name="get_lead_stats",
    schema=GET_LEAD_STATS_SCHEMA,
    handler=handle_get_lead_stats,
    stages=None,  # Available in all stages
)
