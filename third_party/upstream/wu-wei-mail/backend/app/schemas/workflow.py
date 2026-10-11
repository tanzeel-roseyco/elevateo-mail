"""Workflow JSON schema — Pydantic models for canonical workflow definition.

V1: Original 5-field node model (id, type, name, position, config).
V2: Rich node model with universal blocks, execution context, variable mapping.

All workflow import/export/validation passes through these models.
"""

from __future__ import annotations

import copy
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class NodeType(str, Enum):
    # Triggers
    TRIGGER_MANUAL = "trigger_manual"
    TRIGGER_NEW_LEAD = "trigger_new_lead"
    TRIGGER_LIST_MEMBERSHIP_ADDED = "trigger_list_membership_added"
    TRIGGER_INBOUND_WEBHOOK = "trigger_inbound_webhook"
    TRIGGER_CRON = "trigger_cron"
    # Outreach
    EMAIL_SEND = "email_send"
    LINKEDIN_CONNECT = "linkedin_connect"
    LINKEDIN_MESSAGE = "linkedin_message"
    WAIT = "wait"
    END = "end"
    # Logic
    IF = "if"
    SWITCH = "switch"
    MERGE = "merge"
    # Integrations
    HTTP_REQUEST = "http_request"
    OUTGOING_WEBHOOK = "outgoing_webhook"
    # AI
    AI_GENERATE_MESSAGE = "ai_generate_message"
    AI_CLASSIFY_REPLY = "ai_classify_reply"
    AI_EXTRACT_FIELDS = "ai_extract_fields"
    AI_DECISION = "ai_decision"
    # Auto-responder
    AUTO_RESPOND = "auto_respond"
    # Collaboration
    ADD_NOTE = "add_note"
    CREATE_TASK = "create_task"
    APPROVAL_GATE = "approval_gate"
    # Data sources
    DATA_CAMPAIGN = "data_campaign"
    DATA_LEAD_LIST = "data_lead_list"


TRIGGER_NODE_TYPES = {
    NodeType.TRIGGER_MANUAL,
    NodeType.TRIGGER_NEW_LEAD,
    NodeType.TRIGGER_LIST_MEMBERSHIP_ADDED,
    NodeType.TRIGGER_INBOUND_WEBHOOK,
    NodeType.TRIGGER_CRON,
}


class EdgeCondition(str, Enum):
    ALWAYS = "always"
    YES = "yes"
    NO = "no"
    TIMEOUT_ELAPSED = "timeout_elapsed"
    ERROR_CODE_MATCH = "error_code_match"


class WorkflowDefinitionStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class CronMissedPolicy(str, Enum):
    SKIP = "skip"
    CATCH_UP = "catch_up"


class LeadScopeType(str, Enum):
    ALL = "all"
    LIST_IDS = "list_ids"
    SEGMENT_FILTER = "segment_filter"


# V2 enums
class BackoffStrategy(str, Enum):
    FIXED = "fixed"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"


class OnErrorPolicy(str, Enum):
    FAIL = "fail"
    SKIP = "skip"
    RETRY = "retry"
    FALLBACK_EDGE = "fallback_edge"


class LogLevel(str, Enum):
    NONE = "none"
    ERROR = "error"
    WARN = "warn"
    INFO = "info"
    DEBUG = "debug"


class AuthMode(str, Enum):
    NONE = "none"
    BEARER_TOKEN = "bearer_token"
    BASIC = "basic"
    API_KEY_HEADER = "api_key_header"
    OAUTH2_CLIENT = "oauth2_client"


class BodyMode(str, Enum):
    NONE = "none"
    JSON_TEMPLATE = "json_template"
    FORM_URLENCODED = "form_urlencoded"
    RAW_TEXT = "raw_text"


class ParseMode(str, Enum):
    JSON = "json"
    TEXT = "text"
    HEADERS_ONLY = "headers_only"
    AUTO = "auto"


class SuccessCriteria(str, Enum):
    STATUS_2XX = "status_2xx"
    STATUS_CODE_IN = "status_code_in"
    BODY_CONTAINS = "body_contains"
    JSONPATH_TRUTHY = "jsonpath_truthy"


