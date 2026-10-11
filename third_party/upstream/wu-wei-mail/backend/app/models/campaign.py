"""Campaign, CampaignLead, CampaignAccount models."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Integer, ForeignKey, Text, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")  # draft, active, paused, completed, archived
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Schedule
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    send_days: Mapped[dict | None] = mapped_column(JSON, default=lambda: {"mon": True, "tue": True, "wed": True, "thu": True, "fri": True, "sat": False, "sun": False})
    send_start_hour: Mapped[int] = mapped_column(Integer, default=9)
    send_end_hour: Mapped[int] = mapped_column(Integer, default=17)

    # Settings
    daily_limit: Mapped[int] = mapped_column(Integer, default=100)
    stop_on_reply: Mapped[bool] = mapped_column(Boolean, default=True)
    stop_on_auto_reply: Mapped[bool] = mapped_column(Boolean, default=False)
    track_opens: Mapped[bool] = mapped_column(Boolean, default=True)
    track_clicks: Mapped[bool] = mapped_column(Boolean, default=True)
    execution_mode: Mapped[str] = mapped_column(String(20), default="sequence")  # sequence | workflow

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="campaigns")
    sequences: Mapped[list["Sequence"]] = relationship("Sequence", back_populates="campaign", lazy="selectin", cascade="all, delete-orphan")
    campaign_leads: Mapped[list["CampaignLead"]] = relationship("CampaignLead", back_populates="campaign", lazy="selectin", cascade="all, delete-orphan")
    campaign_accounts: Mapped[list["CampaignAccount"]] = relationship("CampaignAccount", back_populates="campaign", lazy="selectin", cascade="all, delete-orphan")
    sent_emails: Mapped[list["SentEmail"]] = relationship("SentEmail", back_populates="campaign", lazy="select")


class CampaignLead(Base):
    __tablename__ = "campaign_leads"
    __table_args__ = (
        UniqueConstraint("campaign_id", "lead_id", name="uq_campaign_lead"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, in_sequence, completed, replied, bounced, unsubscribed
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    next_send_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("variants.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="campaign_leads")
    lead: Mapped["Lead"] = relationship("Lead", back_populates="campaign_leads")


class CampaignAccount(Base):
    __tablename__ = "campaign_accounts"
    __table_args__ = (
        UniqueConstraint("campaign_id", "account_id", name="uq_campaign_account"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    weight: Mapped[int] = mapped_column(Integer, default=1)  # for weighted distribution

    # Relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="campaign_accounts")
    account: Mapped["EmailAccount"] = relationship("EmailAccount")
