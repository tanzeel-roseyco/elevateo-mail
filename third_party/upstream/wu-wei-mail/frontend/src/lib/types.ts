// ─── Auth ───────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  workspace_id: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  workspace_id: string;
}

// ─── Campaigns ──────────────────────────────────────────────
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";

export type ExecutionMode = "sequence" | "workflow";

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  status: CampaignStatus;
  description?: string;
  execution_mode?: ExecutionMode;
  timezone: string;
  send_days?: Record<string, boolean>;
  send_start_hour: number;
  send_end_hour: number;
  daily_limit: number;
  stop_on_reply: boolean;
  track_opens: boolean;
  track_clicks: boolean;
  sequences: Sequence[];
  created_at: string;
  updated_at: string;
}

export interface CampaignCreate {
  name: string;
  description?: string;
  timezone: string;
  send_days?: Record<string, boolean>;
  send_start_hour: number;
  send_end_hour: number;
  daily_limit: number;
  stop_on_reply: boolean;
  track_opens: boolean;
  track_clicks: boolean;
}

export interface Sequence {
  id: string;
  campaign_id: string;
  name: string;
  order: number;
  steps: Step[];
  created_at: string;
}

export interface Step {
  id: string;
  sequence_id: string;
  order: number;
  step_type: string;
  wait_days: number;
  subject?: string;
  body?: string;
  created_at: string;
}

export interface StepCreate {
  order: number;
  step_type: string;
  wait_days: number;
  subject?: string;
  body?: string;
}

export interface Variant {
  id: string;
  step_id: string;
  name: string;
  subject: string;
  body: string;
  weight: number;
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  bounce_count: number;
  created_at: string;
}

export interface VariantCreate {
  name: string;
  subject: string;
  body: string;
  weight: number;
}

// ─── Leads ──────────────────────────────────────────────────
export type LeadStatus = "active" | "bounced" | "replied" | "unsubscribed";

