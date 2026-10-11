"""Inbox service — unified inbox for replies and threading."""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case

from app.models.inbox_message import InboxMessage


class InboxService:

    async def list_threads(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        skip: int = 0,
        limit: int = 50,
        unread_only: bool = False,
    ) -> list[dict]:
        """List inbox threads grouped by thread_id."""
        query = (
            select(
                InboxMessage.thread_id,
                func.min(InboxMessage.subject).label("subject"),
                func.count().label("message_count"),
                func.max(InboxMessage.received_at).label("last_message_at"),
                func.bool_and(InboxMessage.is_read).label("is_read"),
                func.min(case(
                    (InboxMessage.direction == "inbound", InboxMessage.from_email),
                    else_=InboxMessage.to_email,
                )).label("lead_email"),
                func.min(case(
                    (InboxMessage.direction == "inbound", InboxMessage.to_email),
                    else_=InboxMessage.from_email,
                )).label("account_email"),
            )
            .where(InboxMessage.workspace_id == workspace_id)
            .group_by(InboxMessage.thread_id)
            .order_by(func.max(InboxMessage.received_at).desc())
        )

        if unread_only:
            query = query.having(~func.bool_and(InboxMessage.is_read))

        result = await db.execute(query.offset(skip).limit(limit))
        threads = []
        for row in result:
            threads.append({
                "thread_id": row.thread_id,
                "subject": row.subject,
                "message_count": row.message_count,
                "last_message_at": row.last_message_at,
                "is_read": row.is_read,
                "lead_email": row.lead_email or "",
                "account_email": row.account_email or "",
                "messages": [],
            })
        return threads

    async def get_thread(self, db: AsyncSession, workspace_id: UUID, thread_id: str) -> list[InboxMessage]:
        """Get all messages in a thread, ordered chronologically."""
        result = await db.execute(
            select(InboxMessage)
            .where(
                InboxMessage.workspace_id == workspace_id,
                InboxMessage.thread_id == thread_id,
            )
            .order_by(InboxMessage.received_at.asc())
        )
        return list(result.scalars().all())

    async def get_thread_detail(self, db: AsyncSession, workspace_id: UUID, thread_id: str) -> dict | None:
        """Get a full thread with messages, matching InboxThreadResponse shape."""
        messages = await self.get_thread(db, workspace_id, thread_id)
        if not messages:
            return None

        first_inbound = next((m for m in messages if m.direction == "inbound"), None)
        first_msg = messages[0]

        if first_inbound:
            lead_email = first_inbound.from_email
            account_email = first_inbound.to_email
        else:
            lead_email = first_msg.to_email
            account_email = first_msg.from_email

        return {
            "thread_id": thread_id,
            "subject": messages[0].subject,
            "lead_email": lead_email,
            "account_email": account_email,
            "message_count": len(messages),
            "last_message_at": max(m.received_at for m in messages),
            "is_read": all(m.is_read for m in messages),
            "messages": messages,
        }

    async def mark_read(self, db: AsyncSession, message_id: UUID, workspace_id: UUID) -> None:
        result = await db.execute(
            select(InboxMessage).where(
                InboxMessage.id == message_id,
                InboxMessage.workspace_id == workspace_id,
            )
        )
        msg = result.scalar_one_or_none()
        if msg:
            msg.is_read = True
            await db.flush()

    async def mark_thread_read(self, db: AsyncSession, workspace_id: UUID, thread_id: str) -> int:
        """Mark all messages in a thread as read."""
        result = await db.execute(
            select(InboxMessage).where(
                InboxMessage.workspace_id == workspace_id,
                InboxMessage.thread_id == thread_id,
                InboxMessage.is_read == False,
            )
        )
        messages = result.scalars().all()
        for msg in messages:
            msg.is_read = True
        await db.flush()
        return len(messages)

    async def get_stats(self, db: AsyncSession, workspace_id: UUID) -> dict:
        """Get inbox statistics."""
        total = (await db.execute(
            select(func.count()).where(InboxMessage.workspace_id == workspace_id)
        )).scalar() or 0

        unread = (await db.execute(
            select(func.count()).where(
                InboxMessage.workspace_id == workspace_id,
                InboxMessage.is_read == False,
            )
        )).scalar() or 0

        auto_replies = (await db.execute(
            select(func.count()).where(
                InboxMessage.workspace_id == workspace_id,
                InboxMessage.is_auto_reply == True,
            )
        )).scalar() or 0

        return {"total": total, "unread": unread, "auto_replies": auto_replies}


inbox_service = InboxService()
