"""Cron trigger — evaluates workflow cron expressions every minute."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.workflow import WorkflowDefinition, WorkflowLeadState
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.cron_trigger.evaluate_cron_triggers")
def evaluate_cron_triggers():
    """Check all published workflows for due cron triggers."""
    asyncio.run(_evaluate_cron_async())


async def _evaluate_cron_async():
    """Find published workflows with trigger_cron nodes and check if they're due."""
    try:
        from croniter import croniter
    except ImportError:
        logger.warning("croniter not installed — skipping cron trigger evaluation")
        return

    async with async_session_factory() as db:
        # Find all published workflows
        result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.status == "published",
            )
        )
        workflows = list(result.scalars().all())

        now = datetime.now(timezone.utc)

        for wf in workflows:
            canonical = wf.canonical_json or {}
            nodes = canonical.get("nodes", [])

            # Find trigger_cron nodes
            cron_nodes = [n for n in nodes if n.get("type") == "trigger_cron"]
            if not cron_nodes:
                continue

            for cron_node in cron_nodes:
                config = cron_node.get("config", {})
                cron_expr = config.get("cron_expression", "")
                if not cron_expr:
                    continue

                try:
                    cron = croniter(cron_expr, now)
                    prev_run = cron.get_prev(datetime)

                    # Check if the previous scheduled time is within the last 90 seconds
                    # (with some tolerance for beat interval)
                    seconds_since = (
                        now
                        - prev_run.replace(
                            tzinfo=timezone.utc
                            if prev_run.tzinfo is None
                            else prev_run.tzinfo
                        )
                    ).total_seconds()
                    if seconds_since > 90:
                        continue  # Not due yet

                    # Get lead_ids to process from the node config or find leads
                    # already in the workflow.  For cron triggers we use a
                    # lead_list_id from the node config.
                    list_id = config.get("lead_list_id")
                    if list_id:
                        # Import leads from a specific list
                        from app.models.lead import LeadListMember

                        lead_result = await db.execute(
                            select(LeadListMember.lead_id).where(
                                LeadListMember.lead_list_id == list_id,
                            )
                        )
                        lead_ids = [row for row in lead_result.scalars().all()]
                    else:
                        # No list configured — skip (cron needs a source of leads)
                        logger.debug(
                            "Cron trigger node %s in workflow %s has no lead_list_id configured",
                            cron_node.get("id"),
                            wf.id,
                        )
                        continue

                    if not lead_ids:
                        continue

                    from app.services.workflow.runtime import workflow_runtime

                    enrolled = 0
                    for lead_id in lead_ids:
                        state = await workflow_runtime.dispatch_event_trigger(
                            db=db,
                            workflow_id=wf.id,
                            campaign_id=wf.campaign_id,
                            lead_id=lead_id,
                            trigger_node_id=cron_node["id"],
                            event_data={
                                "trigger": "cron",
                                "cron_expression": cron_expr,
                            },
                        )
                        if state:
                            enrolled += 1

                    if enrolled > 0:
                        logger.info(
                            "Cron trigger: enrolled %d leads into workflow %s (cron=%s)",
                            enrolled,
                            wf.id,
                            cron_expr,
                        )

                except Exception:
                    logger.exception(
                        "Error evaluating cron trigger for workflow %s node %s",
                        wf.id,
                        cron_node.get("id"),
                    )

        await db.commit()