export interface Lead {
  id: string;
  workspace_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  linkedin_url?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  custom_fields?: Record<string, string>;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

/** Convenience helper — derives display name from first/last. */
export function leadDisplayName(lead: Lead): string {
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : lead.email;
}

export interface LeadCreate {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  linkedin_url?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  custom_fields?: Record<string, string>;
}

export interface LeadList {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  member_count: number;
  created_at: string;
}

export interface LeadBulkAction {
  lead_ids: string[];
  action: "delete" | "add_to_list" | "remove_from_list";
  list_id?: string;
}

export interface LeadPersonalizationRequest {
  list_id: string;
  source_column: string;
  source_custom_field?: string;
  target_field: string;
  tone?: string;
  instructions?: string;
  limit?: number;
}

export interface LeadPersonalizationResult {
  lead_id: string;
  email: string;
  status: "updated" | "skipped" | "failed";
  reason?: string;
  personalization?: string;
}

export interface LeadPersonalizationResponse {
  list_id: string;
  source_column: string;
  source_custom_field?: string;
  target_field: string;
  template_variable: string;
  alias_template_variable: string;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  results: LeadPersonalizationResult[];
}

export interface LeadPersonalizationJobCreateResponse {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed" | string;
}

export interface LeadPersonalizationJobProgress {
  processed: number;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  progress_percent: number;
}

export interface LeadPersonalizationJobStatusResponse {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  progress: LeadPersonalizationJobProgress;
  result?: LeadPersonalizationResponse | null;
  error?: string | null;
}

export interface CSVImportResponse {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: string[];
}

// ─── Templates ──────────────────────────────────────────────
export interface Template {
  id: string;
  workspace_id: string;
  name: string;
  subject: string;
  body: string;
  category?: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreate {
  name: string;
  subject: string;
  body: string;
  category?: string;
}

export interface TemplatePreviewRequest {
  subject: string;
  body: string;
  sample_data: Record<string, string>;
}

export interface TemplatePreviewResponse {
  subject: string;
  body: string;
  variables_found: string[];
  errors: string[];
}

// ─── Accounts ───────────────────────────────────────────────
export type AccountProvider = "google" | "microsoft" | "manual";

export interface OAuthProvidersResponse {
  google: { enabled: boolean };
  microsoft: { enabled: boolean };
}

export interface Account {
  id: string;
  workspace_id: string;
  email: string;
  display_name?: string;
  smtp_host?: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  imap_host?: string;
  imap_port: number;
  daily_limit: number;
  sent_today: number;
  health_score: number;
  warmup_enabled: boolean;
  warmup_level: number;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  is_active: boolean;
  provider: AccountProvider;
  provider_email?: string;
  created_at: string;
  updated_at: string;
}

/** Derives a UI-friendly status from backend account fields. */
export function accountStatus(
  a: Account,
): "connected" | "warming" | "error" | "disconnected" {
  if (!a.is_active) return "disconnected";
  if (a.health_score < 0.5) return "error";
  if (a.warmup_enabled && a.warmup_level < a.daily_limit) return "warming";
  return "connected";
}

export interface AccountCreate {
  email: string;
  display_name?: string;
  smtp_host?: string;
  smtp_port: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_use_tls: boolean;
  imap_host?: string;
  imap_port: number;
  imap_username?: string;
  imap_password?: string;
  daily_limit: number;
  warmup_enabled: boolean;
}

export interface DNSCheckResponse {
  email: string;
  domain: string;
  spf: Record<string, unknown>;
  dkim: Record<string, unknown>;
  dmarc: Record<string, unknown>;
  overall_healthy: boolean;
}

export interface ConnectionTestResponse {
  success: boolean;
  smtp_ok: boolean;
  smtp_error?: string;
  message: string;
}

// ─── Inbox ──────────────────────────────────────────────────
export interface InboxMessage {
  id: string;
  workspace_id: string;
  account_id: string;
  campaign_id?: string;
  lead_id?: string;
  from_email: string;
  to_email: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  direction: "inbound" | "outbound";
  is_read: boolean;
  is_auto_reply: boolean;
  thread_id?: string;
  received_at: string;
  created_at: string;
}

export interface InboxThread {
  thread_id: string;
  subject: string;
  lead_email: string;
  account_email: string;
  message_count: number;
  last_message_at: string;
  is_read: boolean;
  messages: InboxMessage[];
}

export interface InboxReplyRequest {
  to_email: string;
  account_id: string;
  subject: string;
  body: string;
  thread_id?: string;
}

export interface InboxStats {
  total: number;
  unread: number;
  auto_replies: number;
}

// ─── Analytics ──────────────────────────────────────────────
export interface DashboardStats {
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
  total_bounces: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
  active_campaigns: number;
  total_leads: number;
  emails_today: number;
}

export interface CampaignStats {
  campaign_id: string;
  campaign_name: string;
  status: string;
  total_leads: number;
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  total_replies: number;
  total_bounces: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
}

export interface VariantStats {
  variant_id: string;
  variant_name: string;
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  bounce_count: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
}

export interface ABTestResult {
  step_id: string;
  variants: VariantStats[];
  winner?: string;
  confidence: number;
  is_significant: boolean;
}

export interface TimeSeriesPoint {
  date: string;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
}

// ─── Workspace Settings ─────────────────────────────────────
export interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  unsubscribe_text: string | null;
  gdpr_enabled: boolean;
  can_spam_enabled: boolean;
}

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export type DeveloperTokenScope =
  | "full_access"
  | "leads:read"
  | "leads:write"
  | "templates:read"
  | "templates:write"
  | "campaigns:read"
  | "campaigns:write"
  | "campaigns:launch"
  | "analytics:read"
  | "compliance:read"
  | "compliance:write"
  | "inbox:read"
  | "inbox:reply";

export interface DeveloperToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: DeveloperTokenScope[];
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
}

export interface DeveloperTokenListResponse {
  items: DeveloperToken[];
}

export interface DeveloperTokenCreateResponse extends DeveloperToken {
  token: string;
}

// ─── Compliance ─────────────────────────────────────────────
export interface Suppression {
  id: string;
  workspace_id: string;
  email: string;
  reason?: string;
  created_at: string;
}

