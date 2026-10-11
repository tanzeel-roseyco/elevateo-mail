"""Prospecting Celery tasks — discovery runs, enrichment, and agent execution.

These tasks bridge the sync Celery worker world with async SQLAlchemy services.
Each task creates its own async session and runs the service method.
"""

import asyncio
import logging
import uuid

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Shouldn't happen in Celery workers, but handle gracefully
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


async def _execute_discovery_run_async(run_id: str, workspace_id: str):
    """Async implementation of discovery run execution."""
    from app.database import async_session_factory
    from app.services.prospecting.lead_discovery_service import lead_discovery_service

    async with async_session_factory() as session:
        try:
            run = await lead_discovery_service.execute_run(
                db=session,
                run_id=uuid.UUID(run_id),
                workspace_id=uuid.UUID(workspace_id),
            )
            await session.commit()
            logger.info(
                "Discovery run %s completed with status %s",
                run_id, run.status,
            )
            return {"run_id": run_id, "status": run.status}
        except Exception as e:
            await session.rollback()
            logger.error("Discovery run %s failed: %s", run_id, e)
            raise


async def _enrich_leads_async(run_id: str, workspace_id: str):
    """Async implementation of lead enrichment."""
    from app.database import async_session_factory
    from app.services.prospecting.lead_enrichment_service import lead_enrichment_service

    async with async_session_factory() as session:
        try:
            results = await lead_enrichment_service.enrich_run(
                db=session,
                run_id=uuid.UUID(run_id),
                workspace_id=uuid.UUID(workspace_id),
            )
            await session.commit()
            logger.info(
                "Enrichment for run %s completed: %d leads enriched",
                run_id, len(results),
            )
            return {"run_id": run_id, "enriched_count": len(results)}
        except Exception as e:
            await session.rollback()
            logger.error("Enrichment for run %s failed: %s", run_id, e)
            raise


@celery_app.task(
    name="prospecting.execute_run",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def execute_prospecting_run(self, run_id: str, workspace_id: str):
    """Execute a prospecting discovery run.

    Creates partitions from source strategy and processes each,
    collecting leads and updating progress throughout.
    """
    try:
        return _run_async(_execute_discovery_run_async(run_id, workspace_id))
    except Exception as exc:
        logger.error("Discovery run %s error (attempt %d): %s", run_id, self.request.retries, exc)
        raise self.retry(exc=exc)


@celery_app.task(
    name="prospecting.enrich_leads",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def enrich_prospecting_leads(self, run_id: str, workspace_id: str):
    """Enrich discovered leads with email/person data.

    Runs the waterfall enrichment pipeline for all un-enriched leads
    in the specified run.
    """
    try:
        return _run_async(_enrich_leads_async(run_id, workspace_id))
    except Exception as exc:
        logger.error("Enrichment for run %s error (attempt %d): %s", run_id, self.request.retries, exc)
        raise self.retry(exc=exc)
