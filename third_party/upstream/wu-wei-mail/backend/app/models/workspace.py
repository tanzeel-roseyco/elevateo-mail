"""Workspace model — multi-tenant isolation."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(50), default="free")  # free, pro, enterprise
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    unsubscribe_text: Mapped[str | None] = mapped_column(Text, nullable=True, default="")
    gdpr_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    can_spam_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships — lazy="select" (load on access) to avoid fetching entire workspace
    # contents on every query. Use explicit selectinload() where needed.
    users: Mapped[list["User"]] = relationship("User", back_populates="workspace", lazy="select")
    campaigns: Mapped[list["Campaign"]] = relationship("Campaign", back_populates="workspace", lazy="select")
    email_accounts: Mapped[list["EmailAccount"]] = relationship("EmailAccount", back_populates="workspace", lazy="select")
    templates: Mapped[list["Template"]] = relationship("Template", back_populates="workspace", lazy="select")
    lead_lists: Mapped[list["LeadList"]] = relationship("LeadList", back_populates="workspace", lazy="select")
