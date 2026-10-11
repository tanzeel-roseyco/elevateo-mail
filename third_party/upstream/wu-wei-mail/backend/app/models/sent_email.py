"""SentEmail model — record of every email sent."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SentEmail(Base):
    __tablename__ = "sent_emails"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True, index=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("email_accounts.id"), nullable=False, index=True)
    step_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("steps.id"), nullable=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("variants.id"), nullable=True)

    message_id: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)  # SMTP Message-ID
    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(String(50), default="sent")  # sent, delivered, bounced, failed
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships
    campaign: Mapped["Campaign | None"] = relationship("Campaign", back_populates="sent_emails")
    account: Mapped["EmailAccount"] = relationship("EmailAccount", back_populates="sent_emails")
    events: Mapped[list["EmailEvent"]] = relationship("EmailEvent", back_populates="sent_email", lazy="selectin")
