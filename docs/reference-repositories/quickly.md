# Quickly: engineering dossier and reuse contract

Target-architecture update (2026-10-13): source-language facts, scores and historical tests below remain unchanged. [ADR 0002](../decisions/0002-rails-laravel-presentation.md) selects Rails domain/API/worker + Laravel Blade/Livewire/Alpine presentation, Supabase and Resend. The [current adoption matrix](../component-adoption.md) and [reuse playbook](../component-reuse-playbook.md) supersede earlier Node/React destination suggestions; React components are translated, not installed as the product UI. Named consultations remain for the next agent; none is completed by this update.

Reviewed snapshot: **`edca964b8bfd56e621b491aba6302b0981545898`** (2026-09-23); audit evidence recorded **2026-10-11**. This dossier describes that pinned revision, not the current upstream default branch.

| Item | Recorded value |
| --- | --- |
| Upstream | [Quickly](https://github.com/AbdelftahZowail/Quickly) |
| Imported reference tree | [`third_party/upstream/quickly`](../../third_party/upstream/quickly) |
| Repository license | [MIT](../../third_party/upstream/quickly/LICENSE), preserved verbatim |
| Audit score | **53/100**; reuse potential **8/10** |
| Inventory at audit | 290 tracked files; 183 selected source files; 66,218 selected source lines; 39 test-path files |
| Runtime adoption | **None. Source reference intake only.** |

Inventory numbers are audit heuristics, not coverage measurements or the number of files ultimately accepted by the intake policy. The source snapshot and provenance manifest, not an installed dependency directory or generated build, are the reference. Repository MIT permission does not automatically settle dependency, bundled asset or trademark terms. Preserve the copyright and permission notice with any substantial adaptation; inspect component dependencies and branding before shipping.

This intake implements the user's request to retain and document the audited source. It does not make upstream setup instructions Elevateo operational instructions or turn this code into an approved production dependency. Later local adaptations follow [the engineering baseline](../../.planning/STANDARDS.md) and local-completion brief. Architecture and deployment paths below are **proposed future Elevateo paths**, unless explicitly identified as imported source.

## Independent assessment

**Closest product scaffold; replace the sending core and strengthen the trust boundary before team deployment.**

React/Vite SPA → FastAPI routers → async SQLAlchemy/PostgreSQL. APScheduler starts inside the API lifespan and dispatches asyncio tasks. Gmail API, Microsoft Graph and SMTP/IMAP implement sending and inbox sync. Tracking, notifications, outbound webhooks, backup/restore and MCP share the application and database.

Feature-rich but concentrated: unibox.py is 4,089 lines; CampaignDetail.jsx 3,365; campaign routes 2,959. Business rules, persistence and provider work are interleaved. Two large sending paths remain in jobs.py, increasing drift risk. The Python requirements use broad lower bounds and any-llm-sdk[all], making reproducible builds and the dependency surface harder to control.

### Seven audit dimensions

These scores are independent engineering judgments against the original outreach-platform brief, not certifications, exhaustive security findings or predicted uptime. The formula is `sum(score × percentage weight) / 10`, rounded half up. The component scores below are explanatory assessments and are not averaged into the weighted total. Product-fit scores predate the company-mailbox pivot and must be read with that limitation.

| Dimension | Score / 10 | Weight | Reason |
| --- | ---: | ---: | --- |
| Architecture | 6 | 15% | Useful single-application decomposition, but API lifecycle owns background scheduling and multiple modules intermingle business rules, persistence and transport. |
| Code maintainability | 5 | 15% | Large JSX/Python feature files and broad runtime dependency lower bounds increase change cost; rich existing behavior makes it useful as a reference. |
| Security / permissions | 4 | 20% | Authentication exists, but global feature access, key co-location, unrestricted webhook destinations and inconsistent HTML rendering block institutional use. |
| Sending / data reliability | 4 | 20% | No cross-process atomic send claim and no safe representation of uncertain provider acceptance; best-effort event delivery can lose downstream updates. |
| Product fit | 9 | 10% | Closest audited campaign-product scaffold. This historical score measures Instantly/Smartlead resemblance, not suitability for the newer shared-mailbox requirements. |
| Tests / verification | 6 | 10% | Substantial Python test suite and a successful frontend build; remaining test-contract failures and SQLite-heavy coverage leave important gaps. |
| Operations | 5 | 10% | Backup and health tooling exist, but release workflow has no visible application-test gate and deployment configuration needs hardening. |

### Nine component scores

| Component | Score / 10 | Assessment | Pinned evidence |
| --- | ---: | --- | --- |
| Campaigns and sequences | 8 | Broad sequence, variant, preview and scheduling workflows; route and page size make safe change expensive. | [`app/routers/campaigns.py:1519`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/routers/campaigns.py#L1519) |
| Mailbox/provider adapters | 8 | Gmail, Graph and SMTP support with token refresh and diagnostics; retain behind a narrow tested interface. | [`app/sender.py:647`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/sender.py#L647) |
| Sending and scheduling | 4 | Preflight checks exist, but task ownership is process-local and provider/database outcomes are not atomic. | [`app/jobs.py:1872`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/jobs.py#L1872) |
| Inbox and reply handling | 7 | Substantial unified-inbox implementation; split provider sync, matching and presentation into smaller modules. | [`app/unibox.py:3`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/unibox.py#L3) |
| Identity and permissions | 4 | HttpOnly JWT sessions, API keys and admin checks exist; most feature routers require only a logged-in user. | [`app/main.py:222`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/main.py#L222) |
| Data and migrations | 5 | Useful indexes and queue uniqueness; startup ALTER TABLE/create_all is weaker than reviewed versioned migrations. | [`app/database.py:85`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/database.py#L85) |
| Integrations and AI | 6 | Useful MCP, n8n and AI classification surfaces; webhook delivery is best effort and broad provider extras increase maintenance. | [`app/webhooks.py:60`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/webhooks.py#L60) |
| Frontend components | 6 | Functional React UI and sanitised inbox component, but large untyped JSX pages and inconsistent HTML sinks. | [`frontend/src/components/EmailContent.jsx:16`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/frontend/src/components/EmailContent.jsx#L16) |
| Operations and tests | 5 | Backup/restore and health features are useful. Release workflow builds images without a visible test gate. | [`app/backup_package.py:2`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/backup_package.py#L2) |

## Findings that constrain adoption

Severity is local audit prioritization, not an upstream-assigned CVSS score. A source-confirmed path is not a claim that a live deployed system was exploited. No external mailbox, internal network service or real provider was attacked.

### Q1 — High: Duplicate sending across processes or ambiguous retries

The scanner prevents duplicate dispatch with an in-memory set. send_slot_job reads an unclaimed queue row, commits an EmailLog before provider I/O, and removes the slot after success. Two app processes can select the same row; a crash after provider acceptance but before slot removal leaves work eligible for another send. Queue-row uniqueness does not enforce delivery uniqueness.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Use durable send attempts, an atomic claim/lease and one canonical delivery state machine; quarantine ambiguous provider outcomes for reconciliation.

[`app/jobs.py:1872`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/jobs.py#L1872); [`app/jobs.py:1122`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/jobs.py#L1122); [`app/jobs.py:850`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/jobs.py#L850).

### Q2 — High: Encryption key is stored with encrypted mailbox credentials

Settings initialization writes both generated and environment-supplied encryption keys into the settings database. A database-only disclosure can therefore reveal the key needed to decrypt sensitive columns; setting an environment key alone does not avoid the initial copy.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Keep wrapping keys outside the database in a secret manager/KMS; migrate existing key rows and test backup/key separation.

[`app/settings_manager.py:270`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/settings_manager.py#L270); [`app/security.py:115`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/security.py#L115).

### Q3 — High: Webhook endpoint accepts unrestricted destinations

An authenticated user can create/test webhooks. The schema accepts a plain string URL, the route only strips it, and the sender performs an HTTP request without the repository SSRF validator. Internal network destinations can be requested from the application host.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Restrict webhook configuration to administrators; validate resolved destinations and redirects at connection time; enforce outbound network policy.

[`app/schemas.py:452`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/schemas.py#L452); [`app/routers/settings.py:76`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/routers/settings.py#L76); [`app/webhooks.py:72`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/webhooks.py#L72).

### Q4 — Medium: Outbound events can disappear during outages

Webhook failures return False and the caller does not persist a retry or delivery record. Downstream CRM/reporting systems can silently miss events.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Transactional outbox, signed event IDs, retry schedule, dead-letter queue and replay UI.

[`app/webhooks.py:60`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/webhooks.py#L60); [`app/webhooks.py:114`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/app/webhooks.py#L114).

### Q5 — Medium: HTML sanitisation is inconsistent

The inbox has DOMPurify, but campaign HTML previews and schedule previews use raw HTML rendering. Imported/edited content can reach these sinks; exact exploitability also depends on CSP and content provenance.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Use one sanitised email renderer everywhere, preferably sandboxed with remote images blocked by default.

[`frontend/src/pages/CampaignDetail.jsx:2340`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/frontend/src/pages/CampaignDetail.jsx#L2340); [`frontend/src/pages/Schedule.jsx:101`](https://github.com/AbdelftahZowail/Quickly/blob/edca964b8bfd56e621b491aba6302b0981545898/frontend/src/pages/Schedule.jsx#L101).

## Source map and execution paths

All links in this section resolve inside the imported pinned tree. The snapshot is a reading/reference boundary, not an extra deployed service.

| Subsystem | Exact source entry points | Responsibilities and coupling |
| --- | --- | --- |
| HTTP/startup | [`app/main.py`](../../third_party/upstream/quickly/app/main.py), [`app/routers`](../../third_party/upstream/quickly/app/routers) | FastAPI wiring, auth dependencies, API lifespan, background scheduler and SPA serving; API replication also replicates scheduler ownership. |
| Identity | [`app/auth.py`](../../third_party/upstream/quickly/app/auth.py), [`app/routers/auth.py`](../../third_party/upstream/quickly/app/routers/auth.py), [`app/routers/app_oauth.py`](../../third_party/upstream/quickly/app/routers/app_oauth.py) | Password/OAuth application identity, JWT cookies and API-key resolution; first-user admin behavior is not an invite-only deployment policy. |
| Data | [`app/models.py`](../../third_party/upstream/quickly/app/models.py), [`app/database.py`](../../third_party/upstream/quickly/app/database.py), [`app/schemas.py`](../../third_party/upstream/quickly/app/schemas.py) | ORM relationships, request schemas, async sessions and startup DDL. |
| Campaign editing | [`app/routers/campaigns.py`](../../third_party/upstream/quickly/app/routers/campaigns.py), [`frontend/src/pages/CampaignDetail.jsx`](../../third_party/upstream/quickly/frontend/src/pages/CampaignDetail.jsx) | Enrollment, sequence variants, custom body overrides, preview and campaign control; large modules own many concerns. |
| Queue planning | [`app/queue_logic.py`](../../third_party/upstream/quickly/app/queue_logic.py), [`app/scheduler.py`](../../third_party/upstream/quickly/app/scheduler.py), [`app/jobs.py`](../../third_party/upstream/quickly/app/jobs.py) | Calendar slots, inbox pacing, periodic scans and send execution; planning and actual transport outcomes require separate durable states. |
| Providers | [`app/sender.py`](../../third_party/upstream/quickly/app/sender.py), [`app/smtp_utils.py`](../../third_party/upstream/quickly/app/smtp_utils.py), [`app/routers/gmail_oauth.py`](../../third_party/upstream/quickly/app/routers/gmail_oauth.py), [`app/routers/office365_oauth.py`](../../third_party/upstream/quickly/app/routers/office365_oauth.py) | Gmail, Graph and SMTP transport/OAuth. Existing credentials are external inbox credentials, not newly hosted inboxes. |
| Inbox | [`app/unibox.py`](../../third_party/upstream/quickly/app/unibox.py), [`app/routers/unibox.py`](../../third_party/upstream/quickly/app/routers/unibox.py), [`frontend/src/pages/Unibox.jsx`](../../third_party/upstream/quickly/frontend/src/pages/Unibox.jsx) | Provider synchronization, threading, reply handling and unified inbox presentation. |
| Email UI | [`frontend/src/components/EmailContent.jsx`](../../third_party/upstream/quickly/frontend/src/components/EmailContent.jsx), [`frontend/src/utils/emailQuote.js`](../../third_party/upstream/quickly/frontend/src/utils/emailQuote.js) | DOMPurify rendering and quoted-content behavior. Shadow DOM provides style separation, not a browser security sandbox. |
| Frontend shell | [`frontend/src/App.jsx`](../../third_party/upstream/quickly/frontend/src/App.jsx), [`frontend/src/api.js`](../../third_party/upstream/quickly/frontend/src/api.js), [`frontend/src/context/AuthContext.jsx`](../../third_party/upstream/quickly/frontend/src/context/AuthContext.jsx), [`frontend/src/components/ui`](../../third_party/upstream/quickly/frontend/src/components/ui) | React routes, request client, auth state and reusable controls. Frontend roles are presentation, not server authorization. |
| Integrations | [`app/mcp_leads.py`](../../third_party/upstream/quickly/app/mcp_leads.py), [`app/webhooks.py`](../../third_party/upstream/quickly/app/webhooks.py), [`n8n-node`](../../third_party/upstream/quickly/n8n-node) | Lead-oriented MCP HTTP tools, outgoing event delivery and n8n integration; not an Elevateo mailbox connector. |
| AI | [`app/ai_classifier.py`](../../third_party/upstream/quickly/app/ai_classifier.py) | Configurable reply classification with provider/model/API-key settings; classifications can affect enrollment and queued work. |
| Tracking | [`app/tracking.py`](../../third_party/upstream/quickly/app/tracking.py), [`app/tracking_events.py`](../../third_party/upstream/quickly/app/tracking_events.py), [`app/routers/tracking.py`](../../third_party/upstream/quickly/app/routers/tracking.py) | Open/click instrumentation and reporting. These are uncertain engagement signals, not proof of human reading. |
| Operations | [`app/backup_package.py`](../../third_party/upstream/quickly/app/backup_package.py), [`app/backup_pg.py`](../../third_party/upstream/quickly/app/backup_pg.py), [`app/backup_restore_ops.py`](../../third_party/upstream/quickly/app/backup_restore_ops.py), [`app/routers/system_health.py`](../../third_party/upstream/quickly/app/routers/system_health.py) | Archive/database backup and restoration helpers, diagnostics and health surfaces. Must be adapted to Supabase database plus object storage. |

### Outbound dataflow

A campaign and its lead enrollment produce scheduled `QueueSlot` rows. The periodic scanner reads eligible rows and uses a process-local set to avoid starting the same slot twice within that process. Send logic chooses content/provider and records an `EmailLog` around provider I/O. Success removes the queue slot and updates related state. Two APIs or a crash at the provider/database boundary can break this apparent single sequence; Q1 is why the send engine is not an adoption candidate.

For Elevateo, a human-approved immutable draft must create a durable send job and audit event in one database transaction. A separate worker claims work atomically, records the attempt before the network call, then preserves accepted, rejected and unknown outcomes. Resend idempotency must be represented explicitly; an upstream `EmailLog` row does not substitute for an attempt ledger.

### Incoming dataflow

External Gmail/Graph/IMAP accounts feed provider-specific synchronization and mirror tables; the unified inbox combines them for presentation and reply handling. This is valuable UX/reference material if existing account synchronization is later requested. Our baseline receives authenticated Resend events, saves them before acknowledgement and imports content asynchronously into a provider-neutral mailbox model. It does not need three provider mirror schemas on day one.

## Database, identity and permission analysis

| Upstream record family | Meaning | Elevateo treatment |
| --- | --- | --- |
| `User`, `APIKey` | Application users, global roles, API-key hashes/scopes/revocation | Use Supabase Auth identities plus company memberships, mailbox memberships and separate connector grants. Do not copy password/session tables or assume a scope column means all routes enforce it. |
| `Inbox`, `GmailAccount`, `Office365Account`, `SmtpAccount` | External sender account with provider credentials and pacing configuration | Split mailbox identity/aliases from optional provider connection; Resend is baseline and its server credential remains outside message records. |
| `Campaign`, `Sequence`, `SequenceVariant`, `CampaignLead`, `CustomEmailOverride` | Outreach plan, variants and recipient enrollment | Defer campaign engine; preserve patterns for later consent-based sequences after core mailbox acceptance. |
| `QueueSlot`, `EmailLog` | Planned slot and send-oriented record | Replace with approved draft snapshot, unique send job, attempt ledger and provider event table. Uniqueness on enrollment/sequence is not cross-process send ownership. |
| `GmailThread/Message`, `Office365Thread/Message`, `SmtpThread/Message` | Provider-specific message mirrors | Design one conversation/message model with scoped provider identities, per-user read state, assignments and participants. |
| `LeadReply`, `EmailOpen`, `EmailClick`, `TrackedLink` | Reply and engagement observations | Keep factual inbound/provider events distinct from marketing analytics; no tracking default inferred for company correspondence. |
| `AppSetting`, `Webhook`, backup metadata | Configuration, integrations and recovery | Separate secrets from database-backed settings, add audited admin configuration and durable event outbox. |

There is no audited organization/mailbox membership system comparable to Elevateo's proposed boundary. Global authentication is useful but insufficient when finance and sales must remain private from each other. The model uses many integer primary keys and foreign keys without company/mailbox composite constraints; adding a company column later does not automatically protect joins. Elevateo needs mailbox-scoped authorization plus tested RLS and explicit integrity constraints.

`database.py` performs `create_all` and incremental PostgreSQL `ALTER` statements at startup. SQLite tests skip the PostgreSQL-specific migration branch. Read these changes as evolution history, not a safe migration tool for Supabase. Elevateo migrations need explicit versions, review, rollback/forward strategy and real PostgreSQL exercise with restricted roles.

## AI, MCP and content boundaries

The MCP surface wraps lead API operations, including mutations such as update/delete and enrollment. Its HTTP transport disables built-in DNS rebinding protection; that deployment assumption must not be inherited by a new connector. Tool credentials are forwarded to the HTTP API and requests can use long timeouts. Elevateo needs a narrower, bounded read/search/draft contract, current mailbox authorization, explicit grants and no sending tool in the first milestone. A successful MCP handshake does not establish safe tool semantics.

The AI classifier can change enrollment status based on message content. This is not the requested Claude/Codex connector: model API inference and a user-authorized connector are separate systems. Incoming email must remain untrusted content and cannot approve sending, change grants or redirect confidential context to another service. Keep optional classification separate from deterministic authorization and suppression rules.

`EmailContent.jsx` is a useful source for sanitization and quote-collapse behavior. Its Shadow DOM and provider-specific tracking removal are not a complete remote-content privacy policy. Adopt one reviewed renderer with sandboxed isolation, URL policy and remote images blocked by default, then use it for every preview; Q5 shows why inconsistent sinks matter.

## Tests, dependencies and operating evidence

Historical audit execution, not rerun during this documentation intake:

| Check | Actual result | Interpretation |
| --- | --- | --- |
| Python full suite | 422 passed, 14 failed, 10 skipped, 4 errors | Eight failures and four setup errors were blocked loopback socket operations. Six other failures remained: four stale auth expectations, one inbox deletion contract and one reply-statistics case. |
| Loopback SMTP rerun | 31 passed, 57 warnings, 3.50 seconds | Used a deterministic fake relay with socket permission; no real outbound email. Do not combine overlapping test counts into a new invented full-suite result. |
| Frontend production build | Passed, with large-chunk warnings | Confirms buildability in that environment; no frontend test script was present and browser workflow coverage was not established. |
| Environment adjustment | `greenlet` added only to isolated audit environment | Repository requirements were unchanged; original broad SQLAlchemy declaration was insufficient for that fresh environment. |
| npm audit observation | 20 reported package records: 0 critical, 10 high, 9 moderate, 1 low | Historical lockfile advisory observation, including development packages. Not 20 independently exploitable vulnerabilities and not a current scan. |

See [shared machine-readable audit evidence](../research/audit-scorecards.json). The previous execution was local audit verification, not Elevateo application tests inside Docker, and does not satisfy future application release gates. No production PostgreSQL migration/restore, multi-worker duplicate-send or real-provider reconciliation exercise was completed.

Relevant test references: [`tests/test_queue_logic.py`](../../third_party/upstream/quickly/tests/test_queue_logic.py), [`tests/test_send_auth_failure.py`](../../third_party/upstream/quickly/tests/test_send_auth_failure.py), [`tests/test_pause_inbox_and_bulk_duplicates.py`](../../third_party/upstream/quickly/tests/test_pause_inbox_and_bulk_duplicates.py), [`tests/test_unibox_api.py`](../../third_party/upstream/quickly/tests/test_unibox_api.py), [`tests/test_backup_package.py`](../../third_party/upstream/quickly/tests/test_backup_package.py), [`tests/test_mcp_setup_api.py`](../../third_party/upstream/quickly/tests/test_mcp_setup_api.py). Test names identify existing intent; they do not prove the corresponding Elevateo behavior.

The Python [`requirements.txt`](../../third_party/upstream/quickly/requirements.txt) uses broad lower bounds and `any-llm-sdk[all]`; this can expand network clients, transitive dependencies and installation variability. The React 18/Vite frontend uses untyped JSX, Tailwind, Recharts, Quill and DOMPurify. Elevateo should select and pin its own minimal dependency set after review, not install the whole snapshot.

The supplied [`docker-compose.yml`](../../third_party/upstream/quickly/docker-compose.yml) includes PostgreSQL, app and Caddy. It uses example database credentials, a floating application image and an external database volume. Those defaults are reference data, never production configuration. [`release.yml`](../../third_party/upstream/quickly/.github/workflows/release.yml) is image release machinery; it is not evidence of the tests having gated that release. Backups in the same host filesystem do not protect against host loss.

## Strict extraction plan

No entry below means a module is already ported. A reuse PR must record upstream commit/path, retained license, adaptation diff, new dependency decisions and actual verification.

| Disposition | Source | Proposed Elevateo destination | Prerequisites and acceptance evidence |
| --- | --- | --- | --- |
| Adapt small UI behaviors | `frontend/src/components/EmailContent.jsx`, `frontend/src/utils/emailQuote.js` | `apps/web/resources/views/components/mail/`, `apps/server/app/domain/content/` | Blade/Alpine behavior port; one sanitizer policy; adversarial HTML/URL/remote-image tests; sandboxed rendering and visual checks. |
| Reference inbox UX | `frontend/src/pages/Unibox.jsx`, `app/unibox.py` | `apps/web/resources/views/livewire/conversations/`, `apps/server/app/domain/conversations/` | Decompose monoliths; company/mailbox access, per-user read state and draft concurrency; Resend event-based ingest, not copied provider mirrors. |
| Adapt provider-independent test cases | `tests/test_sender_helpers.py`, `tests/test_pause_inbox_and_bulk_duplicates.py`, `tests/test_send_auth_failure.py` | `apps/server/test/domain/`, `apps/server/test/adapters/providers/` | Re-express requirements against fake provider and real PostgreSQL; add duplicate ownership, crash, expired idempotency and unknown-outcome cases. |
| Reference optional legacy adapters | `app/sender.py`, `app/smtp_utils.py`, provider OAuth routes | `apps/server/app/adapters/providers/gmail/` or `graph/` only if later approved | Confirm migration need, OAuth scopes and provider policy; independent credentials/storage/revocation review and contract tests. No SMTP/IMAP at baseline. |
| Reference integration adapter shape | `app/mcp_leads.py` | `packages/mcp/` | Implement mailbox read/search/draft API calls; bounded results, grant expiry/revocation and prompt-injection tests in Claude and Codex; exclude deletion/enrollment tools. |
| Reference recovery checklist | `app/backup_package.py`, `app/backup_restore_ops.py`, `app/log_redaction.py` | `infra/runbooks/`, shared logging policy | Cover PostgreSQL and Supabase object storage together; encrypted off-host backups; restoration with sending held and external effects reconciled. |
| Rewrite | `app/jobs.py`, `app/scheduler.py`, `app/webhooks.py`, `app/database.py` | `apps/server/` (worker process), `apps/server/app/domain/delivery/`, `apps/server/db/` | Durable claim/lease/outbox, safe retry horizon, authenticated event persistence, reviewed SQL migrations and failure-injection tests. |
| Reject direct adoption | `app/settings_manager.py` key persistence, global feature authorization, raw preview HTML sinks | No import into runtime | External secret custody, Supabase Auth plus mailbox permissions and shared safe renderer replace these patterns. |
| Defer | Campaign editor, warmup/ramp-up, tracking analytics, full provider synchronization | Optional future modules only | Company mailbox complete first; explicit business need and permitted message purpose; no imported campaign engine running beside the authoritative send worker. |

## Mapping to Elevateo goals

| Goal | What Quickly contributes | Gap / required work |
| --- | --- | --- |
| R01 — company mailbox for about 10 people | Unified inbox UX and reply workflows | Model shared assignments, per-user read state, draft conflicts and per-mailbox access; outreach leads are not company users. |
| R02 — Resend | Provider abstraction experience | Build new Resend transport/receiving adapter and provider-aware attempt lifecycle; no Resend production integration was verified here. |
| R03 — self-hosted Supabase | PostgreSQL modeling and operational examples | Supabase Auth/RLS/private Storage and coordinated restores require a new integration. PostgreSQL compatibility alone is insufficient. |
| R04 — web subdomain | React SPA and reverse-proxy pattern | Own HTTPS/origin/session policy, observability and deployment configuration. |
| R05 — Mac and Windows downloads | Browser UI behavior can inform shared frontend | No verified signed Tauri installers; packaging, OS login and updates remain separate work. |
| R06 — Claude and Codex connectors | Concrete MCP tool/API wrapper example | Replace lead mutations with mailbox scopes and bounded read/search/draft operations; verify both clients. |
| R07 — efficient compute | Single-app deployment is modest in service count | Separate durable worker ownership, avoid unused provider/AI runtimes, measure Supabase and mailbox workload. |
| R08 — backend/database/CAP tutorial | Concrete example of database/network non-atomicity | Q1 illustrates why a successful local transaction cannot guarantee external delivery exactly once. |
| R09 — Codex CLI and repository update | Pinned source and traceable module references | Codex CLI use belongs to Elevateo's own recorded work; this snapshot does not constitute a connector or implementation. |
| R10 — source intake and strict documentation | Imported pinned MIT reference source, independent scores, defects and extraction plan | Preserve manifest/license and reference/runtime separation; every future adaptation needs a recorded review and tests. |

## Production acceptance blockers

A direct deployment cannot be approved as Elevateo: resolve Q1–Q5, establish mailbox isolation, replace credentials/session handling with the selected identity design, implement reviewed migrations and immutable draft/send state, and prove restore/reconciliation under failure. Add sanitized content/attachment isolation, invite-only membership, session and connector revocation, audited administrative actions, resource measurements and tested upgrade/rollback procedures. These are release gates, not optional cosmetic work.

The best decision for the current product is to use Quickly's inbox/composer behavior and test ideas while implementing Elevateo's own bounded mailbox, permission and delivery modules. Its high outreach resemblance must not override the changed product and transport requirements.
