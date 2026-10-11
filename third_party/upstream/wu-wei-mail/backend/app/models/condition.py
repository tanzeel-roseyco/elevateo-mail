"""Condition model — branching logic within a sequence step."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Condition(Base):
    __tablename__ = "conditions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    step_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("steps.id", ondelete="CASCADE"), nullable=False, index=True)

    condition_type: Mapped[str] = mapped_column(String(50), nullable=False)  # opened, clicked, replied, not_opened, not_clicked, not_replied
    target_step_order: Mapped[int] = mapped_column(Integer, nullable=True)  # jump to this step order, or None = end sequence

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    step: Mapped["Step"] = relationship("Step", back_populates="conditions")