// ─── Auto-Responder ────────────────────────────────────────
export interface AutoResponderConfig {
  id: string;
  workspace_id: string;
  is_enabled: boolean;
  ai_model: string;
  tone: "formal" | "professional" | "casual" | "friendly";
  brand_description?: string;
  example_phrases?: string[];
  forbidden_words?: string[];
  signature_template?: string;
  language: string;
  max_response_length: number;
  confidence_threshold: number;
  escalation_keywords?: string[];
  max_responses_per_hour: number;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ResponderRegion {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  priority: number;
  is_active: boolean;
  conditions: RegionConditions;
  tone_override?: string;
  example_phrases_override?: string[];
  custom_system_prompt?: string;
  created_at: string;
  updated_at: string;
}

export interface RegionConditions {
  rules: RegionConditionRule[];
  match_all: boolean;
}

export interface RegionConditionRule {
  field: string;
  operator: "eq" | "neq" | "in" | "not_in" | "contains" | "starts_with";
  value: string | string[];
}

export interface ResponderRule {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  priority: number;
  campaign_id?: string;
  region_id?: string;
  action: "auto_respond" | "escalate" | "skip";
  response_template?: string;
  delay_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ResponderNote {
  id: string;
  workspace_id: string;
  inbox_message_id: string;
  author_type: "user" | "ai" | "system";
  author_id?: string;
  content: string;
  note_type: string;
  created_at: string;
}

export interface ResponderLog {
  id: string;
  workspace_id: string;
  inbox_message_id: string;
  response_message_id?: string;
  lead_id?: string;
  campaign_id?: string;
  region_id?: string;
  rule_id?: string;
  ai_model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  generated_subject?: string;
  generated_body: string;
  confidence_score?: number;
  status: "pending" | "sent" | "escalated" | "rejected" | "failed";
  escalation_reason?: string;
  processing_time_ms?: number;
  created_at: string;
  sent_at?: string;
}

export interface ResponderQueueItem {
  inbox_message_id: string;
  lead_email: string;
  lead_name?: string;
  subject: string;
  body_preview?: string;
  campaign_name?: string;
  region_name?: string;
  responder_status?: string;
  confidence_score?: number;
  generated_body?: string;
  received_at: string;
}

export interface AutoResponderAnalytics {
  total_processed: number;
  total_responded: number;
  total_escalated: number;
  total_skipped: number;
  avg_confidence?: number;
  avg_response_time_ms?: number;
  escalation_rate: number;
}

export interface AutoResponderTimeSeriesPoint {
  date: string;
  responded: number;
  escalated: number;
  skipped: number;
}

// ─── Prospecting ────────────────────────────────────────────
export type ProspectingStage =
  | "DISCOVERY"
  | "SELECTION"
  | "COPYWRITING"
  | "CAMPAIGN_SETUP"
  | "LAUNCH_READY"
  | "LAUNCHED";

export interface ProspectingConversation {
  id: string;
  workspace_id: string;
  created_by: string;
  title?: string;
  stage: ProspectingStage;
  is_active: boolean;
  metadata_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProspectingMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_type?: string;
  model_used?: string;
  metadata_json?: Record<string, unknown>;
  token_count?: number;
  created_at: string;
}

export interface ProspectingLead {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  domain?: string;
  quality_score?: number;
  readiness_band?: string;
  email_confidence?: number;
  source_name?: string;
  is_excluded: boolean;
  exclusion_reason?: string;
  is_selected: boolean;
  imported_lead_id?: string;
  created_at: string;
}

export interface ProspectingRun {
  id: string;
  workspace_id: string;
  conversation_id: string;
  run_type: string;
  status: string;
  icp_criteria?: Record<string, unknown>;
  source_strategy?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  error_detail?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface ProspectingAction {
  id: string;
  action_type: string;
  status: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  approved_by?: string;
  approved_at?: string;
  executed_at?: string;
  created_at: string;
}

export interface CopyVariant {
  subject: string;
  body: string;
  variant_label?: string;
}

export interface CopyDraftResponse {
  conversation_id: string;
  variants: CopyVariant[];
  metadata?: Record<string, unknown>;
}

export interface CampaignActionResponse {
  target_type: string;
  campaign_id?: string;
  conversation_id: string;
  source_list_id?: string;
  created_by_agent?: string;
  launch_status: string;
}

export interface LeadImportResponse {
  imported_count: number;
  duplicate_count: number;
  lead_list_id: string;
  imported_lead_ids: string[];
}

export interface PersonalizationSettings {
  api_key_configured: boolean;
  api_key_source: "workspace" | "env" | "none" | string;
  model_id: string;
  model_source: "policy" | "default" | string;
}

// ─── Warmup ─────────────────────────────────────────────────
export type WarmupPhase =
  | "enrolling"
  | "ramping"
  | "steady"
  | "graduating"
  | "graduated"
  | "paused"
  | "error";

export interface WarmupProgram {
  id: string;
  workspace_id: string;
  mode: string;
  default_target_volume: number;
  ramp_increment_per_day: number;
  max_daily_warmup: number;
  dns_required: boolean;
  auto_pause_on_bounce_rate: number;
  auto_pause_on_complaint_rate: number;
  created_at: string;
  updated_at: string;
}

export interface WarmupAccountStatus {
  account_id: string;
  workspace_id: string;
  phase: WarmupPhase;
  target_volume: number;
  current_allowed_volume: number;
  actual_sent_today: number;
  warmup_health_score: number;
  inbox_placement_rate: number;
  enrolled_at?: string;
  graduated_at?: string;
  paused_at?: string;
  pause_reason?: string;
  provider_name?: string;
  provider_status?: string;
  last_synced_at?: string;
  risk_flags: string[];
  recent_metrics: WarmupDailyMetric[];
}

export interface WarmupDailyMetric {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  spam_reported: number;
  inbox_placed: number;
  spam_placed: number;
}

export interface WarmupAction {
  id: string;
  action_type: string;
  status: string;
  source: string;
  detail?: Record<string, unknown>;
  created_at: string;
}

// ─── Workflow / Multichannel ────────────────────────────────
export type NodeType =
  | "trigger_manual" | "trigger_new_lead" | "trigger_list_membership_added"
  | "trigger_inbound_webhook" | "trigger_cron"
  | "email_send" | "linkedin_connect" | "linkedin_message" | "auto_respond" | "wait" | "end"
  | "if" | "switch" | "merge"
  | "http_request" | "outgoing_webhook"
  | "ai_generate_message" | "ai_classify_reply" | "ai_extract_fields" | "ai_decision"
  | "add_note" | "create_task" | "approval_gate"
  | "data_campaign" | "data_lead_list";

export type EdgeCondition = "always" | "yes" | "no" | "timeout_elapsed" | "error_code_match";

// V2 enums
export type BackoffStrategy = "fixed" | "linear" | "exponential";
export type OnErrorPolicy = "fail" | "skip" | "retry" | "fallback_edge";
export type LogLevel = "none" | "error" | "warn" | "info" | "debug";
export type AuthMode = "none" | "bearer_token" | "basic" | "api_key_header" | "oauth2_client";
export type BodyMode = "none" | "json_template" | "form_urlencoded" | "raw_text";
export type ParseMode = "json" | "text" | "headers_only" | "auto";
export type SuccessCriteria = "status_2xx" | "status_code_in" | "body_contains" | "jsonpath_truthy";

// V2 universal block interfaces
export interface RetryPolicy {
  enabled: boolean;
  max_attempts: number;
  backoff_strategy: BackoffStrategy;
  backoff_base_ms: number;
  retry_on_status: number[];
}

export interface NodeExecution {
  timeout_ms: number;
  retry_policy: RetryPolicy;
  run_if: string;
  on_error: OnErrorPolicy;
}

export interface NodeRateLimit {
  enabled: boolean;
  throttle_key: string;
  max_per_minute: number;
  max_per_hour: number;
}

export interface NodeSecurity {
  credential_ref: string;
  secret_refs: string[];
  redact_output_keys: string[];
}

export interface NodeObservability {
  log_level: LogLevel;
  sample_rate: number;
  metrics_tags: Record<string, string>;
}

export interface InputMapping {
  source: string;
  target: string;
  transform: string;
  required: boolean;
}

export interface OutputMapping {
  source: string;
  target: string;
  redact: boolean;
}

export interface OutputDeclaration {
  key: string;
  type: string;
  description: string;
  version: number;
  sample_value?: unknown;
}

export interface NodeUI {
  position: { x: number; y: number };
  color_override: string;
  icon_override: string;
  collapsed_summary_template: string;
  pin_sample_data: Record<string, unknown>;
}

// V2 Execution Context
export interface ExecutionMeta {
  id: string;
  workflow_id: string;
  started_at: string;
  step_count: number;
}

export interface TriggerMeta {
  type: string;
  payload: Record<string, unknown>;
}

export interface ExecutionContext {
  execution: ExecutionMeta;
  lead: Record<string, unknown>;
  trigger: TriggerMeta;
  vars: Record<string, unknown>;
  node_outputs: Record<string, Record<string, unknown>>;
}

// Execution log entry (for last run data / logs tabs)
export interface ExecutionLogEntry {
  id: string;
  workflow_id: string;
  lead_id: string;
  node_id: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  status: "success" | "error" | "skipped";
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
  error_message?: string;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  // V2 fields (optional with defaults for V1 compat)
  description?: string;
  enabled?: boolean;
  version?: number;
  input_mapping?: InputMapping[];
  output_mapping?: OutputMapping[];
  output_schema?: OutputDeclaration[];
  execution?: NodeExecution;
  rate_limit?: NodeRateLimit;
  security?: NodeSecurity;
  observability?: NodeObservability;
  ui?: NodeUI;
}

export interface WorkflowConnection {
  from: string;
  to: string;
  condition: EdgeCondition;
  order: number;
}

export interface WorkflowDefinition {
  schema_version: number;
  workflow_version: number;
  meta: { name: string; description: string; tags: string[] };
  settings: {
    timezone: string;
    prevent_same_day_cross_channel_touch: boolean;
    max_node_executions_per_lead: number;
    max_context_size_bytes?: number;
  };
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  variables: Record<string, string>;
  credentials_refs: Record<string, string>;
  canvas_notes: { id: string; text: string; position: { x: number; y: number } }[];
  trigger_policies: { dedupe_window_minutes: number; max_catch_up_runs: number };
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: { path: string; message: string }[];
  warnings: string[];
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  campaign_id?: string;
  status: string;
  workflow_version: number;
  node_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCreateRequest {
  name: string;
  description?: string;
  campaign_id?: string;
  canonical_json?: WorkflowDefinition;
}

export interface WorkflowDefinitionResponse {
  id: string;
  campaign_id?: string;
  name: string;
  description?: string;
  schema_version: number;
  workflow_version: number;
  status: string;
  canonical_json: WorkflowDefinition;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ContextSchemaResponse {
  lead_fields: string[];
  trigger_fields: string[];
  variables: string[];
  node_outputs: Record<string, OutputDeclaration[]>;
}

export type OutreachChannel = "email" | "linkedin";

export interface OutreachAccount {
  id: string;
  channel: OutreachChannel;
  provider: string;
  status: string;
  display_name?: string;
  profile_url?: string;
  health_score: number;
  daily_invitation_limit?: number;
  daily_message_limit?: number;
}

// ─── Workflow Enrollment ────────────────────────────────────
export interface WorkflowEnrollRequest {
  lead_ids?: string[];
  list_id?: string;
}

export interface WorkflowEnrollResponse {
  enrolled: number;
  duplicates: number;
  errors: string[];
}

export interface WorkflowLeadStateEntry {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_email: string;
  current_node_id: string | null;
  status: string;
  execution_count: number;
  next_run_at: string | null;
  last_error: string | null;
}

export interface WorkflowLeadSummary {
  pending: number;
  running: number;
  waiting: number;
  completed: number;
  failed: number;
  paused: number;
  dead_lettered: number;
  total: number;
}

// ─── Pagination ─────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}