# ---------------------------------------------------------------------------
# Sub-models (V1 compat)
# ---------------------------------------------------------------------------

class Position(BaseModel):
    x: float = 0.0
    y: float = 0.0


class WorkflowMeta(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    tags: list[str] = Field(default_factory=list)


class WorkflowSettings(BaseModel):
    timezone: str = "UTC"
    prevent_same_day_cross_channel_touch: bool = True
    max_node_executions_per_lead: int = Field(default=50, ge=1, le=10000)
    max_context_size_bytes: int = Field(default=512_000, ge=1024, le=10_000_000)


class LeadScope(BaseModel):
    type: LeadScopeType = LeadScopeType.ALL
    value: Any = None


class BacklogPolicy(str, Enum):
    SKIP = "skip"
    CATCH_UP_SEQUENTIAL = "catch_up_sequential"
    CATCH_UP_BATCH = "catch_up_batch"


class TriggerPolicies(BaseModel):
    dedupe_window_minutes: int = Field(default=10, ge=0, le=1440)
    max_catch_up_runs: int = Field(default=3, ge=0, le=100)
    # Phase 8: Trigger governance
    backlog_policy: str = Field(default="skip")
    max_catch_up_batch_size: int = Field(default=100, ge=1, le=10000)
    volume_cap_per_hour: int = Field(default=0, ge=0)  # 0 = unlimited
    volume_cap_per_day: int = Field(default=0, ge=0)  # 0 = unlimited
    priority: int = Field(default=0, ge=0, le=100)


# ---------------------------------------------------------------------------
# V2: Universal block models
# ---------------------------------------------------------------------------

class RetryPolicy(BaseModel):
    enabled: bool = False
    max_attempts: int = Field(default=3, ge=1, le=10)
    backoff_strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL
    backoff_base_ms: int = Field(default=1000, ge=100, le=60000)
    retry_on_status: list[int] = Field(default_factory=lambda: [429, 500, 502, 503, 504])


class NodeExecution(BaseModel):
    timeout_ms: int = Field(default=30000, ge=1000, le=300000)
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    run_if: str = ""
    on_error: OnErrorPolicy = OnErrorPolicy.FAIL


class RateLimit(BaseModel):
    enabled: bool = False
    throttle_key: str = ""
    max_per_minute: int = Field(default=60, ge=1, le=10000)
    max_per_hour: int = Field(default=1000, ge=1, le=100000)


class SecurityPolicy(BaseModel):
    credential_ref: str = ""
    secret_refs: list[str] = Field(default_factory=list)
    redact_output_keys: list[str] = Field(default_factory=list)


class Observability(BaseModel):
    log_level: LogLevel = LogLevel.INFO
    sample_rate: float = Field(default=1.0, ge=0.0, le=1.0)
    metrics_tags: dict[str, str] = Field(default_factory=dict)


class InputMapping(BaseModel):
    source: str = ""
    target: str = ""
    transform: str = ""
    required: bool = True


class OutputMapping(BaseModel):
    source: str = ""
    target: str = ""
    redact: bool = False


class OutputDeclaration(BaseModel):
    key: str
    type: str = "string"
    description: str = ""
    version: int = Field(default=1, ge=1)
    sample_value: Any = None


class NodeUI(BaseModel):
    position: Position = Field(default_factory=Position)
    color_override: str = ""
    icon_override: str = ""
    collapsed_summary_template: str = ""
    pin_sample_data: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# V2: Execution Context Envelope
# ---------------------------------------------------------------------------

class ExecutionMeta(BaseModel):
    id: str = ""
    workflow_id: str = ""
    started_at: str = ""
    step_count: int = 0


class TriggerMeta(BaseModel):
    type: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class ExecutionContext(BaseModel):
    execution: ExecutionMeta = Field(default_factory=ExecutionMeta)
    lead: dict[str, Any] = Field(default_factory=dict)
    trigger: TriggerMeta = Field(default_factory=TriggerMeta)
    vars: dict[str, Any] = Field(default_factory=dict)
    node_outputs: dict[str, dict[str, Any]] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Node config sub-models (per type) — V1 originals kept, V2 enrichments added
# ---------------------------------------------------------------------------

class TriggerManualConfig(BaseModel):
    allow_bulk_start: bool = True


class TriggerNewLeadConfig(BaseModel):
    filter_lists: list[str] = Field(default_factory=list)


class TriggerListMembershipConfig(BaseModel):
    list_ids: list[str] = Field(default_factory=list)


class TriggerInboundWebhookConfig(BaseModel):
    path_key: str = ""
    auth_ref: str = ""
    mapping: dict[str, str] = Field(default_factory=dict)
    # V2
    validate_signature: bool = False
    signature_header: str = "X-Signature"
    signature_secret_ref: str = ""
    allowed_ips: list[str] = Field(default_factory=list)


class TriggerCronConfig(BaseModel):
    cron_expression: str = Field(..., min_length=1)
    timezone: str = "UTC"
    run_missed: CronMissedPolicy = CronMissedPolicy.SKIP
    max_catch_up_runs: int = Field(default=3, ge=0, le=100)
    jitter_seconds: int = Field(default=0, ge=0, le=600)
    dedupe_window_minutes: int = Field(default=15, ge=0, le=1440)
    lead_scope: LeadScope = Field(default_factory=LeadScope)
    # V2
    max_leads_per_run: int = Field(default=1000, ge=1, le=100000)
    catch_up_delay_seconds: int = Field(default=0, ge=0, le=3600)
    pause_on_error_threshold: int = Field(default=10, ge=1, le=1000)


class EmailSendConfig(BaseModel):
    template_id: str = ""
    subject_override: str = ""
    body_override: str = ""
    track_opens: bool = True
    track_clicks: bool = True
    # V2
    thread_mode: str = "new"  # new, reply, forward
    in_reply_to_ref: str = ""
    unsubscribe_link: bool = True
    physical_address: bool = True
    account_selection_strategy: str = "round_robin"  # round_robin, random, lowest_usage
    suppress_if_recently_contacted_hours: int = Field(default=0, ge=0)
    emit_message_id: bool = True


class LinkedInConnectConfig(BaseModel):
    message_template: str = ""
    # V2
    max_message_length: int = Field(default=300, ge=0, le=300)
    skip_if_already_connected: bool = True
    wait_for_acceptance_days: int = Field(default=7, ge=1, le=30)
    withdraw_after_days: int = Field(default=0, ge=0, le=90)


class LinkedInMessageConfig(BaseModel):
    message_template: str = ""
    # V2
    max_message_length: int = Field(default=8000, ge=1, le=8000)
    require_connection: bool = True
    fallback_on_not_connected: str = ""  # edge label or empty


class WaitConfig(BaseModel):
    days: int = Field(default=0, ge=0)
    hours: int = Field(default=0, ge=0)
    # V2
    minutes: int = Field(default=0, ge=0)
    until_time: str = ""  # HH:MM format
    business_days_only: bool = False
    jitter_minutes: int = Field(default=0, ge=0, le=120)

    @model_validator(mode="after")
    def _at_least_some_wait(self) -> "WaitConfig":
        if self.days == 0 and self.hours == 0 and self.minutes == 0 and not self.until_time:
            raise ValueError("Wait node must specify at least some wait time (days, hours, minutes > 0 or until_time)")
        return self


class EndConfig(BaseModel):
    result: str = "success"
    # V2
    final_status: str = "completed"
    emit_event: bool = True


class IfConfig(BaseModel):
    condition: str = ""
    lookback_hours: int = Field(default=168, ge=1)
    # V2
    negate: bool = False
    custom_expression: str = ""


class SwitchConfig(BaseModel):
    field: str = ""
    cases: dict[str, str] = Field(default_factory=dict)
    # V2
    default_branch: str = ""
    case_sensitive: bool = True


class HttpRequestConfig(BaseModel):
    url: str = ""
    method: str = "POST"
    headers: dict[str, str] = Field(default_factory=dict)
    body_template: str = ""
    timeout_seconds: int = Field(default=30, ge=1, le=120)
    retry_count: int = Field(default=0, ge=0, le=5)
    # V2 — Request
    query_params: dict[str, str] = Field(default_factory=dict)
    auth_mode: AuthMode = AuthMode.NONE
    auth_credential_ref: str = ""
    body_mode: BodyMode = BodyMode.NONE
    content_type: str = "application/json"
    follow_redirects: bool = True
    idempotency_key_template: str = ""
    # V2 — Reliability
    backoff_strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL
    circuit_breaker_key: str = ""
    # V2 — Response
    success_criteria: SuccessCriteria = SuccessCriteria.STATUS_2XX
    success_status_codes: list[int] = Field(default_factory=lambda: [200, 201, 202, 204])
    parse_mode: ParseMode = ParseMode.AUTO
    response_mapping: dict[str, str] = Field(default_factory=dict)
    emit_raw_response: bool = False
    # V2 — Branching
    branch_on_status: bool = False
    status_outputs: dict[str, str] = Field(default_factory=dict)
    # V2 — Security
    allowed_domains_ref: str = ""
    ssrf_protection: bool = True
    redact_request_headers: list[str] = Field(default_factory=lambda: ["Authorization", "X-Api-Key"])
    redact_response_body: bool = False


class OutgoingWebhookConfig(BaseModel):
    url: str = ""
    secret_ref: str = ""
    event_types: list[str] = Field(default_factory=list)
    # V2
    signing_algorithm: str = "hmac-sha256"
    include_timestamp: bool = True
    custom_headers: dict[str, str] = Field(default_factory=dict)
    timeout_ms: int = Field(default=10000, ge=1000, le=60000)


class AiGenerateMessageConfig(BaseModel):
    prompt_template: str = ""
    max_tokens: int = Field(default=500, ge=1, le=4000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    # V2
    system_prompt: str = ""
    model_ref: str = ""
    provider: str = ""
    output_format: str = "text"  # text, json
    max_cost_cents: float = Field(default=0, ge=0)
    confidence_threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    fallback_text: str = ""

    model_config = {"protected_namespaces": ()}


class AiClassifyReplyConfig(BaseModel):
    labels: list[str] = Field(default_factory=lambda: ["interested", "not_interested", "out_of_office", "other"])
    # V2
    label_descriptions: dict[str, str] = Field(default_factory=dict)
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    model_ref: str = ""
    multi_label: bool = False
    fallback_label: str = "other"

    model_config = {"protected_namespaces": ()}


class AiExtractFieldsConfig(BaseModel):
    fields: list[str] = Field(default_factory=list)
    # V2
    field_descriptions: dict[str, str] = Field(default_factory=dict)
    field_types: dict[str, str] = Field(default_factory=dict)
    model_ref: str = ""
    strict_schema: bool = False

    model_config = {"protected_namespaces": ()}


class AiDecisionConfig(BaseModel):
    prompt_template: str = ""
    branch_labels: list[str] = Field(default_factory=list)
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    # V2
    system_prompt: str = ""
    model_ref: str = ""
    max_tokens: int = Field(default=500, ge=1, le=4000)
    max_cost_cents: float = Field(default=0, ge=0)

    model_config = {"protected_namespaces": ()}


class AutoRespondConfig(BaseModel):
    tone: str = "professional"
    language: str = "English"
    confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    max_response_length: int = Field(default=500, ge=50, le=5000)
    brand_description: str = ""
    forbidden_words: list[str] = Field(default_factory=list)
    escalation_keywords: list[str] = Field(default_factory=list)
    system_prompt_override: str = ""
    model_ref: str = ""
    max_cost_cents: float = Field(default=0, ge=0)

    model_config = {"protected_namespaces": ()}


class AddNoteConfig(BaseModel):
    note_text: str = ""
    # V2
    note_type: str = "general"
    visible_to: str = "all"  # all, owner, team


class CreateTaskConfig(BaseModel):
    task_title: str = ""
    assignee_ref: str = ""
    # V2
    task_description: str = ""
    priority: str = "medium"  # low, medium, high, urgent
    due_in_hours: int = Field(default=0, ge=0)
    tags: list[str] = Field(default_factory=list)


class ApprovalGateConfig(BaseModel):
    approver_ref: str = ""
    timeout_hours: int = Field(default=24, ge=1)
    # V2
    timeout_action: str = "skip"  # skip, fail, auto_approve
    require_comment: bool = False
    notification_channel: str = ""


class DataCampaignConfig(BaseModel):
    campaign_id: str = ""
    campaign_name: str = ""


class DataLeadListConfig(BaseModel):
    list_id: str = ""
    list_name: str = ""


class MergeConfig(BaseModel):
    pass


# ---------------------------------------------------------------------------
# NODE_CONFIG_MODELS: typed config validation registry
# ---------------------------------------------------------------------------

NODE_CONFIG_MODELS: dict[str, type[BaseModel]] = {
    "trigger_manual": TriggerManualConfig,
    "trigger_new_lead": TriggerNewLeadConfig,
    "trigger_list_membership_added": TriggerListMembershipConfig,
    "trigger_inbound_webhook": TriggerInboundWebhookConfig,
    "trigger_cron": TriggerCronConfig,
    "email_send": EmailSendConfig,
    "linkedin_connect": LinkedInConnectConfig,
    "linkedin_message": LinkedInMessageConfig,
    "wait": WaitConfig,
    "end": EndConfig,
    "if": IfConfig,
    "switch": SwitchConfig,
    "merge": MergeConfig,
    "http_request": HttpRequestConfig,
    "outgoing_webhook": OutgoingWebhookConfig,
    "ai_generate_message": AiGenerateMessageConfig,
    "ai_classify_reply": AiClassifyReplyConfig,
    "ai_extract_fields": AiExtractFieldsConfig,
    "ai_decision": AiDecisionConfig,
    "auto_respond": AutoRespondConfig,
    "add_note": AddNoteConfig,
    "create_task": CreateTaskConfig,
    "approval_gate": ApprovalGateConfig,
    "data_campaign": DataCampaignConfig,
    "data_lead_list": DataLeadListConfig,
}


# ---------------------------------------------------------------------------
# NODE_DEFAULT_OUTPUTS: per-type default output schemas
# ---------------------------------------------------------------------------

NODE_DEFAULT_OUTPUTS: dict[str, list[dict[str, Any]]] = {
    "email_send": [
        {"key": "message_id", "type": "string", "description": "Sent email message ID"},
        {"key": "delivered", "type": "boolean", "description": "Whether email was delivered"},
        {"key": "account_id", "type": "string", "description": "Sending account ID"},
    ],
    "http_request": [
        {"key": "status", "type": "number", "description": "HTTP response status code"},
        {"key": "body", "type": "object", "description": "Response body"},
        {"key": "headers", "type": "object", "description": "Response headers"},
        {"key": "duration_ms", "type": "number", "description": "Request duration in ms"},
    ],
    "ai_generate_message": [
        {"key": "generated_text", "type": "string", "description": "AI-generated text"},
        {"key": "model_used", "type": "string", "description": "Model identifier used"},
        {"key": "tokens_used", "type": "number", "description": "Total tokens consumed"},
        {"key": "cost_cents", "type": "number", "description": "Cost in cents"},
    ],
    "ai_classify_reply": [
        {"key": "label", "type": "string", "description": "Classification label"},
        {"key": "confidence", "type": "number", "description": "Confidence score 0-1"},
        {"key": "all_labels", "type": "object", "description": "All label scores"},
    ],
    "ai_extract_fields": [
        {"key": "extracted", "type": "object", "description": "Extracted field values"},
        {"key": "fields_found", "type": "number", "description": "Number of fields extracted"},
    ],
    "ai_decision": [
        {"key": "decision", "type": "string", "description": "Decision label"},
        {"key": "confidence", "type": "number", "description": "Confidence score 0-1"},
        {"key": "reasoning", "type": "string", "description": "AI reasoning text"},
    ],
    "auto_respond": [
        {"key": "response_sent", "type": "boolean", "description": "Whether response was sent"},
        {"key": "escalated", "type": "boolean", "description": "Whether response was escalated to human"},
        {"key": "confidence", "type": "number", "description": "AI confidence score 0-1"},
        {"key": "intent", "type": "string", "description": "Detected intent of inbound message"},
        {"key": "escalation_reason", "type": "string", "description": "Reason if escalated"},
    ],
    "linkedin_connect": [
        {"key": "request_sent", "type": "boolean", "description": "Whether invite was sent"},
        {"key": "profile_url", "type": "string", "description": "LinkedIn profile URL"},
    ],
    "linkedin_message": [
        {"key": "message_sent", "type": "boolean", "description": "Whether message was sent"},
        {"key": "conversation_id", "type": "string", "description": "LinkedIn conversation ID"},
    ],
    "if": [
        {"key": "condition_met", "type": "boolean", "description": "Whether condition evaluated true"},
        {"key": "evaluated_expression", "type": "string", "description": "The condition string evaluated"},
    ],
    "switch": [
        {"key": "matched_case", "type": "string", "description": "Which case branch matched"},
        {"key": "field_value", "type": "string", "description": "Actual field value evaluated"},
    ],
    "trigger_manual": [
        {"key": "triggered_at", "type": "string", "description": "Trigger timestamp"},
        {"key": "lead_count", "type": "number", "description": "Number of leads triggered"},
    ],
    "trigger_new_lead": [
        {"key": "triggered_at", "type": "string", "description": "Trigger timestamp"},
        {"key": "lead_count", "type": "number", "description": "Number of leads triggered"},
    ],
    "trigger_list_membership_added": [
        {"key": "triggered_at", "type": "string", "description": "Trigger timestamp"},
        {"key": "lead_count", "type": "number", "description": "Number of leads triggered"},
    ],
    "trigger_inbound_webhook": [
        {"key": "triggered_at", "type": "string", "description": "Trigger timestamp"},
        {"key": "lead_count", "type": "number", "description": "Number of leads triggered"},
    ],
    "trigger_cron": [
        {"key": "triggered_at", "type": "string", "description": "Trigger timestamp"},
        {"key": "lead_count", "type": "number", "description": "Number of leads triggered"},
    ],
    "wait": [
        {"key": "waited_ms", "type": "number", "description": "Actual wait duration in ms"},
        {"key": "resumed_at", "type": "string", "description": "Resume timestamp"},
    ],
    "add_note": [
        {"key": "note_id", "type": "string", "description": "Created note ID"},
    ],
    "create_task": [
        {"key": "task_id", "type": "string", "description": "Created task ID"},
    ],
    "approval_gate": [
        {"key": "approved", "type": "boolean", "description": "Whether approved"},
        {"key": "approver", "type": "string", "description": "Who approved"},
        {"key": "comment", "type": "string", "description": "Approval comment"},
    ],
    "outgoing_webhook": [
        {"key": "status", "type": "number", "description": "HTTP response status"},
        {"key": "response_body", "type": "object", "description": "Webhook response body"},
    ],
    "merge": [
        {"key": "merged_count", "type": "number", "description": "Number of branches merged"},
    ],
    "end": [
        {"key": "final_status", "type": "string", "description": "Final workflow status"},
        {"key": "reason", "type": "string", "description": "Completion reason"},
    ],
}


# ---------------------------------------------------------------------------
# V1 Workflow node (kept for backward compat)
# ---------------------------------------------------------------------------

class WorkflowNode(BaseModel):
    """V1/V2 compatible node: V2 fields are optional with defaults."""
    id: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_]+$")
    type: NodeType
    name: str = Field(default="", max_length=255)
    position: Position = Field(default_factory=Position)
    config: dict[str, Any] = Field(default_factory=dict)
    # V2 fields (all optional with defaults for V1 compat)
    description: str = ""
    enabled: bool = True
    version: int = Field(default=1, ge=1)
    input_mapping: list[InputMapping] = Field(default_factory=list)
    output_mapping: list[OutputMapping] = Field(default_factory=list)
    output_schema: list[OutputDeclaration] = Field(default_factory=list)
    execution: NodeExecution = Field(default_factory=NodeExecution)
    rate_limit: RateLimit = Field(default_factory=RateLimit)
    security: SecurityPolicy = Field(default_factory=SecurityPolicy)
    observability: Observability = Field(default_factory=Observability)
    ui: NodeUI = Field(default_factory=NodeUI)


# ---------------------------------------------------------------------------
# Workflow connection (edge)
# ---------------------------------------------------------------------------

class WorkflowConnection(BaseModel):
    from_node: str = Field(..., alias="from", min_length=1)
    to: str = Field(..., min_length=1)
    condition: EdgeCondition = EdgeCondition.ALWAYS
    order: int = Field(default=1, ge=1)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Canvas note (non-executable)
# ---------------------------------------------------------------------------

class CanvasNote(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = ""
    position: Position = Field(default_factory=Position)


# ---------------------------------------------------------------------------
# Top-level workflow definitions
# ---------------------------------------------------------------------------

class WorkflowDefinitionV1(BaseModel):
    """Top-level canonical workflow JSON — schema version 1."""

    schema_version: int = Field(default=1, ge=1, le=1)
    workflow_version: int = Field(default=1, ge=1)
    meta: WorkflowMeta
    settings: WorkflowSettings = Field(default_factory=WorkflowSettings)
    nodes: list[WorkflowNode] = Field(default_factory=list, min_length=1)
    connections: list[WorkflowConnection] = Field(default_factory=list)
    variables: dict[str, str] = Field(default_factory=dict)
    credentials_refs: dict[str, str] = Field(default_factory=dict)
    canvas_notes: list[CanvasNote] = Field(default_factory=list)
    trigger_policies: TriggerPolicies = Field(default_factory=TriggerPolicies)

    @field_validator("nodes")
    @classmethod
    def _unique_node_ids(cls, v: list[WorkflowNode]) -> list[WorkflowNode]:
        ids = [n.id for n in v]
        if len(ids) != len(set(ids)):
            dupes = [nid for nid in ids if ids.count(nid) > 1]
            raise ValueError(f"Duplicate node IDs: {set(dupes)}")
        return v

    @model_validator(mode="after")
    def _connections_reference_valid_nodes(self) -> "WorkflowDefinitionV1":
        node_ids = {n.id for n in self.nodes}
        for conn in self.connections:
            if conn.from_node not in node_ids:
                raise ValueError(f"Connection 'from' references unknown node: {conn.from_node}")
            if conn.to not in node_ids:
                raise ValueError(f"Connection 'to' references unknown node: {conn.to}")
        return self

    @model_validator(mode="after")
    def _at_least_one_trigger(self) -> "WorkflowDefinitionV1":
        triggers = [n for n in self.nodes if n.type in TRIGGER_NODE_TYPES]
        if not triggers:
            raise ValueError("Workflow must have at least one trigger node")
        return self

    @model_validator(mode="after")
    def _at_least_one_end(self) -> "WorkflowDefinitionV1":
        ends = [n for n in self.nodes if n.type == NodeType.END]
        if not ends:
            raise ValueError("Workflow must have at least one end node")
        return self


class WorkflowDefinitionV2(BaseModel):
    """Top-level canonical workflow JSON — schema version 2.

    Same structure as V1 but schema_version=2 and nodes carry all V2 blocks.
    """

    schema_version: int = Field(default=2, ge=2, le=2)
    workflow_version: int = Field(default=1, ge=1)
    meta: WorkflowMeta
    settings: WorkflowSettings = Field(default_factory=WorkflowSettings)
    nodes: list[WorkflowNode] = Field(default_factory=list, min_length=1)
    connections: list[WorkflowConnection] = Field(default_factory=list)
    variables: dict[str, str] = Field(default_factory=dict)
    credentials_refs: dict[str, str] = Field(default_factory=dict)
    canvas_notes: list[CanvasNote] = Field(default_factory=list)
    trigger_policies: TriggerPolicies = Field(default_factory=TriggerPolicies)

    @field_validator("nodes")
    @classmethod
    def _unique_node_ids(cls, v: list[WorkflowNode]) -> list[WorkflowNode]:
        ids = [n.id for n in v]
        if len(ids) != len(set(ids)):
            dupes = [nid for nid in ids if ids.count(nid) > 1]
            raise ValueError(f"Duplicate node IDs: {set(dupes)}")
        return v

    @model_validator(mode="after")
    def _connections_reference_valid_nodes(self) -> "WorkflowDefinitionV2":
        node_ids = {n.id for n in self.nodes}
        for conn in self.connections:
            if conn.from_node not in node_ids:
                raise ValueError(f"Connection 'from' references unknown node: {conn.from_node}")
            if conn.to not in node_ids:
                raise ValueError(f"Connection 'to' references unknown node: {conn.to}")
        return self

    @model_validator(mode="after")
    def _at_least_one_trigger(self) -> "WorkflowDefinitionV2":
        triggers = [n for n in self.nodes if n.type in TRIGGER_NODE_TYPES]
        if not triggers:
            raise ValueError("Workflow must have at least one trigger node")
        return self

    @model_validator(mode="after")
    def _at_least_one_end(self) -> "WorkflowDefinitionV2":
        ends = [n for n in self.nodes if n.type == NodeType.END]
        if not ends:
            raise ValueError("Workflow must have at least one end node")
        return self


# ---------------------------------------------------------------------------
# V1 → V2 migration
# ---------------------------------------------------------------------------

def migrate_v1_to_v2(raw: dict[str, Any]) -> dict[str, Any]:
    """Upgrade a V1 workflow JSON dict to V2 format.

    - Promotes position → ui.position
    - Adds default blocks to each node
    - Populates output_schema from NODE_DEFAULT_OUTPUTS
    - Sets schema_version=2
    - Idempotent: already-V2 data passes through unchanged
    """
    data = copy.deepcopy(raw)

    if data.get("schema_version", 1) >= 2:
        return data

    data["schema_version"] = 2

    # Ensure settings has max_context_size_bytes
    settings = data.get("settings", {})
    if "max_context_size_bytes" not in settings:
        settings["max_context_size_bytes"] = 512_000
    data["settings"] = settings

    for node in data.get("nodes", []):
        # Promote position → ui.position
        pos = node.get("position", {"x": 0, "y": 0})
        if "ui" not in node:
            node["ui"] = {}
        if "position" not in node["ui"]:
            node["ui"]["position"] = pos

        # Add default V2 blocks if missing
        node.setdefault("description", "")
        node.setdefault("enabled", True)
        node.setdefault("version", 1)
        node.setdefault("input_mapping", [])
        node.setdefault("output_mapping", [])
        node.setdefault("execution", {})
        node.setdefault("rate_limit", {})
        node.setdefault("security", {})
        node.setdefault("observability", {})

        # Populate output_schema from defaults if empty
        if not node.get("output_schema"):
            ntype = node.get("type", "")
            defaults = NODE_DEFAULT_OUTPUTS.get(ntype, [])
            node["output_schema"] = [
                {"key": d["key"], "type": d["type"], "description": d["description"], "version": 1}
                for d in defaults
            ]

    return data


# ---------------------------------------------------------------------------
# API response wrappers
# ---------------------------------------------------------------------------

class WorkflowDefinitionResponse(BaseModel):
    id: UUID
    campaign_id: Optional[UUID] = None
    name: str = ""
    description: Optional[str] = None
    schema_version: int
    workflow_version: int
    status: str
    canonical_json: dict[str, Any]
    published_at: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class WorkflowListItemResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    campaign_id: Optional[UUID] = None
    status: str
    workflow_version: int
    node_count: int = 0
    created_at: str
    updated_at: str


class WorkflowCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    campaign_id: Optional[UUID] = None
    canonical_json: Optional[dict[str, Any]] = None


class DataSourcesResponse(BaseModel):
    campaigns: list[dict[str, Any]] = Field(default_factory=list)
    lead_lists: list[dict[str, Any]] = Field(default_factory=list)


class WorkflowValidationError(BaseModel):
    path: str = ""
    message: str


class WorkflowValidationResult(BaseModel):
    valid: bool
    errors: list[WorkflowValidationError] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Execution log response models
# ---------------------------------------------------------------------------

class ExecutionLogEntry(BaseModel):
    id: str
    workflow_id: str
    lead_id: str
    node_id: str
    started_at: str
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    status: str  # success, error, skipped
    input_snapshot: dict[str, Any] = Field(default_factory=dict)
    output_snapshot: dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class ContextSchemaResponse(BaseModel):
    """Response for GET /api/workflows/{id}/context-schema."""
    lead_fields: list[str] = Field(default_factory=list)
    trigger_fields: list[str] = Field(default_factory=list)
    variables: list[str] = Field(default_factory=list)
    node_outputs: dict[str, list[OutputDeclaration]] = Field(default_factory=dict)
