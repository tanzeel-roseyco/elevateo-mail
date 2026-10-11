"""Warmup models — managed email warmup with provider integration and policy engine."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, DateTime, Boolean, Integer, Float, ForeignKey, Text, JSON, Date,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# ---------------------------------------------------------------------------
# Phase constants
# ---------------------------------------------------------------------------

class WarmupPhase:
    ENROLLING = "enrolling"
    RAMPING = "ramping"
    STEADY = "steady"
    GRADUATING = "graduating"
    GRADUATED = "graduated"
    PAUSED = "paused"
    ERROR = "error"

    ALL = {ENROLLING, RAMPING, STEADY, GRADUATING, GRADUATED, PAUSED, ERROR}


# ---------------------------------------------------------------------------
# Warmup Programs (workspace-level config)
# ---------------------------------------------------------------------------

class WarmupProgram(Base):
    __tablename__ = "warmup_programs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    mode: Mapped[str] = mapped_column(String(50), default="managed")  # managed | manual
    default_target_volume: Mapped[int] = mapped_column(Integer, default=50)
    ramp_increment_per_day: Mapped[int] = mapped_column(Integer, default=3)
    max_daily_warmup: Mapped[int] = mapped_column(Integer, default=200)
    dns_required: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_pause_on_bounce_rate: Mapped[float] = mapped_column(Float, default=0.08)  # 8%
    auto_pause_on_complaint_rate: Mapped[float] = mapped_column(Float, default=0.003)  # 0.3%

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    account_states: Mapped[list["WarmupAccountState"]] = relationship("WarmupAccountState", back_populates="program", lazy="select")

    __table_args__ = (
        UniqueConstraint("workspace_id", name="uq_warmup_program_workspace"),
    )


# ---------------------------------------------------------------------------
# Warmup Account States (per-account lifecycle)
# ---------------------------------------------------------------------------

class WarmupAccountState(Base):
    __tablename__ = "warmup_account_states"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("email_accounts.id"), nullable=False, index=True)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warmup_programs.id"), nullable=False)

    phase: Mapped[str] = mapped_column(String(50), default=WarmupPhase.ENROLLING, index=True)
    target_volume: Mapped[int] = mapped_column(Integer, default=50)
    current_allowed_volume: Mapped[int] = mapped_column(Integer, default=5)
    actual_sent_today: Mapped[int] = mapped_column(Integer, default=0)
    warmup_health_score: Mapped[float] = mapped_column(Float, default=1.0)  # 0.0-1.0
    inbox_placement_rate: Mapped[float] = mapped_column(Float, default=1.0)  # 0.0-1.0

    phase_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    graduated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pause_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    program: Mapped["WarmupProgram"] = relationship("WarmupProgram", back_populates="account_states")
    provider_links: Mapped[list["WarmupProviderLink"]] = relationship("WarmupProviderLink", back_populates="account_state", lazy="select")
    actions: Mapped[list["WarmupAction"]] = relationship("WarmupAction", back_populates="account_state", lazy="select")
    daily_metrics: Mapped[list["WarmupDailyMetric"]] = relationship("WarmupDailyMetric", back_populates="account_state", lazy="select")

    __table_args__ = (
        UniqueConstraint("workspace_id", "account_id", name="uq_warmup_account_state"),
    )


# ---------------------------------------------------------------------------
# Warmup Provider Links (external provider mapping)
# ---------------------------------------------------------------------------

class WarmupProviderLink(Base):
    __tablename__ = "warmup_provider_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    account_state_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warmup_account_states.id"), nullable=False, index=True)

    provider_name: Mapped[str] = mapped_column(String(50), nullable=False)  # mailreach
    provider_account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, synced, error
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_metadata: Mapped[dict | None] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    account_state: Mapped["WarmupAccountState"] = relationship("WarmupAccountState", back_populates="provider_links")

    __table_args__ = (
        UniqueConstraint("provider_name", "provider_account_id", name="uq_warmup_provider_link"),
    )


# ---------------------------------------------------------------------------
# Warmup Actions (immutable action log)
# ---------------------------------------------------------------------------

class WarmupAction(Base):
    __tablename__ = "warmup_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    account_state_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warmup_account_states.id"), nullable=False, index=True)

    action_type: Mapped[str] = mapped_column(String(50), nullable=False)  # send, open, reply, pause, resume, enroll, graduate, bounce_received
    status: Mapped[str] = mapped_column(String(50), default="executed")  # planned, executed, failed, skipped
    source: Mapped[str] = mapped_column(String(50), default="system")  # provider, system, user
    detail: Mapped[dict | None] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    account_state: Mapped["WarmupAccountState"] = relationship("WarmupAccountState", back_populates="actions")


# ---------------------------------------------------------------------------
# Warmup Daily Metrics (aggregated daily stats)
# ---------------------------------------------------------------------------

class WarmupDailyMetric(Base):
    __tablename__ = "warmup_daily_metrics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    account_state_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("warmup_account_states.id"), nullable=False, index=True)

    date: Mapped[datetime] = mapped_column(Date, nullable=False)
    sent: Mapped[int] = mapped_column(Integer, default=0)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    opened: Mapped[int] = mapped_column(Integer, default=0)
    replied: Mapped[int] = mapped_column(Integer, default=0)
    bounced: Mapped[int] = mapped_column(Integer, default=0)
    spam_reported: Mapped[int] = mapped_column(Integer, default=0)
    inbox_placed: Mapped[int] = mapped_column(Integer, default=0)
    spam_placed: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    account_state: Mapped["WarmupAccountState"] = relationship("WarmupAccountState", back_populates="daily_metrics")

    __table_args__ = (
        UniqueConstraint("account_state_id", "date", name="uq_warmup_daily_metric"),
    )


# ---------------------------------------------------------------------------
# Warmup Seed Identities (Phase B skeleton — empty for now)
# ---------------------------------------------------------------------------

class WarmupSeedIdentity(Base):
    __tablename__ = "warmup_seed_identities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pool_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
