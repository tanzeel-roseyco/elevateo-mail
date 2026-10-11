"""Pydantic schemas for the prospecting bounded context."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Journey stages (mirrors model constants)
# ---------------------------------------------------------------------------

VALID_STAGES = {
    "DISCOVERY", "SELECTION", "COPYWRITING",
    "CAMPAIGN_SETUP", "LAUNCH_READY", "LAUNCHED",
}

VALID_AGENT_TYPES = {
    "orchestrator", "lead_discovery", "lead_enrichment",
    "copywriting", "campaign_builder",
}

VALID_READINESS_BANDS = {"READY_HIGH_CONFIDENCE", "READY_REVIEW", "HOLD"}

VALID_ACTION_TYPES = {"bulk_import", "campaign_launch", "instantly_sync"}

VALID_ACTION_STATUSES = {"pending", "approved", "rejected", "executed", "failed"}


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    created_by: uuid.UUID
    title: str | None
    stage: str
    is_active: bool
    metadata_json: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)


class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    agent_type: str | None = None
    model_used: str | None = None
    metadata_json: dict[str, Any] | None = None
    token_count: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True, "protected_namespaces": ()}


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------

class RunCreate(BaseModel):
    conversation_id: uuid.UUID
    run_type: str = Field(..., pattern="^(discovery|enrichment)$")
    icp_criteria: dict[str, Any] | None = None


class RunResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    conversation_id: uuid.UUID
    run_type: str
    status: str
    icp_criteria: dict[str, Any] | None = None
    source_strategy: dict[str, Any] | None = None
    progress: dict[str, Any] | None = None
    error_detail: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RunProgress(BaseModel):
    run_id: uuid.UUID
    status: str
    progress: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Prospecting Leads
# ---------------------------------------------------------------------------

class ProspectingLeadResponse(BaseModel):
    id: uuid.UUID
    email: str | None
    first_name: str | None = None
    last_name: str | None = None
    company: str | None = None
    title: str | None = None
    domain: str | None = None
    quality_score: float | None = None
    readiness_band: str | None = None
    email_confidence: float | None = None
    source_name: str | None = None
    is_excluded: bool = False
    exclusion_reason: str | None = None
    is_selected: bool = False
    imported_lead_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LeadImportRequest(BaseModel):
    lead_ids: list[uuid.UUID] = Field(..., min_length=1)
    target_list_id: uuid.UUID | None = None  # existing lead list, or create new
    new_list_name: str | None = None  # if target_list_id is None
    action_id: uuid.UUID | None = None  # approved bulk_import action (required)


class LeadImportResponse(BaseModel):
    imported_count: int
    duplicate_count: int
    lead_list_id: uuid.UUID | None = None
    imported_lead_ids: list[uuid.UUID]


# ---------------------------------------------------------------------------
# Copy Drafts
# ---------------------------------------------------------------------------

class CopyDraftRequest(BaseModel):
    conversation_id: uuid.UUID
    segment_description: str | None = None
    tone: str | None = None  # professional, casual, etc.
    num_variants: int = Field(default=2, ge=1, le=5)


class CopyVariant(BaseModel):
    subject: str
    body: str
    variant_label: str | None = None


class CopyDraftResponse(BaseModel):
    conversation_id: uuid.UUID
    variants: list[CopyVariant]
    metadata: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Campaign Creation
# ---------------------------------------------------------------------------

class CampaignCreateRequest(BaseModel):
    conversation_id: uuid.UUID
    campaign_name: str
    lead_list_id: uuid.UUID
    copy_variants: list[CopyVariant]
    target_type: str = Field(default="native", pattern="^(native|instantly)$")
    settings: dict[str, Any] | None = None  # schedule, daily_limit, etc.


class CampaignActionResponse(BaseModel):
    target_type: str
    campaign_id: uuid.UUID | None = None
    conversation_id: uuid.UUID
    source_list_id: uuid.UUID | None = None
    created_by_agent: str | None = None
    launch_status: str


# ---------------------------------------------------------------------------
# Actions (approvals)
# ---------------------------------------------------------------------------

class ActionResponse(BaseModel):
    id: uuid.UUID
    action_type: str
    status: str
    payload: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    executed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActionApproval(BaseModel):
    approved: bool


# ---------------------------------------------------------------------------
# Agent Model Policy
# ---------------------------------------------------------------------------

class ModelPolicyUpdate(BaseModel):
    model_config = {"protected_namespaces": ()}

    provider: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=200000)
    fallback_model_id: str | None = None
    is_default: bool | None = None


class ModelPolicyResponse(BaseModel):
    model_config = {"from_attributes": True, "protected_namespaces": ()}

    id: uuid.UUID
    workspace_id: uuid.UUID
    agent_type: str
    provider: str
    model_id: str
    temperature: float
    max_tokens: int
    fallback_model_id: str | None = None
    is_default: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Personalization Settings (OpenRouter)
# ---------------------------------------------------------------------------

class PersonalizationSettingsResponse(BaseModel):
    api_key_configured: bool
    api_key_source: str  # workspace | env | none
    model_id: str
    model_source: str  # policy | default


class PersonalizationSettingsUpdate(BaseModel):
    api_key: str | None = Field(default=None, min_length=1)
    model_id: str | None = Field(default=None, min_length=1, max_length=200)
    clear_api_key: bool = False
