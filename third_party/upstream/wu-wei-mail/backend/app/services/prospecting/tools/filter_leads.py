"""filter_leads tool — exclude leads by criteria for curation."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select, func, update, or_

from app.models.prospecting import ProspectingLead, ProspectingRun
from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

FILTER_LEADS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "filter_leads",
        "description": (
            "Exclude/filter out leads by criteria. Sets is_excluded=True on "
            "matching leads. Use this when the user wants to remove, exclude, "
            "or filter out leads that don't fit their needs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "exclude_companies": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Company names to exclude (case-insensitive partial match)",
                },
                "exclude_industries": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Industries to exclude (case-insensitive partial match)",
                },
                "exclude_titles": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Job titles to exclude (case-insensitive partial match)",
                },
                "min_quality_score": {
                    "type": "number",
                    "description": "Exclude leads below this quality score (0.0-1.0)",
                },
                "require_email": {
                    "type": "boolean",
                    "description": "If true, exclude leads without an email address",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief reason for the exclusion (for audit trail)",
                },
            },
            "required": ["reason"],
        },
    },
}


async def handle_filter_leads(args: dict[str, Any], ctx: ToolContext) -> str:
    """Exclude leads matching the given criteria."""
    reason = args.get("reason", "filtered by agent")
    exclude_companies = args.get("exclude_companies", [])
    exclude_industries = args.get("exclude_industries", [])
    exclude_titles = args.get("exclude_titles", [])
    min_quality_score = args.get("min_quality_score")
    require_email = args.get("require_email", False)

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
                "filtered_count": 0,
                "remaining_count": 0,
                "message": "No leads to filter. Run a discovery first.",
            })

        # Build conditions for leads to exclude
        conditions = []

        if exclude_companies:
            company_conditions = [
                ProspectingLead.company.ilike(f"%{c}%")
                for c in exclude_companies
            ]
            conditions.append(or_(*company_conditions))

        if exclude_industries:
            industry_conditions = [
                ProspectingLead.industry.ilike(f"%{ind}%")
                for ind in exclude_industries
            ]
            conditions.append(or_(*industry_conditions))

        if exclude_titles:
            title_conditions = [
                ProspectingLead.title.ilike(f"%{t}%")
                for t in exclude_titles
            ]
            conditions.append(or_(*title_conditions))

        if min_quality_score is not None:
            conditions.append(
                or_(
                    ProspectingLead.quality_score < min_quality_score,
                    ProspectingLead.quality_score.is_(None),
                )
            )

        if require_email:
            conditions.append(
                or_(
                    ProspectingLead.email.is_(None),
                    ProspectingLead.email == "",
                )
            )

        if not conditions:
            return json.dumps({
                "filtered_count": 0,
                "remaining_count": 0,
                "message": "No filter criteria provided.",
            })

        # Combine all conditions with OR — any match gets excluded
        combined = or_(*conditions)

        # Update matching leads that aren't already excluded
        result = await ctx.db.execute(
            update(ProspectingLead)
            .where(
                ProspectingLead.run_id.in_(run_ids),
                ProspectingLead.is_excluded == False,  # noqa: E712
                combined,
            )
            .values(
                is_excluded=True,
                exclusion_reason="AGENT_FILTER",
                exclusion_detail=reason,
            )
        )
        filtered_count = result.rowcount  # type: ignore[union-attr]

        # Get remaining count
        remaining_result = await ctx.db.execute(
            select(func.count())
            .select_from(ProspectingLead)
            .where(
                ProspectingLead.run_id.in_(run_ids),
                ProspectingLead.is_excluded == False,  # noqa: E712
            )
        )
        remaining_count = remaining_result.scalar() or 0

        await ctx.db.flush()

        return json.dumps({
            "filtered_count": filtered_count,
            "remaining_count": remaining_count,
            "reason": reason,
            "has_leads": remaining_count > 0,
        })

    except Exception as e:
        logger.exception("filter_leads failed")
        return json.dumps({"error": str(e)})


# Register with the global registry
tool_registry.register(
    name="filter_leads",
    schema=FILTER_LEADS_SCHEMA,
    handler=handle_filter_leads,
    stages={"DISCOVERY", "SELECTION"},
)
