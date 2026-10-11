"""Auto-responder schemas."""

from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


# ---- Config ----

class AutoResponderConfigResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    is_enabled: bool
    ai_model: str  # OpenRouter model ID (e.g. "openai/gpt-4o")
    tone: str
    brand_description: Optional[str]
    example_phrases: Optional[list[str]]
    forbidden_words: Optional[list[str]]
    signature_template: Optional[str]
    language: str
    max_response_length: int
    confidence_threshold: float
    escalation_keywords: Optional[list[str]]
    max_responses_per_hour: int
    cooldown_minutes: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class AutoResponderConfigUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    ai_model: Optional[str] = None  # OpenRouter model ID
    ai_api_key: Optional[str] = None  # OpenRouter API key, will be encrypted
    tone: Optional[str] = None
    brand_description: Optional[str] = None
    example_phrases: Optional[list[str]] = None
    forbidden_words: Optional[list[str]] = None
    signature_template: Optional[str] = None
    language: Optional[str] = None
    max_response_length: Optional[int] = None
    confidence_threshold: Optional[float] = None
    escalation_keywords: Optional[list[str]] = None
    max_responses_per_hour: Optional[int] = None
    cooldown_minutes: Optional[int] = None


# ---- Region ----

class RegionConditionRule(BaseModel):
    field: str
    operator: str  # eq, neq, in, not_in, contains, starts_with
    value: str | list[str]


class RegionConditions(BaseModel):
    rules: list[RegionConditionRule] = []
    match_all: bool = True


class ResponderRegionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    priority: int = 0
    is_active: bool = True
    conditions: RegionConditions
    tone_override: Optional[str] = None
    example_phrases_override: Optional[list[str]] = None
    custom_system_prompt: Optional[str] = None


class ResponderRegionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    conditions: Optional[RegionConditions] = None
    tone_override: Optional[str] = None
    example_phrases_override: Optional[list[str]] = None
    custom_system_prompt: Optional[str] = None


class ResponderRegionResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str]
    priority: int
    is_active: bool
    conditions: dict
    tone_override: Optional[str]
    example_phrases_override: Optional[list[str]]
    custom_system_prompt: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ---- Rule ----

class ResponderRuleCreate(BaseModel):
    name: str
    is_active: bool = True
    priority: int = 0
    campaign_id: Optional[UUID] = None
    region_id: Optional[UUID] = None
    action: str = "auto_respond"  # auto_respond, escalate, skip
    response_template: Optional[str] = None
    delay_minutes: int = 0


class ResponderRuleUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    campaign_id: Optional[UUID] = None
    region_id: Optional[UUID] = None
    action: Optional[str] = None
    response_template: Optional[str] = None
    delay_minutes: Optional[int] = None


class ResponderRuleResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    is_active: bool
    priority: int
    campaign_id: Optional[UUID]
    region_id: Optional[UUID]
    action: str
    response_template: Optional[str]
    delay_minutes: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ---- Note ----

class ResponderNoteCreate(BaseModel):
    content: str
    note_type: str = "annotation"  # annotation, intent_classification, sentiment, action_item


class ResponderNoteResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    inbox_message_id: UUID
    author_type: str
    author_id: Optional[UUID]
    content: str
    note_type: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ---- Log ----

class ResponderLogResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    inbox_message_id: UUID
    response_message_id: Optional[UUID]
    lead_id: Optional[UUID]
    campaign_id: Optional[UUID]
    region_id: Optional[UUID]
    rule_id: Optional[UUID]
    ai_model: str
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    generated_subject: Optional[str]
    generated_body: str
    confidence_score: Optional[float]
    status: str
    escalation_reason: Optional[str]
    processing_time_ms: Optional[int]
    created_at: datetime
    sent_at: Optional[datetime]
    model_config = {"from_attributes": True}


# ---- Queue ----

class ResponderQueueItem(BaseModel):
    inbox_message_id: UUID
    lead_email: str
    lead_name: Optional[str]
    subject: str
    body_preview: Optional[str]
    campaign_name: Optional[str]
    region_name: Optional[str]
    responder_status: Optional[str]
    confidence_score: Optional[float]
    generated_body: Optional[str]
    received_at: datetime


class ResponderQueueResponse(BaseModel):
    items: list[ResponderQueueItem]
    total: int
    skip: int
    limit: int


# ---- Analytics ----

class AutoResponderAnalyticsSummary(BaseModel):
    total_processed: int
    total_responded: int
    total_escalated: int
    total_skipped: int
    avg_confidence: Optional[float]
    avg_response_time_ms: Optional[float]
    escalation_rate: float


class AutoResponderTimeSeriesPoint(BaseModel):
    date: str
    responded: int
    escalated: int
    skipped: int


class AutoResponderRegionStats(BaseModel):
    region_id: UUID
    region_name: str
    total_responses: int
    avg_confidence: Optional[float]
    escalation_rate: float


# ---- Test ----

class AIProviderTestRequest(BaseModel):
    test_message: str = "Hello, I'm interested in your product. Can you tell me more?"


class AIProviderTestResponse(BaseModel):
    success: bool
    response_preview: Optional[str] = None
    error: Optional[str] = None
