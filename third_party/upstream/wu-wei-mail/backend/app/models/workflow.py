"""Workflow definition, runtime state, outreach accounts, and event models.

Tables defined here:
- outreach_accounts          (channel-agnostic account model)
- workflow_definitions       (canonical JSON + metadata)
- workflow_nodes             (compiled from canonical JSON for query perf)
- workflow_edges             (compiled from canonical JSON for query perf)
- workflow_lead_state        (per-lead runtime token position)
- campaign_channel_accounts  (campaign <-> outreach_account assignment)
- outreach_events            (normalized event stream across channels)
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    String, DateTime, Boolean, Integer, Float, ForeignKey, Text, JSON,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Outreach accounts (channel-agnostic: email, linkedin, etc.)
# ---------------------------------------------------------------------------

class OutreachAccount(Base):
    __tablename__ = "outreach_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True,
    )
    channel: Mapped[str] = mapped_column(String(50), nullable=False)  # email, linkedin
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # smtp, google, microsoft, unipile
    provider_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(
        String(50), default="connected",
    )  # connected, disconnected, reconnecting, paused, credentials

    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    health_score: Mapped[float] = mapped_column(Float, default=1.0)

    # LinkedIn-specific limits (nullable for email accounts)
    daily_invitation_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=80)
    daily_message_limit: Mapped[int | None] = mapped_column(Integer, nullable=True, default=150)

    meta_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "provider_account_id", name="uq_outreach_account_provider"),
    )


# ---------------------------------------------------------------------------
# Workflow definition (canonical JSON source of truth)
# ---------------------------------------------------------------------------

class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True,
    )
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=True, index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    workflow_version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(50), default="draft")  # draft, published, archived

    canonical_json: Mapped[dict] = mapped_column(JSON, nullable=False)

    rollout_percentage: Mapped[int] = mapped_column(Integer, default=100)

    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "name", "workflow_version", name="uq_workflow_workspace_name_version"),
    )

    # Relationships
    nodes: Mapped[list["WorkflowNode"]] = relationship(
        "WorkflowNode", back_populates="workflow", cascade="all, delete-orphan", lazy="selectin",
    )
    edges: Mapped[list["WorkflowEdge"]] = relationship(
        "WorkflowEdge", back_populates="workflow", cascade="all, delete-orphan", lazy="selectin",
    )


# ---------------------------------------------------------------------------
# Compiled runtime tables (generated from canonical_json)
# ---------------------------------------------------------------------------

class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "n_email_1"
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    config_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)

    __table_args__ = (
        UniqueConstraint("workflow_id", "node_id", name="uq_workflow_node"),
    )

    workflow: Mapped["WorkflowDefinition"] = relationship("WorkflowDefinition", back_populates="nodes")


class WorkflowEdge(Base):
    __tablename__ = "workflow_edges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    from_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    to_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    condition: Mapped[str] = mapped_column(String(50), default="always")
    edge_order: Mapped[int] = mapped_column(Integer, default=1)

    __table_args__ = (
        UniqueConstraint("workflow_id", "from_node_id", "to_node_id", "condition", name="uq_workflow_edge"),
    )

    workflow: Mapped["WorkflowDefinition"] = relationship("WorkflowDefinition", back_populates="edges")


# ---------------------------------------------------------------------------
# Runtime lead state (token position in workflow graph)
# ---------------------------------------------------------------------------

class WorkflowLeadState(Base):
    __tablename__ = "workflow_lead_states"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True,
    )

    current_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="pending",
    )  # pending, running, waiting, completed, failed, paused, dead_lettered

    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True,
    )
    execution_count: Mapped[int] = mapped_column(Integer, default=0)

    channel_state_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    context_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    last_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("workflow_id", "lead_id", name="uq_workflow_lead_state_v2"),
        Index("ix_workflow_lead_state_due", "status", "next_run_at"),
    )


# ---------------------------------------------------------------------------
# Campaign channel account assignment (generalises CampaignAccount)
# ---------------------------------------------------------------------------

class CampaignChannelAccount(Base):
    __tablename__ = "campaign_channel_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    outreach_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("outreach_accounts.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    weight: Mapped[int] = mapped_column(Integer, default=1)

    __table_args__ = (
        UniqueConstraint("campaign_id", "outreach_account_id", name="uq_campaign_channel_account"),
    )


# ---------------------------------------------------------------------------
# Normalised event stream (cross-channel)
# ---------------------------------------------------------------------------

class OutreachEvent(Base):
    __tablename__ = "outreach_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True,
    )
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True,
    )
    node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # event types: email_sent, email_reply, invite_sent, invite_accepted,
    # linkedin_message_sent, linkedin_message_received, http_request_succeeded,
    # ai_classified, node_failed, etc.

    channel: Mapped[str | None] = mapped_column(String(50), nullable=True)  # email, linkedin
    provider_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_outreach_events_type_created", "event_type", "created_at"),
    )


# ---------------------------------------------------------------------------
# Workflow execution log (per-node execution records)
# ---------------------------------------------------------------------------

class WorkflowExecutionLog(Base):
    __tablename__ = "workflow_execution_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(50), nullable=False)  # success, error, skipped

    input_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)

    __table_args__ = (
        Index("ix_execution_log_workflow_node", "workflow_id", "node_id"),
        Index("ix_execution_log_lead", "lead_id", "started_at"),
    )


# ---------------------------------------------------------------------------
# Dead letter queue (failed leads that exhausted retries)
# ---------------------------------------------------------------------------

class WorkflowDeadLetterEntry(Base):
    __tablename__ = "workflow_dead_letter_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False, index=True,
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    lead_state_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_lead_states.id", ondelete="CASCADE"), nullable=False,
    )
    failed_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="pending_review",
    )  # pending_review, retried, discarded
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
