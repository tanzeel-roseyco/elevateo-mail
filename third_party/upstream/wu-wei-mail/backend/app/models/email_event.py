"""EmailEvent model — opens, clicks, bounces, replies, unsubscribes."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EmailEvent(Base):
    __tablename__ = "email_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    sent_email_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sent_emails.id", ondelete="CASCADE"), nullable=False, index=True)

    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # open, click, bounce, reply, unsubscribe
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    # Extra data (click URL, bounce reason, etc.)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)

    # Idempotency: set after event has been processed by event_processor
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Relationships
    sent_email: Mapped["SentEmail"] = relationship("SentEmail", back_populates="events")
