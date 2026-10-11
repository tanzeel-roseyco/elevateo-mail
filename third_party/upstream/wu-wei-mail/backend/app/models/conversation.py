"""Conversation threads, messages, and notes — channel-neutral inbox model.

Supports both Email and LinkedIn conversations in a unified data model.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Boolean, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConversationThread(Base):
    """A conversation thread between the user and a lead, across any channel."""
    __tablename__ = "conversation_threads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True,
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    channel: Mapped[str] = mapped_column(String(50), nullable=False)  # email, linkedin
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="open")  # open, replied, closed
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)

    # Provider IDs for deduplication
    provider_thread_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )

    messages: Mapped[list["ConversationMessage"]] = relationship(
        "ConversationMessage", back_populates="thread", cascade="all, delete-orphan", lazy="selectin",
    )
    notes: Mapped[list["ConversationNote"]] = relationship(
        "ConversationNote", back_populates="thread", cascade="all, delete-orphan", lazy="selectin",
    )


class ConversationMessage(Base):
    """An individual message within a conversation thread."""
    __tablename__ = "conversation_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversation_threads.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    direction: Mapped[str] = mapped_column(String(20), nullable=False)  # inbound, outbound
    channel: Mapped[str] = mapped_column(String(50), nullable=False)  # email, linkedin
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)

    sender_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Provider deduplication
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )

    thread: Mapped["ConversationThread"] = relationship("ConversationThread", back_populates="messages")


class ConversationNote(Base):
    """Notes attached to a conversation thread — manual, AI, or system-generated."""
    __tablename__ = "conversation_notes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversation_threads.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True,
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    note_type: Mapped[str] = mapped_column(
        String(50), default="manual",
    )  # manual, ai, system, workflow
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # For workflow-generated notes
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True,
    )
    node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )

    thread: Mapped["ConversationThread | None"] = relationship("ConversationThread", back_populates="notes")
