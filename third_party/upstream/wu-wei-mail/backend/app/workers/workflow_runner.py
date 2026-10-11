"""Workflow runner worker — Celery task that processes due workflow leads."""

import asyncio
import logging

from app.database import async_session_factory
from app.services.workflow.runtime import workflow_runtime
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.workflow_runner.process_workflow_leads")
def process_workflow_leads():
    """Process all due workflow lead states. Runs every 30s via beat."""
    asyncio.run(_process_workflow_leads_async())


async def _process_workflow_leads_async():
    async with async_session_factory() as db:
        try:
            processed = await workflow_runtime.process_due_leads(db)
            await db.commit()
            if processed > 0:
                logger.info("Workflow runner processed %d leads", processed)
        except Exception:
            logger.exception("Workflow runner failed")
            await db.rollback()
