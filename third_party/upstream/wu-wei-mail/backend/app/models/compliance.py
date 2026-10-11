"""Compliance policy, contact touch tracking, and frequency control models."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Integer, Float, ForeignKey, Text, JSON, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CompliancePolicy(Base):
    __tablename__ = "compliance_policies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    policy_type: Mapped[str] = mapped_column(String(50), nullable=False)  # quiet_hours, channel_cooldown, stop_on_reply, regional
    config_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ContactTouch(Base):
    __tablename__ = "contact_touches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(50), nullable=False)  # email, linkedin
    touch_type: Mapped[str] = mapped_column(String(50), nullable=False)  # email_sent, linkedin_connect, etc.
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    touched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_contact_touch_lead_window", "lead_id", "touched_at"),
        Index("ix_contact_touch_workspace_lead", "workspace_id", "lead_id"),
    )


class FrequencyControlConfig(Base):
    __tablename__ = "frequency_control_configs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, unique=True)
    max_touches_per_7d: Mapped[int] = mapped_column(Integer, default=5)
    max_touches_per_30d: Mapped[int] = mapped_column(Integer, default=15)
    min_channel_gap_hours: Mapped[dict | None] = mapped_column(JSON, default=lambda: {"email_to_linkedin": 24, "linkedin_to_email": 24})
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
