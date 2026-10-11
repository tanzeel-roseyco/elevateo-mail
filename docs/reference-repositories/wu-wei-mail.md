# Wu-Wei-Mail: engineering dossier and reuse contract

Reviewed snapshot: **`6002b8850d685c9ad275eb1cc10a4ce0c8299145`** (2026-05-18); audit evidence recorded **2026-10-11**. This dossier describes that pinned revision, not the current upstream default branch.

| Item | Recorded value |
| --- | --- |
| Upstream | [Wu-Wei-Mail](https://github.com/LuiHedlund02/Wu-Wei-Mail) |
| Imported reference tree | [`third_party/upstream/wu-wei-mail`](../../third_party/upstream/wu-wei-mail) |
| Repository license | [MIT](../../third_party/upstream/wu-wei-mail/LICENSE), preserved verbatim |
| Audit score | **56/100**; reuse potential **7/10** |
| Inventory at audit | 353 tracked files; 319 selected source files; 81,550 selected source lines; 70 test-path files |
| Runtime adoption | **None. Source reference intake only.** |

Inventory numbers are audit heuristics, not coverage measurements or the number of files ultimately accepted by the intake policy. The source snapshot and provenance manifest, not an installed dependency directory or generated build, are the reference. Repository MIT permission does not automatically settle dependency, bundled asset or trademark terms. Preserve the copyright and permission notice with any substantial adaptation; inspect component dependencies and branding before shipping.

This intake implements the user's request to retain and document the audited source. It does not make upstream setup instructions Elevateo operational instructions, resolve the [draft standards gate](../../.planning/STANDARDS.md), or turn this code into an approved production dependency. Architecture and deployment paths below are **proposed future Elevateo paths**, unless explicitly identified as imported source.

## Independent assessment

**Best architectural reference for workspaces and separated workers; delivery correctness and security recovery need repairs.**

Next.js/React frontend → FastAPI routers → service modules → SQLAlchemy/PostgreSQL, with Alembic migrations. Celery/Redis separates periodic scheduling, sending, inbox sync, workflows and prospecting. Workspace IDs appear throughout the schema and sampled service calls; user roles and scoped workspace API tokens are implemented.

Clearer layering than Quickly and more explicit workspace concepts. Scope has expanded into visual workflows, prospecting, automatic replies and external warmup providers. That breadth creates many paths to the same side effects. Several frontend pages exceed 1,400 lines and the main workflow executor is 1,529 lines. Many backend tests use mocked sessions/authentication, so passing tests do not establish SQL or authorization correctness.

### Seven audit dimensions

These scores are independent engineering judgments against the original outreach-platform brief, not certifications, exhaustive security findings or predicted uptime. The formula is `sum(score × percentage weight) / 10`, rounded half up. The component scores below are explanatory assessments and are not averaged into the weighted total. Product-fit scores predate the company-mailbox pivot and must be read with that limitation.

| Dimension | Score / 10 | Weight | Reason |
| --- | ---: | ---: | --- |
| Architecture | 7 | 15% | Explicit services, workspaces, migrations and separate workers are useful boundaries; Celery/Redis plus many automation modules add operational scope. |
| Code maintainability | 6 | 15% | Typed frontend and clearer backend services help; very large pages and workflow executors remain difficult to maintain. |
| Security / permissions | 5 | 20% | Workspace roles and token scopes are stronger foundations; refresh-reuse revocation and unsafe website fetching need repair and real authorization tests. |
| Sending / data reliability | 4 | 20% | The worker boundary does not solve delivery correctness: interrupted attempts can become false successes and queued work can ignore a later pause. |
| Product fit | 8 | 10% | Broad campaign/workflow/inbox product. Historical fit score targets outreach parity; this is not an assessment of a finished 10-user company mailbox. |
| Tests / verification | 6 | 10% | Large backend suite and a small frontend suite passed mostly; mocked DB/auth and a live-service-dependent AI test limit confidence. |
| Operations | 4 | 10% | CI and migrations are present, but missing CI test installation and a Compose file that only starts data services leave production deployment incomplete. |

### Nine component scores

| Component | Score / 10 | Assessment | Pinned evidence |
| --- | ---: | --- | --- |
| Workspace and team model | 7 | Explicit workspace IDs, owner/admin/member team controls and scoped API tokens are valuable reference designs. | [`backend/app/utils/security.py:187`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/utils/security.py#L187) |
| Campaigns and leads | 7 | Service boundaries and workspace filters exist; campaign start is available to ordinary authenticated members. | [`backend/app/routers/campaigns.py:25`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/routers/campaigns.py#L25) |
| Scheduler and sender | 3 | Queue isolation and row locks help, but enqueue-before-commit and optimistic recovery leave correctness gaps. | [`backend/app/workers/scheduler.py:114`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/scheduler.py#L114) |
| Inbox and conversations | 6 | Dedicated sync and conversation models; end-to-end provider consistency still needs fault tests. | [`backend/app/workers/inbox_sync_worker.py:3`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/inbox_sync_worker.py#L3) |
| Workflow engine | 6 | Nodes, execution logs and workflow versioning are useful, but too much scope for the initial 10-user core. | [`backend/app/services/workflow/node_executors.py:15`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/services/workflow/node_executors.py#L15) |
| Prospecting and AI | 5 | Model routing, discovery and quality gates exist; website fetching needs an isolated network boundary. | [`backend/app/services/prospecting/website_validator.py:87`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/services/prospecting/website_validator.py#L87) |
| Warmup and deliverability | 4 | Provider adapters and health policy exist; not a proven autonomous warmup network. | [`backend/app/config.py:83`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/config.py#L83) |
| Frontend components | 6 | Typed Next.js UI, visual workflow library and some component tests; very large feature pages. | [`frontend/package.json:17`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/frontend/package.json#L17) |
| Migrations, CI and deployment | 5 | Alembic and CI definitions are positives; CI omits the separate test requirements and compose only starts data services. | [`docker-compose.yml:1`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/docker-compose.yml#L1) |

## Findings that constrain adoption

Severity is local audit prioritization, not an upstream-assigned CVSS score. A source-confirmed path is not a claim that a live deployed system was exploited. No external mailbox, internal network service or real provider was attacked.

### W1 — High: Interrupted send is promoted to sent without proof

The sender commits status=sending before provider I/O. On a subsequent execution, any existing sending record is changed to sent and finalized without asking the provider. A crash before the network call therefore produces a false sent record and advances the sequence.

**Evidence level:** Reproduced against actual sender function with mocked DB/provider: reserved attempt became sent without a provider call.

**Required replacement or repair:** Introduce unknown/ambiguous states and reconcile using a stable message identity; never infer acceptance from a reserved attempt.

[`backend/app/workers/sender.py:284`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/sender.py#L284); [`backend/app/workers/sender.py:367`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/sender.py#L367).

### W2 — High: No final pause/suppression gate in campaign sender

The scheduler checks active campaigns and suppression before enqueueing, but the sender does not recheck campaign status or suppression before the provider call. A pause or unsubscribe after enqueueing can be ignored. The scheduler also publishes the Celery task before committing the in_sequence state.

**Evidence level:** Paused-campaign send reproduced with mocked DB/provider. Suppression/enqueue ordering conclusions are source-confirmed.

**Required replacement or repair:** Recheck cancellation, suppression and permissions immediately before sending; dispatch from a committed outbox and enforce uniqueness on delivery attempts.

[`backend/app/workers/scheduler.py:114`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/scheduler.py#L114); [`backend/app/workers/sender.py:212`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/sender.py#L212); [`backend/app/workers/sender.py:367`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/workers/sender.py#L367).

### W3 — High: Refresh-token reuse revocation is rolled back

On reuse, rotate_refresh_token updates all tokens and flushes, then raises ValueError. The refresh route converts that to HTTPException; get_db rolls back on exceptions. The intended family revocation is therefore not committed on this path.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Commit security revocation in an independent transaction before returning the authentication failure; add a real-database replay test.

[`backend/app/utils/security.py:119`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/utils/security.py#L119); [`backend/app/routers/auth.py:134`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/routers/auth.py#L134); [`backend/app/database.py:35`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/database.py#L35).

### W4 — High: Website validation has no visible private-network guard

The website fetcher accepts a URL, follows redirects and can launch Playwright, with no address allow/deny check in these fetch paths. If untrusted lead/website data reaches it, the server can access private services. This is a source-level reachable-input concern; no internal-network request was made.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Run fetching in an egress-restricted worker; validate DNS and every redirect and cap response sizes and browser resources.

[`backend/app/services/prospecting/website_validator.py:87`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/services/prospecting/website_validator.py#L87); [`backend/app/services/prospecting/website_validator.py:116`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/app/services/prospecting/website_validator.py#L116).

### W5 — Medium: CI backend test dependencies are missing

The backend test job installs requirements.txt, then invokes pytest; pytest is only declared in requirements-test.txt. A clean runner is not guaranteed to have the test runner. Mock-heavy tests additionally bypass the DB/auth dependencies on many routes.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end

**Required replacement or repair:** Install the test requirements explicitly; add real Postgres integration tests and role-boundary tests.

[`.github/workflows/ci.yml:50`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/.github/workflows/ci.yml#L50); [`backend/requirements-test.txt:1`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/requirements-test.txt#L1); [`backend/tests/conftest.py:120`](https://github.com/LuiHedlund02/Wu-Wei-Mail/blob/6002b8850d685c9ad275eb1cc10a4ce0c8299145/backend/tests/conftest.py#L120).

## Source map and execution paths

All links here target the imported pinned reference tree. Upstream configuration and instructions do not configure Elevateo, and this snapshot is not deployed as another backend.

| Subsystem | Exact source entry points | Responsibilities and coupling |
| --- | --- | --- |
| HTTP/API | [`backend/app/main.py`](../../third_party/upstream/wu-wei-mail/backend/app/main.py), [`backend/app/routers`](../../third_party/upstream/wu-wei-mail/backend/app/routers), [`backend/app/schemas`](../../third_party/upstream/wu-wei-mail/backend/app/schemas) | FastAPI route wiring, request schemas and security middleware; feature endpoints delegate to services. |
| Identity and workspace | [`backend/app/utils/security.py`](../../third_party/upstream/wu-wei-mail/backend/app/utils/security.py), [`backend/app/services/auth_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/auth_service.py), [`backend/app/routers/workspace.py`](../../third_party/upstream/wu-wei-mail/backend/app/routers/workspace.py) | JWT identity, refresh tokens, workspace roles and membership administration. |
| Integration grants | [`backend/app/models/api_token.py`](../../third_party/upstream/wu-wei-mail/backend/app/models/api_token.py), [`backend/app/services/api_token_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/api_token_service.py), [`backend/app/routers/developer.py`](../../third_party/upstream/wu-wei-mail/backend/app/routers/developer.py) | Hashed workspace tokens, scopes, expiry, revocation and developer configuration. |
| Data lifecycle | [`backend/app/database.py`](../../third_party/upstream/wu-wei-mail/backend/app/database.py), [`backend/app/models`](../../third_party/upstream/wu-wei-mail/backend/app/models), [`backend/alembic/versions`](../../third_party/upstream/wu-wei-mail/backend/alembic/versions) | Async session transactions, ORM records and versioned schema changes. |
| Campaign business rules | [`backend/app/services/campaign_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/campaign_service.py), [`backend/app/services/lead_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/lead_service.py), [`backend/app/services/template_engine.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/template_engine.py) | Workspace-scoped campaigns, enrollment, rendering and sequence behavior. |
| Queue and sending | [`backend/app/workers/celery_app.py`](../../third_party/upstream/wu-wei-mail/backend/app/workers/celery_app.py), [`backend/app/workers/scheduler.py`](../../third_party/upstream/wu-wei-mail/backend/app/workers/scheduler.py), [`backend/app/workers/sender.py`](../../third_party/upstream/wu-wei-mail/backend/app/workers/sender.py) | Redis/Celery broker and scheduling, a dedicated sender queue, row locking and transport orchestration. |
| Transport | [`backend/app/services/email_sender.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/email_sender.py), [`backend/app/services/oauth_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/oauth_service.py), [`backend/app/models/email_account.py`](../../third_party/upstream/wu-wei-mail/backend/app/models/email_account.py) | External email accounts, credentials/OAuth and SMTP-oriented provider work. Not a self-hosted mail server. |
| Inbound and inbox | [`backend/app/services/inbound_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/inbound_service.py), [`backend/app/services/inbox_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/inbox_service.py), [`backend/app/services/inbox_sync_service.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/inbox_sync_service.py), [`backend/app/workers/inbox_sync_worker.py`](../../third_party/upstream/wu-wei-mail/backend/app/workers/inbox_sync_worker.py) | Synchronization, normalization, conversation presentation and background polling. |
| Workflows | [`backend/app/models/workflow.py`](../../third_party/upstream/wu-wei-mail/backend/app/models/workflow.py), [`backend/app/services/workflow/node_executors.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/workflow/node_executors.py), [`backend/app/workers/workflow_runner.py`](../../third_party/upstream/wu-wei-mail/backend/app/workers/workflow_runner.py) | Graph nodes/edges, per-lead execution, versioning, execution logs and dead-letter records. |
| AI/prospecting | [`backend/app/services/prospecting`](../../third_party/upstream/wu-wei-mail/backend/app/services/prospecting), [`backend/app/services/ai_provider.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/ai_provider.py), [`backend/app/workers/auto_responder_worker.py`](../../third_party/upstream/wu-wei-mail/backend/app/workers/auto_responder_worker.py) | Model routing, tool-based discovery, copywriting and automated replies; optional external processors and side effects. |
| Warmup | [`backend/app/services/warmup_policy_engine.py`](../../third_party/upstream/wu-wei-mail/backend/app/services/warmup_policy_engine.py), [`backend/app/services/warmup_providers`](../../third_party/upstream/wu-wei-mail/backend/app/services/warmup_providers) | Provider adapters and health policies; does not establish a proven autonomous warmup network. |
| Frontend | [`frontend/src/lib/api.ts`](../../third_party/upstream/wu-wei-mail/frontend/src/lib/api.ts), [`frontend/src/lib/auth.tsx`](../../third_party/upstream/wu-wei-mail/frontend/src/lib/auth.tsx), [`frontend/src/lib/types.ts`](../../third_party/upstream/wu-wei-mail/frontend/src/lib/types.ts), [`frontend/src/components`](../../third_party/upstream/wu-wei-mail/frontend/src/components) | Typed Next.js client, authentication state, API contracts, Radix-style UI and workflow visualization. |
| Checks and operations | [`.github/workflows/ci.yml`](../../third_party/upstream/wu-wei-mail/.github/workflows/ci.yml), [`docker-compose.yml`](../../third_party/upstream/wu-wei-mail/docker-compose.yml), [`backend/tests`](../../third_party/upstream/wu-wei-mail/backend/tests) | CI declarations, local PostgreSQL/Redis services and backend suites. These are not a complete production application deployment. |

### Scheduled-send dataflow

The scheduler selects eligible active campaign work, applies suppression/limit checks and locks selected records. It publishes a Celery send task and changes enrollment state. The sender runs later in a distinct process, loads campaign/account/lead records, reserves a `SentEmail` status and calls the transport. This separates execution from API latency but introduces both database-to-broker ordering and provider-to-database outcome boundaries.

The pinned scheduler publishes before committing the database state. A task can therefore become visible before the transaction that justified it. The sender's recovery shortcut promotes an existing `sending` row to `sent`; reservation is not evidence of provider acceptance. The sender also lacks final campaign pause/suppression rechecks. W1 and the paused-campaign part of W2 were reproduced with the actual sender function and mocked dependencies. These are reasons to transfer the architectural separation, not the send implementation.

For Elevateo, use one PostgreSQL transaction for the immutable approved draft, durable send job and audit event. Run a separate worker sharing the same domain rules. Atomically lease work, record an attempt, then call Resend outside the database transaction. Persist uncertainty and reconcile; verify current permissions/cancellation/suppression at dispatch. A last-moment cancellation cannot recall a message already accepted externally, so UI promises must respect that boundary.

### Inbox and workflow dataflow

Inbox synchronization normalizes external account messages into inbox/conversation records. Conversation objects can also hold LinkedIn traffic. Workflows and auto-responders may consume events and create further side effects. This provides useful modular reference material but expands the number of ways to send. Elevateo's first release needs one authoritative send path, and incoming Resend events must persist before asynchronous import. Neither LinkedIn nor prospecting is part of the shared-company-mailbox baseline.

## Database, tenancy and authentication analysis

| Record family | Strength in the snapshot | Required Elevateo decision |
| --- | --- | --- |
| `Workspace`, `User` | Explicit workspace IDs, owner/admin/member roles and timestamps | Separate Supabase Auth identity from company membership and mailbox grants. Here a user has a direct workspace FK; that is not a reusable many-workspace membership design. |
| `EmailAccount` | Account-level transport/configuration entity | Model owned mailbox and receiving aliases separately from optional external provider connection. An SMTP credential does not create hosted inbox storage. |
| `ConversationThread`, `ConversationMessage`, `ConversationNote` | Channel-neutral threads/messages/notes, optional lead/campaign associations | Keep mailbox/company IDs through the integrity boundary; use per-user read state instead of the thread-wide `is_read`; independent assignments and immutable message records. |
| Conversation provider IDs | Provider-thread metadata and unique provider message field | Scope uniqueness deliberately by provider/account or ingress identity; a global bare ID assumption is unsuitable across mixed transports. Preserve RFC message IDs and reply references separately. |
| `SentEmail`, `EmailEvent` | Send and delivery-observation records | Replace optimistic state recovery with job/attempt/event ledgers and evidence-based transitions. Transport acceptance, delivery and reading remain distinct. |
| `RefreshToken`, `WorkspaceApiToken` | Token-family concepts plus scoped token lifecycle | Use selected Supabase identity/session design; retain independently revocable connector grants. Current mailbox rights must intersect each token's scopes. |
| `Suppression`, `CompliancePolicy`, `ContactTouch`, `FrequencyControlConfig` | Explicit suppression and contact-frequency concepts | Apply relevant permission/consent/suppression rules at dispatch and document message purpose. Boolean compliance settings are not legal compliance evidence. |
| Workflow definitions/nodes/lead state/log/dead-letter entries | Versioned automation and diagnostic records | Defer generalized graph execution. Carry forward immutable revision and diagnostic-event ideas only where needed for mail delivery. |
| Prospecting/warmup records | Structured feature state and external provider integration | Exclude from first schema; avoid unnecessary database tables, secrets and scheduled work. |

A workspace filter in a service is useful but not proof of complete tenant isolation. Ordinary authenticated members can reach campaign-start functionality in the sampled routes. Elevateo needs a current per-mailbox sender permission, not only workspace membership. Composite foreign keys and RLS tests must prevent records from one company/mailbox being attached to another through valid individual IDs.

The refresh-reuse bug is a transaction lesson: `flush()` sends statements to the database but does not commit them. Raising an authentication exception makes the request-scoped session roll back the revocation. Security effects that must survive a failed request require deliberate transaction ownership, with a real-database regression test. Reusing the existing auth implementation alongside Supabase would create competing identity authorities and is rejected.

Alembic is a stronger starting reference than ad hoc startup DDL. The snapshot has versioned changes, a merge revision and a recorded single head (`016`) in the historical check. Offline SQL generation does not show a migration succeeds on an existing production dataset, nor that constrained roles or RLS are correct. Supabase needs new reviewed migrations in the approved database layout.

## Frontend, AI and connector assessment

Next.js 16.1.6 and React 19.2.3 are declared in the snapshot, with TypeScript, Tailwind, Radix UI, Recharts and a visual workflow library. Large feature pages include auto-responder (2,082 lines), leads (1,821), prospecting (1,478) and settings (1,435). The workflow executor is 1,529 lines. Reusing the whole UI imports navigation and state designed for outreach automation, not a focused ten-person mailbox. Smaller controls and interaction patterns are better candidates after a dependency/license check.

The API and auth client tests are a useful seed for session-expiry/error UX. Frontend role checks remain presentation only. Shared mailbox privacy and sending authorization must be enforced by the backend even when an API call bypasses the UI.

AI prospecting includes orchestration, model selection, enrichment tools and copy generation. The website validator can follow untrusted destinations and launch a browser without a visible private-network guard in those paths. Elevateo does not need a browsing/prospecting worker for the baseline. If introduced later, it requires egress isolation, resource limits, safe DNS/redirect handling and explicit data disclosure policy.

Workspace API-token management is a useful conceptual input for Claude/Codex grants: store hashes, show raw tokens once, record expiry/revocation and constrain scope. It is not a complete mailbox MCP connector. Implement narrow tools over Elevateo's API, require current user/mailbox access on every call, treat email text as untrusted data, and keep sending human-controlled initially. AI auto-replies and workflow actions must not be smuggled in through a read/draft connector.

## Tests, dependency and deployment evidence

These are historical audit results at the pinned commit. No upstream tests or installers were executed as part of this reference-source documentation task.

| Check | Actual result | Limits |
| --- | --- | --- |
| Backend `python -m pytest -q` | 1,247 passed, 1 failed, 15 skipped; 27 warnings | One AI generation test (`TestAiGenerateMessageExecutor::test_generate`) expected an unconfigured live OpenRouter service; no credentials supplied. Warnings included unawaited mocks. Not a completely passing suite. |
| Frontend tests | Six passed | Small API/auth client coverage; not a full browser mailbox test. |
| Frontend TypeScript | Passed | Does not prove runtime authorization, delivery or HTML safety. |
| Alembic graph/offline upgrade | Passed; single head `016` | No live PostgreSQL migration/rollback/restore drill. |
| W1 targeted probe | Reserved `sending` attempt became `sent` without provider call | Actual sender function with mocked database/provider; reproduces control flow, not production database/network conditions. |
| W2 targeted probe | Paused campaign still invoked mocked send | Actual sender function with mocked database/provider; suppression and enqueue-before-commit conclusions remain source analysis. |
| npm audit observation | 28 reported package records: 3 critical, 17 high, 6 moderate, 2 low | Historical dependency metadata. Critical records included production Next and development Vitest/coverage packages; not proof every advisory is exploitable. |

See [shared scorecards and verification](../research/audit-scorecards.json). Mock-heavy tests override sessions/auth dependencies, so high pass counts must not be interpreted as measured tenant isolation or transaction reliability. These historical local checks do not satisfy Elevateo's future Docker application-testing gate.

The pinned [`backend/requirements.txt`](../../third_party/upstream/wu-wei-mail/backend/requirements.txt) specifies many exact FastAPI/SQLAlchemy/Celery versions but some broad lower bounds, including external AI and browser tooling. [`requirements-test.txt`](../../third_party/upstream/wu-wei-mail/backend/requirements-test.txt) is separate; CI only installs runtime requirements before running pytest. The frontend lockfile should remain a historical reference; Elevateo must select a maintained pinned set and audit its own dependency graph before implementation.

Celery configuration uses late acknowledgements, separate sender/default queues, retries, task timeouts and a periodic beat schedule. These knobs help resource allocation but do not make non-idempotent email delivery safe. Its rate limit is per worker rather than an organization-wide provider limit. Beat includes scheduler, warmup, sync, auto-responder, workflow and cleanup tasks; importing all of them creates unnecessary scheduled load and multiple side-effect paths.

The Compose file starts PostgreSQL and Redis with development credentials and host port bindings. It does not start the frontend, API or workers. It is not a deployable institutional mailroom. Elevateo should use the selected Supabase stack and measure whether PostgreSQL jobs are sufficient before adding a Redis broker. Native desktop packaging, domain setup, off-host backup/restore and real provider operations are not verified by this repository's CI.

## Strict extraction plan

Every future adaptation requires provenance, retained license, changed behavior, exact target and its own verification. The current reference import executes none of these modules.

| Disposition | Exact upstream source | Proposed Elevateo target | Prerequisites and acceptance evidence |
| --- | --- | --- | --- |
| Reference team concepts | `backend/app/models/workspace.py`, `backend/app/models/user.py`, `backend/app/routers/workspace.py` | `packages/domain/src/access/`, `packages/database/` | Supabase Auth identity; separate organization/mailbox membership; invite/removal and restricted-role Postgres tests; no direct upstream auth copy. |
| Adapt grant lifecycle concepts | `backend/app/models/api_token.py`, `backend/app/services/api_token_service.py` | `packages/domain/src/connectors/`, `packages/mcp/` | Token hashing, one-time display, expiry, revocation and audited use; grant scope intersects current mailbox rights; no sending scope at baseline. |
| Reference conversation model | `backend/app/models/conversation.py`, `backend/app/services/inbox_service.py` | `packages/domain/src/conversations/`, `packages/database/` | Provider-neutral messages, participant/thread matching, per-user read state, composite integrity and mailbox authorization. |
| Adapt small UI/API patterns | `frontend/src/components/ui/`, `frontend/src/lib/api.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/lib/auth.test.tsx` | `apps/web/src/components/`, `packages/contracts/`, web tests | Review dependency licenses, fit React/Vite, shared schemas and session handling, verify keyboard/error/loading behavior and real UI. |
| Reference migration discipline | `backend/alembic/versions/`, `backend/app/database.py` | `packages/database/migrations/` and migration runbook | Design new Supabase SQL migrations, no Python/Alembic runtime required; test fresh/upgrade paths, RLS roles and restore with real PostgreSQL. |
| Port failure cases | `backend/app/workers/sender.py`, `backend/app/workers/scheduler.py` and W1/W2 audit scenarios | `packages/domain/test/delivery/`, `apps/worker/` tests | Durable job/outbox, atomic lease, final dispatch gates, fake-provider crash/timeout tests and recorded unknown outcomes. Do not port the buggy control flow. |
| Reference observability concepts | `backend/app/models/workflow.py` execution logs/dead-letter records | `packages/domain/src/jobs/`, operations UI | Diagnostic records tied to canonical jobs, bounded/redacted payloads, replay permissions and safe replay idempotency. No graph engine required. |
| Rewrite | Custom auth/refresh implementation, sender recovery, scheduler broker publish ordering | Supabase session integration, `apps/worker/`, `packages/domain/src/delivery/` | Resolve W1–W3 with regression tests and independent transaction review; one canonical send authority. |
| Reject for baseline | Website browsing, prospecting agents, auto-sending responders, LinkedIn/Unipile, warmup orchestrator | No core runtime destination | Out of company-mailbox scope; no new external credentials, browser workers or message-sending paths introduced by source intake. |
| Defer | Full visual workflows, campaign sequences, external inbox migration | Optional future approved modules | Explicit business need, provider-permitted use, separate threat/data-flow review and core mailbox stability first. |

## Mapping to Elevateo goals

| Goal | What Wu-Wei-Mail contributes | Gap / required work |
| --- | --- | --- |
| R01 — company mailbox for about 10 people | Workspace and conversation concepts | Per-mailbox privacy, assignments, per-user read state, immutable collaborative drafts and one shared-send authority. |
| R02 — Resend | Separated transport worker is an architectural reference | New send/receive adapter with stable event IDs, webhook verification, content retrieval and uncertain-outcome reconciliation. |
| R03 — self-hosted Supabase | PostgreSQL models and versioned migration practice | Supabase Auth, private Storage, RLS, backup coordination and operational ownership need new work. |
| R04 — web subdomain | Typed application shell and reusable UI | React/Vite adaptation, strict origins/session handling, HTTPS and real browser acceptance tests. |
| R05 — Mac and Windows downloads | Shared UI ideas | No verified Tauri packaging, signing, OS session storage or update pipeline; these remain Elevateo deliverables. |
| R06 — Claude and Codex connectors | Scoped token lifecycle design | Mailbox-specific grant model, MCP tool schemas and client tests; inference APIs/auto-responders do not meet connector requirement. |
| R07 — efficient compute | API/worker separation and queue prioritization | Do not inherit Redis/Celery/browser/AI workers without measured need. Use selected minimal service topology and benchmark. |
| R08 — backend/database/CAP tutorial | Concrete transaction, worker and token-family examples | W1–W3 teach uncertain I/O and rollback; database atomicity cannot extend automatically across the network. |
| R09 — Codex CLI and repository update | Pinned source, scores and traceable module map | Elevateo separately records actual CLI use and remote commits; no upstream branding or claims adopted. |
| R10 — source intake and strict documentation | Pinned MIT reference tree, independent findings and explicit reuse dispositions | Retain notices and manifest, quarantine runtime adoption and require tests/provenance per adaptation. |

## Production acceptance blockers

Resolve W1–W5 before considering any direct deployment, then prove mailbox isolation and current grants with real database roles rather than mocks. Implement immutable approvals, safe unknown delivery state, dispatch-time cancellation/suppression, authenticated durable webhooks, sanitized mail and protected attachments. Add off-host database/object restore, key separation, session revocation, observability and complete production deployment instructions. Validate resource use with the actual ten-person workload rather than the count of existing tests or features.

For the current product, Wu-Wei-Mail is strongest as a reference for explicit ownership, service boundaries, token lifecycle and migration discipline. Its prospecting, warmup and visual automation breadth should not determine Elevateo's first schema, service count or runtime dependencies.
