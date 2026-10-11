"""Prospecting models — agent-driven lead discovery, enrichment, and campaign building."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, DateTime, Boolean, Integer, Float, ForeignKey, Text, JSON,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


# ---------------------------------------------------------------------------
# Journey stage constants
# ---------------------------------------------------------------------------

class JourneyStage:
    DISCOVERY = "DISCOVERY"
    SELECTION = "SELECTION"
    COPYWRITING = "COPYWRITING"
    CAMPAIGN_SETUP = "CAMPAIGN_SETUP"
    LAUNCH_READY = "LAUNCH_READY"
    LAUNCHED = "LAUNCHED"

    ALL = {DISCOVERY, SELECTION, COPYWRITING, CAMPAIGN_SETUP, LAUNCH_READY, LAUNCHED}


# ---------------------------------------------------------------------------
# Prospecting Conversations
# ---------------------------------------------------------------------------

class ProspectingConversation(Base):
    __tablename__ = "prospecting_conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    stage: Mapped[str] = mapped_column(String(50), default=JourneyStage.DISCOVERY)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    messages: Mapped[list["ProspectingMessage"]] = relationship("ProspectingMessage", back_populates="conversation", lazy="select")
    runs: Mapped[list["ProspectingRun"]] = relationship("ProspectingRun", back_populates="conversation", lazy="select")
    actions: Mapped[list["ProspectingAction"]] = relationship("ProspectingAction", back_populates="conversation", lazy="select")


# ---------------------------------------------------------------------------
# Prospecting Runs (discovery/enrichment execution)
# ---------------------------------------------------------------------------

class ProspectingRun(Base):
    __tablename__ = "prospecting_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prospecting_conversations.id"), nullable=False, index=True)

    run_type: Mapped[str] = mapped_column(String(50), nullable=False)  # discovery, enrichment
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)  # pending, running, completed, failed, cancelled
    icp_criteria: Mapped[dict | None] = mapped_column(JSON, default=dict)  # ICP parameters for this run
    source_strategy: Mapped[dict | None] = mapped_column(JSON, default=dict)  # planned source mix
    progress: Mapped[dict | None] = mapped_column(JSON, default=dict)  # { total, completed, errors }
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    conversation: Mapped["ProspectingConversation"] = relationship("ProspectingConversation", back_populates="runs")
    partitions: Mapped[list["ProspectingPartition"]] = relationship("ProspectingPartition", back_populates="run", lazy="select")
    leads: Mapped[list["ProspectingLead"]] = relationship("ProspectingLead", back_populates="run", lazy="select")


# ---------------------------------------------------------------------------
# Prospecting Partitions (sub-tasks within a run)
# ---------------------------------------------------------------------------

class ProspectingPartition(Base):
    __tablename__ = "prospecting_partitions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prospecting_runs.id", ondelete="CASCADE"), nullable=False, index=True)

    source_name: Mapped[str] = mapped_column(String(100), nullable=False)
    partition_key: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g., region, keyword
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)  # pending, running, completed, failed
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    run: Mapped["ProspectingRun"] = relationship("ProspectingRun", back_populates="partitions")


# ---------------------------------------------------------------------------
# Prospecting Leads (discovered prospects before import)
# ---------------------------------------------------------------------------

class ProspectingLead(Base):
    __tablename__ = "prospecting_leads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prospecting_runs.id", ondelete="CASCADE"), nullable=False, index=True)

    email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(255), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Quality scoring
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0.0 – 1.0
    quality_components: Mapped[dict | None] = mapped_column(JSON, default=dict)  # breakdown by factor
    readiness_band: Mapped[str | None] = mapped_column(String(50), nullable=True)  # READY_HIGH_CONFIDENCE, READY_REVIEW, HOLD
    email_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0.0 – 1.0

    # Source and enrichment
    source_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    enrichment_data: Mapped[dict | None] = mapped_column(JSON, default=dict)

    # Exclusion tracking
    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    exclusion_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)  # NO_DOMAIN, LOW_CONFIDENCE_EMAIL, etc.
    exclusion_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Selection and import
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id"), nullable=True)  # link to CRM lead after import

    raw_data: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    run: Mapped["ProspectingRun"] = relationship("ProspectingRun", back_populates="leads")

    __table_args__ = (
        Index("ix_prospecting_leads_ws_email", "workspace_id", "email"),
    )


# ---------------------------------------------------------------------------
# Prospecting Messages (conversation thread)
# ---------------------------------------------------------------------------

class ProspectingMessage(Base):
    __tablename__ = "prospecting_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prospecting_conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    role: Mapped[str] = mapped_column(String(50), nullable=False)  # user, assistant, system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    agent_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # orchestrator, lead_discovery, etc.
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)  # stage, intent, action cards, etc.
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    conversation: Mapped["ProspectingConversation"] = relationship("ProspectingConversation", back_populates="messages")


# ---------------------------------------------------------------------------
# Prospecting Actions (approval-gated side effects)
# ---------------------------------------------------------------------------

class ProspectingAction(Base):
    __tablename__ = "prospecting_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prospecting_conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    action_type: Mapped[str] = mapped_column(String(100), nullable=False)  # bulk_import, campaign_launch, instantly_sync
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)  # pending, approved, rejected, executed, failed
    payload: Mapped[dict | None] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, default=dict)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    conversation: Mapped["ProspectingConversation"] = relationship("ProspectingConversation", back_populates="actions")


# ---------------------------------------------------------------------------
# Prospecting Tool Outputs (agent tool call results for audit)
# ---------------------------------------------------------------------------

class ProspectingToolOutput(Base):
    __tablename__ = "prospecting_tool_outputs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prospecting_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("prospecting_messages.id", ondelete="SET NULL"), nullable=True)

    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    input_data: Mapped[dict | None] = mapped_column(JSON, default=dict)
    output_data: Mapped[dict | None] = mapped_column(JSON, default=dict)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Agent Model Policies (per-workspace, per-agent model config)
# ---------------------------------------------------------------------------

class AgentModelPolicy(Base):
    __tablename__ = "agent_model_policies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    agent_type: Mapped[str] = mapped_column(String(50), nullable=False)  # orchestrator, lead_discovery, lead_enrichment, copywriting, campaign_builder
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="openrouter")
    model_id: Mapped[str] = mapped_column(String(200), nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)
    fallback_model_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("workspace_id", "agent_type", name="uq_workspace_agent_policy"),
    )


# ---------------------------------------------------------------------------
# Workspace Integration Secrets (encrypted external API keys)
# ---------------------------------------------------------------------------

class WorkspaceIntegrationSecret(Base):
    __tablename__ = "workspace_integration_secrets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    integration_type: Mapped[str] = mapped_column(String(100), nullable=False)  # instantly, apollo, etc.
    key_name: Mapped[str] = mapped_column(String(100), nullable=False)  # api_key, client_secret, etc.
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)  # Fernet-encrypted
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("workspace_id", "integration_type", "key_name", name="uq_workspace_integration_key"),
    )
