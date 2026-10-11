"""Lead personalization worker tasks with progress tracking."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from fastapi.encoders import jsonable_encoder

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


def _coerce_limit(raw_limit: Any) -> int | None:
    if raw_limit in (None, ""):
        return None
    try:
        return int(raw_limit)
    except (TypeError, ValueError):
        return None


async def _run_personalization_job_async(
    task,
    workspace_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    from app.database import async_session_factory
    from app.services.lead_service import lead_service

    async with async_session_factory() as session:
        try:
            list_id = uuid.UUID(str(payload["list_id"]))
            workspace_key = str(workspace_id)
            resolved_limit = _coerce_limit(payload.get("limit"))

            def on_progress(meta: dict[str, Any]) -> None:
                progress_meta = dict(meta)
                progress_meta["workspace_id"] = workspace_key
                task.update_state(state="PROGRESS", meta=jsonable_encoder(progress_meta))

            result = await lead_service.personalize_leads(
                db=session,
                workspace_id=uuid.UUID(workspace_id),
                list_id=list_id,
                source_column=str(payload.get("source_column") or "website"),
                source_custom_field=payload.get("source_custom_field"),
                target_field=str(payload.get("target_field") or "personalization"),
                tone=payload.get("tone"),
                instructions=payload.get("instructions"),
                limit=resolved_limit,
                progress_callback=on_progress,
            )
            await session.commit()
            return {
                "workspace_id": workspace_key,
                "result": jsonable_encoder(result),
            }
        except Exception:
            await session.rollback()
            raise


@celery_app.task(
    name="app.workers.lead_personalization_worker.run_lead_personalization_job",
    bind=True,
    max_retries=0,
)
def run_lead_personalization_job(self, workspace_id: str, payload: dict[str, Any]):
    """Run list-level lead personalization and report progress via task meta."""
    resolved_limit = _coerce_limit(payload.get("limit"))
    initial_total = resolved_limit if resolved_limit is not None else 0
    self.update_state(
        state="PROGRESS",
        meta={
            "processed": 0,
            "total": initial_total,
            "updated": 0,
            "skipped": 0,
            "failed": 0,
            "progress_percent": 0.0,
            "workspace_id": str(workspace_id),
        },
    )
    logger.info(
        "Starting lead personalization job %s for workspace %s",
        self.request.id,
        workspace_id,
    )
    return _run_async(_run_personalization_job_async(self, workspace_id, payload))
