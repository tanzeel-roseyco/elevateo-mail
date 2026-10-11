"""Step model — individual email step within a sequence."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    sequence_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False, index=True)

    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    step_type: Mapped[str] = mapped_column(String(50), default="email")  # email, wait, condition
    wait_days: Mapped[int] = mapped_column(Integer, default=0)  # days to wait before this step

    # Email content (if step_type == "email")
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    sequence: Mapped["Sequence"] = relationship("Sequence", back_populates="steps")
    variants: Mapped[list["Variant"]] = relationship("Variant", back_populates="step", lazy="selectin", cascade="all, delete-orphan")
    conditions: Mapped[list["Condition"]] = relationship("Condition", back_populates="step", lazy="selectin", cascade="all, delete-orphan")
