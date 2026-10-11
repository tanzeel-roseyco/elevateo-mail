"""enrich_leads tool — triggers enrichment for un-enriched leads."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select

from app.models.prospecting import ProspectingRun
from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

ENRICH_LEADS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "enrich_leads",
        "description": (
            "Trigger email enrichment for leads in the current conversation. "
            "Uses the waterfall enrichment pipeline (AnyMailFinder, etc.) to find "
            "verified email addresses for leads that don't have one yet. "
            "Call this when the user wants to enrich leads, find emails, or "
            "improve lead data quality."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "run_id": {
                    "type": "string",
                    "description": "Specific run ID to enrich. If omitted, enriches the latest run.",
                },
            },
            "required": [],
        },
    },
}


async def handle_enrich_leads(args: dict[str, Any], ctx: ToolContext) -> str:
    """Trigger enrichment for leads in the conversation's latest run."""
    try:
        from app.services.prospecting.lead_enrichment_service import lead_enrichment_service

        # Find the target run
        run_id_str = args.get("run_id")
        if run_id_str:
            import uuid
            run_id = uuid.UUID(run_id_str)
        else:
            # Get the latest completed run for this conversation
            run_result = await ctx.db.execute(
                select(ProspectingRun)
                .where(
                    ProspectingRun.conversation_id == ctx.conversation_id,
                    ProspectingRun.workspace_id == ctx.workspace_id,
                    ProspectingRun.status == "completed",
                )
                .order_by(ProspectingRun.created_at.desc())
                .limit(1)
            )
            run = run_result.scalar_one_or_none()
            if not run:
                return json.dumps({
                    "error": "No completed discovery run found. Run a discovery first.",
                    "enriched_count": 0,
                })
            run_id = run.id

        # Run enrichment
        results = await lead_enrichment_service.enrich_run(
            db=ctx.db,
            run_id=run_id,
            workspace_id=ctx.workspace_id,
        )

        found_emails = sum(1 for r in results if r.success and r.email)
        failed = sum(1 for r in results if not r.success)
        reason_codes = {}
        for r in results:
            if r.reason_code:
                reason_codes[r.reason_code] = reason_codes.get(r.reason_code, 0) + 1

        return json.dumps({
            "enriched_count": len(results),
            "found_emails": found_emails,
            "failed": failed,
            "reason_codes": reason_codes,
        })

    except Exception as e:
        logger.exception("enrich_leads failed")
        return json.dumps({"error": str(e), "enriched_count": 0})


tool_registry.register(
    name="enrich_leads",
    schema=ENRICH_LEADS_SCHEMA,
    handler=handle_enrich_leads,
    stages={"SELECTION", "COPYWRITING", "CAMPAIGN_SETUP", "LAUNCH_READY", "LAUNCHED"},
)
