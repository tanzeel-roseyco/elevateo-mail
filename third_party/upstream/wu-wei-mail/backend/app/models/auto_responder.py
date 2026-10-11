"""Auto-responder models — AI-powered inbound email response system."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, ForeignKey, Text, JSON, Integer, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutoResponderConfig(Base):
    __tablename__ = "auto_responder_configs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    # Master toggle
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # AI Provider (via OpenRouter)
    ai_model: Mapped[str] = mapped_column(String(100), default="openai/gpt-4o")  # OpenRouter model ID
    ai_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)  # OpenRouter API key

    # Brand Voice
    tone: Mapped[str] = mapped_column(String(50), default="professional")  # formal, professional, casual, friendly
    brand_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_phrases: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    forbidden_words: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    signature_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")

    # Guardrails
    max_response_length: Mapped[int] = mapped_column(Integer, default=500)
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.7)
    escalation_keywords: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Rate limits
    max_responses_per_hour: Mapped[int] = mapped_column(Integer, default=50)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=5)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("workspace_id", name="uq_auto_responder_config_workspace"),
    )


class ResponderRegion(Base):
    __tablename__ = "responder_regions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Matching conditions (JSON): { "rules": [...], "match_all": true }
    conditions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Voice overrides (null = use workspace default)
    tone_override: Mapped[str | None] = mapped_column(String(50), nullable=True)
    example_phrases_override: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    custom_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ResponderRule(Base):
    __tablename__ = "responder_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)

    # Trigger conditions
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    region_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("responder_regions.id"), nullable=True)

    # Action
    action: Mapped[str] = mapped_column(String(50), default="auto_respond")  # auto_respond, escalate, skip
    response_template: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    delay_minutes: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ResponderNote(Base):
    __tablename__ = "responder_notes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    inbox_message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inbox_messages.id"), nullable=False, index=True)

    author_type: Mapped[str] = mapped_column(String(20), nullable=False)  # user, ai, system
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    content: Mapped[str] = mapped_column(Text, nullable=False)
    note_type: Mapped[str] = mapped_column(String(50), default="annotation")  # annotation, intent_classification, sentiment, action_item

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ResponderLog(Base):
    __tablename__ = "responder_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), nullable=False, index=True)
    inbox_message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inbox_messages.id"), nullable=False, index=True)
    response_message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("inbox_messages.id"), nullable=True)

    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id"), nullable=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    region_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("responder_regions.id"), nullable=True)
    rule_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("responder_rules.id"), nullable=True)

    # AI generation details (via OpenRouter)
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)  # OpenRouter model ID used
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Generated response
    generated_subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_body: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, sent, escalated, rejected, failed
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
