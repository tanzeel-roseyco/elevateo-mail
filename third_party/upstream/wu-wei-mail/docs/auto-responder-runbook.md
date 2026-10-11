# Auto-Responder Runbook

## 1. Overview

The auto-responder is an AI-powered feature that automatically generates and sends replies to inbound campaign email responses. When a lead replies to a campaign email, the system uses **OpenRouter** (https://openrouter.ai) -- a unified API gateway that routes requests to any LLM model (OpenAI, Anthropic, Google, Meta, etc.) -- to generate a contextually appropriate response. The feature includes brand voice customization, guardrail enforcement, region-based routing, rule-based actions, opt-out detection, and a human-in-the-loop escalation queue.

---

## 2. Architecture

### Data Flow

```
Inbound email
  -> InboundService.process_inbound()
    -> Celery task: process_auto_response(inbox_message_id)
      -> 1.  Load InboxMessage from database
      -> 2.  Check AutoResponderConfig.is_enabled
      -> 3.  Load Lead record
      -> 4.  Check suppression list
      -> 5.  Check opt-out keywords in message body
      -> 6.  Check rate limit (max_responses_per_hour)
      -> 7.  Check cooldown (per-lead cooldown_minutes)
      -> 8.  Match region (by lead fields, highest priority first)
      -> 9.  Match rule (by campaign + region, highest priority first)
      -> 10. Load conversation history (thread-based, last 10 messages)
      -> 11. Build system + user prompts (brand voice, lead context, history)
      -> 12. Call OpenRouter API (via openai SDK with base_url override)
      -> 13. Apply guardrails (confidence, forbidden words, escalation keywords, length)
      -> 14. Select sending account (same account that received the inbound)
      -> 15. Send response via SMTP
      -> 16. Create outbound InboxMessage record
      -> 17. Create ResponderLog + ResponderNote (intent classification)
```

### Key Components

| Component | Location | Description |
|---|---|---|
| `AutoResponderConfig` | `backend/app/models/auto_responder.py` | Per-workspace configuration: AI model, brand voice, guardrails, rate limits |
| `ResponderRegion` | `backend/app/models/auto_responder.py` | Lead segmentation by field conditions with voice overrides |
| `ResponderRule` | `backend/app/models/auto_responder.py` | Campaign/region-specific action rules (auto_respond, escalate, skip) |
| `ResponderNote` | `backend/app/models/auto_responder.py` | Annotations on messages (user, AI, or system authored) |
| `ResponderLog` | `backend/app/models/auto_responder.py` | Full audit log of every AI generation attempt |
| `AutoResponderService` | `backend/app/services/auto_responder_service.py` | Business logic: config, region matching, guardrails, rate limiting, analytics |
| `ai_provider.generate_response` | `backend/app/services/ai_provider.py` | OpenRouter API client (openai SDK with base_url override) |
| `auto_responder_worker` | `backend/app/workers/auto_responder_worker.py` | Celery task definitions for async processing |
| `auto_responder` router | `backend/app/routers/auto_responder.py` | FastAPI REST endpoints under `/api/auto-responder/` |
| `InboundService` | `backend/app/services/inbound_service.py` | Triggers `process_auto_response` when a campaign reply arrives |

---

## 3. Environment Variables

Add these to your `.env` file or deployment environment:

```bash
# Fernet symmetric encryption key for encrypting OpenRouter API keys at rest.
# Generate one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=

# Fallback OpenRouter API key. Used only when a workspace has no key configured
# in auto_responder_configs.ai_api_key_encrypted. Get yours at https://openrouter.ai/keys
OPENROUTER_API_KEY=
```

**Important**: The `ENCRYPTION_KEY` must remain constant once set. Changing it will make all previously encrypted API keys unreadable. Back up this key securely.

---

## 4. Python Dependencies

The auto-responder requires two additional packages:

```
openai>=1.0        # Used as the OpenRouter client via base_url override to https://openrouter.ai/api/v1
cryptography>=41.0 # Fernet symmetric encryption for API keys stored in the database
```

Install with:

```bash
pip install openai>=1.0 cryptography>=41.0
```

These should already be listed in `requirements.txt` or `pyproject.toml`.

---

## 5. Database

### New Tables

| Table | Description |
|---|---|
| `auto_responder_configs` | One row per workspace. Stores AI model, brand voice, guardrails, rate limits, and the encrypted OpenRouter API key. |
| `responder_regions` | Lead segmentation rules with JSON conditions and optional voice overrides. |
| `responder_rules` | Action rules scoped to campaign and/or region. Actions: `auto_respond`, `escalate`, `skip`. |
| `responder_notes` | Annotations attached to inbox messages. Author types: `user`, `ai`, `system`. |
| `responder_logs` | Complete audit trail: AI model used, token counts, generated text, confidence score, status, timing. |

### Modified Table

| Table | Change |
|---|---|
| `inbox_messages` | Added `responder_status` column (`pending`, `responded`, `escalated`, `skipped`, or `NULL` if not processed) |

### Creating / Updating Tables

```bash
alembic upgrade head
```

This runs all pending migrations to create or update database tables. For local dev only, `python create_tables.py` is also available but deprecated.

---

## 6. Celery Tasks

### `process_auto_response`

- **Trigger**: Called by `InboundService.process_inbound()` when a non-auto-reply inbound message is linked to a campaign.
- **Behavior**: Runs the full 17-step pipeline described in the Architecture section above.
- **Retry**: If rate-limited, re-queues itself with a 60-second countdown.

### `retry_failed_responses`

- **Schedule**: Every 5 minutes (300 seconds).
- **Behavior**: Finds up to 20 `InboxMessage` records with `responder_status = 'pending'` that were received more than 10 minutes ago, and re-queues each one via `process_auto_response.delay()`.
- **Purpose**: Catches messages that failed silently or were stuck due to transient errors.

### `cleanup_old_logs`

- **Schedule**: Daily at 3:00 AM UTC (`crontab(hour=3, minute=0)`).
- **Behavior**: Deletes all rows from `responder_logs` where `created_at` is older than 90 days.
- **Purpose**: Prevents unbounded table growth.

### Worker Discovery

No new worker process or configuration is needed. The existing Celery worker auto-discovers the `app.workers.auto_responder_worker` module (it is listed in the `include` array of `celery_app.py`). The beat schedule entries are also already registered in `celery_app.py`.

Start the worker and beat scheduler as usual:

```bash
celery -A app.workers.celery_app worker --loglevel=info
celery -A app.workers.celery_app beat --loglevel=info
```

---

## 7. API Endpoints

All endpoints are mounted at **`/api/auto-responder/`** and require JWT authentication via the `Authorization: Bearer <token>` header.

### Configuration

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/config` | Get or create the workspace auto-responder config |
| `PATCH` | `/api/auto-responder/config` | Update config fields (partial update). Include `ai_api_key` to set/change the OpenRouter key (encrypted at rest). |
| `POST` | `/api/auto-responder/config/test` | Test the AI provider by sending a sample message and getting a preview response |

### Regions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/regions` | List all regions (sorted by priority descending) |
| `POST` | `/api/auto-responder/regions` | Create a new region |
| `GET` | `/api/auto-responder/regions/{region_id}` | Get a single region by ID |
| `PATCH` | `/api/auto-responder/regions/{region_id}` | Update a region (partial update) |
| `DELETE` | `/api/auto-responder/regions/{region_id}` | Delete a region |

### Rules

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/rules` | List all rules (sorted by priority descending) |
| `POST` | `/api/auto-responder/rules` | Create a new rule |
| `PATCH` | `/api/auto-responder/rules/{rule_id}` | Update a rule (partial update) |
| `DELETE` | `/api/auto-responder/rules/{rule_id}` | Delete a rule |

### Queue (Escalation Review)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/queue` | Get paginated queue of messages with responder status. Query params: `status`, `campaign_id`, `skip`, `limit`. |
| `POST` | `/api/auto-responder/queue/{message_id}/approve` | Approve an escalated message: sends the AI-generated response via SMTP |
| `POST` | `/api/auto-responder/queue/{message_id}/reject` | Reject an escalated message: marks as skipped, no email sent |
| `POST` | `/api/auto-responder/queue/{message_id}/retry` | Re-run AI generation for a message (re-queues `process_auto_response`) |

### Notes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/notes/{message_id}` | List notes attached to a message |
| `POST` | `/api/auto-responder/notes/{message_id}` | Add a note to a message |
| `DELETE` | `/api/auto-responder/notes/{note_id}` | Delete a note |

### Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/logs` | Paginated list of responder logs. Query params: `status`, `skip`, `limit`. |

### Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-responder/analytics/summary` | Aggregate summary: total processed, responded, escalated, skipped, avg confidence, avg response time, escalation rate. Query param: `days` (default 30). |
| `GET` | `/api/auto-responder/analytics/time-series` | Daily breakdown of responded/escalated/skipped counts. Query param: `days` (default 30). |
| `GET` | `/api/auto-responder/analytics/regions` | Per-region stats: total responses, avg confidence, escalation rate. Query param: `days` (default 30). |

---

## 8. Configuration Guide

### Step-by-Step Setup

1. **Navigate to the Auto-Responder page** in the application sidebar.

2. **Enter your OpenRouter API key**. Get one at https://openrouter.ai/keys. The key is encrypted with Fernet before being stored in the database. If no per-workspace key is provided, the system falls back to the `OPENROUTER_API_KEY` environment variable.

3. **Select an AI model**. Use any OpenRouter model ID (see Section 9). For example:
   - `openai/gpt-4o` -- best quality, higher cost
   - `openai/gpt-4o-mini` -- good balance of quality and cost
   - `anthropic/claude-sonnet-4-20250514` -- strong reasoning, good for nuanced replies
   - `google/gemini-2.0-flash` -- fast and affordable

4. **Configure brand voice**:
   - **Tone**: `formal`, `professional`, `casual`, or `friendly`
   - **Brand description**: Free-text description of your company/product that the AI uses for context
   - **Example phrases**: Phrases that exemplify your brand voice for the AI to emulate
   - **Signature template**: Appended to every auto-response (e.g., name + title + company)
   - **Language**: ISO language code (default `en`)

5. **Set guardrails**:
   - **Confidence threshold** (0.0-1.0, default 0.7): Messages where the AI reports confidence below this value are escalated for human review instead of being sent automatically.
   - **Forbidden words**: List of words/phrases the AI must never include in responses. If detected, the message is escalated.
   - **Escalation keywords**: Keywords in the *inbound* message that trigger automatic escalation (e.g., "lawyer", "legal", "cancel subscription", "refund").
   - **Max response length** (default 500 characters): Hard cap on AI response body length. Responses exceeding 2x this value are escalated.

6. **Set rate limits**:
   - **Max responses per hour** (default 50): Prevents runaway sending. Messages exceeding this limit are re-queued with a 60-second delay.
   - **Cooldown minutes** (default 5): Minimum time between auto-responses to the same lead.

7. **Optionally create regions** for lead segmentation:
   - Regions match leads based on field conditions (e.g., `industry eq "technology"`, `country in ["US", "CA"]`).
   - Matched regions can override tone, example phrases, and provide a custom system prompt.
   - Regions are evaluated in priority order (highest first); first match wins.

8. **Optionally create rules** for campaign/region-specific behavior:
   - Rules can target a specific campaign, a specific region, or both.
   - Actions: `auto_respond` (default), `escalate` (send to review queue), `skip` (ignore).
   - Rules can add a delay in minutes before processing.

9. **Enable the auto-responder** by toggling `is_enabled` to true.

---

## 9. OpenRouter Model IDs

OpenRouter provides access to hundreds of models through a single API. Common models for email auto-response:

| Model ID | Provider | Notes |
|---|---|---|
| `openai/gpt-4o` | OpenAI | Highest quality, best for complex/sensitive replies |
| `openai/gpt-4o-mini` | OpenAI | Good quality at lower cost, recommended default |
| `anthropic/claude-sonnet-4-20250514` | Anthropic | Strong reasoning and instruction following |
| `anthropic/claude-haiku-4-5-20251001` | Anthropic | Fast and affordable, good for simple replies |
| `google/gemini-2.0-flash` | Google | Very fast, competitive quality |
| `meta-llama/llama-3.1-70b-instruct` | Meta | Open-source, good for cost-sensitive deployments |

Browse all available models at https://openrouter.ai/models.

**How it works**: The `ai_provider.py` module uses the `openai` Python SDK with `base_url` set to `https://openrouter.ai/api/v1`. This means any model available on OpenRouter can be used by simply changing the model ID in the config -- no code changes required.

---

## 10. Monitoring and Troubleshooting

### Key Metrics to Monitor

- **Escalation rate**: Available via `GET /api/auto-responder/analytics/summary`. An escalation rate above 30% suggests the confidence threshold is too high, the brand description is insufficient, or the model needs upgrading.
- **Average confidence score**: Low averages (below 0.6) indicate the AI is struggling with the types of replies received. Consider improving the brand description or switching to a more capable model.
- **Average response time** (`avg_response_time_ms`): Measures end-to-end processing time. Spikes may indicate API latency or database bottlenecks.
- **Token usage**: Track `prompt_tokens` + `completion_tokens` in `responder_logs` to monitor API costs.

### Checking Logs

Query the `responder_logs` table directly for detailed investigation:

```sql
-- Recent failures
SELECT id, inbox_message_id, ai_model, status, escalation_reason, created_at
FROM responder_logs
WHERE status IN ('escalated', 'failed')
ORDER BY created_at DESC
LIMIT 50;

-- Token usage over the last 7 days
SELECT DATE(created_at) AS day,
       COUNT(*) AS total,
       SUM(prompt_tokens) AS total_prompt_tokens,
       SUM(completion_tokens) AS total_completion_tokens
FROM responder_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day;

-- Messages stuck in pending
SELECT id, from_email, subject, responder_status, received_at
FROM inbox_messages
WHERE responder_status = 'pending'
  AND received_at < NOW() - INTERVAL '15 minutes'
ORDER BY received_at;
```

### Common Issues

| Issue | Symptoms | Resolution |
|---|---|---|
| **Invalid API key** | All responses fail; `responder_logs` show `status = 'escalated'` with error messages referencing authentication | Verify the OpenRouter API key at https://openrouter.ai/keys. Re-enter it via `PATCH /api/auto-responder/config` with `ai_api_key`. |
| **Model not available** | Errors referencing model not found or 404 from OpenRouter | Check https://openrouter.ai/models to confirm the model ID is valid and available. Update `ai_model` in config. |
| **Rate limit exceeded (OpenRouter)** | HTTP 429 errors in worker logs | Upgrade your OpenRouter plan, reduce `max_responses_per_hour`, or switch to a less popular model. |
| **Rate limit exceeded (internal)** | Messages stay in `pending` and get re-queued | This is working as intended. The `retry_failed_responses` task will process them when capacity is available. Increase `max_responses_per_hour` if needed. |
| **Encryption key mismatch** | `InvalidToken` errors when decrypting API keys | The `ENCRYPTION_KEY` env var was changed. Restore the original key, or re-enter all workspace API keys. |
| **Messages stuck in pending** | Messages in `pending` status for more than 15 minutes despite worker running | Check Celery worker health. Verify Redis connectivity. The `retry_failed_responses` beat task should catch these every 5 minutes. |
| **High escalation rate** | >30% of messages are escalated | Lower the `confidence_threshold`, improve `brand_description`, add more `example_phrases`, or upgrade to a more capable model. |
| **Responses too generic** | AI responses lack specificity | Provide a more detailed `brand_description`, add specific `example_phrases`, and consider creating regions with `custom_system_prompt` for different lead segments. |

### Worker Health Check

```bash
# Check if auto-responder tasks are registered
celery -A app.workers.celery_app inspect registered | grep auto_responder

# Check active tasks
celery -A app.workers.celery_app inspect active

# Check scheduled (ETA) tasks
celery -A app.workers.celery_app inspect scheduled

# Check beat schedule
celery -A app.workers.celery_app inspect conf | grep beat_schedule
```

---

## 11. Compliance

### Opt-Out Detection

The system automatically scans every inbound message body for opt-out keywords before generating a response. Detected keywords include:

- "unsubscribe"
- "opt out" / "opt-out"
- "stop emailing"
- "remove me"
- "do not contact"
- "take me off"
- "no more emails"

When an opt-out is detected:
1. The lead's email is added to the **suppression list** (`suppression` table).
2. The lead's status is set to `unsubscribed`.
3. The message is marked as `escalated` (no auto-response is sent).
4. A `ResponderLog` entry is created with `escalation_reason = "opt_out_detected"`.

### Suppression List

Before every auto-response, the system checks the `suppression` table to ensure the lead's email is not suppressed. Suppressed emails never receive auto-responses.

### Audit Trail

Every AI generation attempt is logged in the `responder_logs` table with:

- The inbound message ID and response message ID (if sent)
- The lead, campaign, region, and rule that matched
- The OpenRouter model ID used
- Token counts (`prompt_tokens`, `completion_tokens`)
- The full generated response body
- The AI confidence score
- The final status (`pending`, `sent`, `escalated`, `rejected`, `failed`)
- Escalation reason (if applicable)
- Processing time in milliseconds
- Timestamps for creation and sending

Additionally, AI intent classifications are stored as `ResponderNote` entries with `note_type = "intent_classification"`.

### API Key Encryption

OpenRouter API keys submitted via the configuration endpoint are encrypted using **Fernet symmetric encryption** (from the `cryptography` library) before being stored in the `auto_responder_configs.ai_api_key_encrypted` column. Keys are decrypted only at the moment of use (when making an API call to OpenRouter). The encryption key is stored as the `ENCRYPTION_KEY` environment variable and never committed to source control.
