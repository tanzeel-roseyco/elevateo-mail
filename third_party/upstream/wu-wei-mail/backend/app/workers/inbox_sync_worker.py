"""Periodic inbox sync worker for OAuth-connected mailboxes."""

import asyncio
import logging

from sqlalchemy import select

from app.database import async_session_factory
from app.models.email_account import EmailAccount
from app.services.inbox_sync_service import inbox_sync_service
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.inbox_sync_worker.sync_inboxes")
def sync_inboxes():
    """Pull inbound replies from provider APIs into the unified inbox."""
    asyncio.run(_sync_inboxes_async())


async def _sync_inboxes_async():
    async with async_session_factory() as db:
        workspace_rows = await db.execute(
            select(EmailAccount.workspace_id)
            .where(
                EmailAccount.is_active.is_(True),
                EmailAccount.provider == "google",
                EmailAccount.oauth_access_token.is_not(None),
            )
            .distinct()
        )
        workspace_ids = list(workspace_rows.scalars().all())
        if not workspace_ids:
            return

        for workspace_id in workspace_ids:
            try:
                stats = await inbox_sync_service.sync_workspace_accounts(
                    db=db,
                    workspace_id=workspace_id,
                    max_messages_per_account=30,
                    force=True,
                )
                await db.commit()
                logger.debug(
                    "Inbox sync workspace=%s created=%s duplicates=%s failed=%s",
                    workspace_id,
                    stats.get("created", 0),
                    stats.get("duplicates", 0),
                    stats.get("failed", 0),
                )
            except Exception as exc:
                await db.rollback()
                logger.warning("Inbox sync failed for workspace %s: %s", workspace_id, exc)
