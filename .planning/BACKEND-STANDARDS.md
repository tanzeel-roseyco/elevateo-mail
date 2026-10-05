# Backend and desktop standards — foundation authorised; production decisions proposed

4 October 2026. These extend, rather than silently replace, the approved frontend-only [STANDARDS.md](STANDARDS.md). The user explicitly authorised autonomous backend foundation implementation on 5 October 2026, with credentials last. This supersedes the backend implementation gate only; desktop, live integration and unresolved production decisions remain pending. The [master plan](../docs/product-master-plan.md) explains the product; the [blueprint](../docs/backend-blueprint.md) defines proposed behaviour.

Review and challenge each numbered section. Record approval or changes by section here before implementation. Production decisions remain **proposed**. The implemented credential-free foundation is described in [backend-foundation.md](../docs/backend-foundation.md).

## 1. Languages and versions

Retain the repository's pinned React 19, TypeScript 5, Vite 7 and Node 24 tooling initially. Enable strict typing and unchecked-index protection. Add Tauri 2 with a minimal Rust host; pin exact Rust/Tauri/CLI/tool versions and the Workers compatibility date after a compatibility/security check. Do not infer current latest versions from this proposal. Use one lockfile/workspace configuration and a documented package-manager version. Every dependency needs a reason; prefer platform APIs.

**Review:** accept keeping the existing frontend stack and adding only the desktop host and cloud tooling needed for this plan?

## 2. Architecture and layering

One modular backend with API, scheduled and queue entry points; D1, R2 and Queues provisionally. Pure domain rules, explicit provider adapters, shared boundary schemas. Dependencies point inward. No Redis/message-bus platform/microservice split without measured need. Migrate the existing prototype deliberately; all server-owned mutations go through a gateway/use case.

Create shared packages only when a second consumer needs them. Implement one inbox with two-user isolation and a safe sending ledger before broad provider support. Repository diagrams describe ownership, not mandatory empty scaffolding.

**Review:** accept this smaller architecture, conditional on the storage/cost pilot?

## 3. Naming and comments

Use business names such as `SendIntent`, `MailboxConnection`, `ConsentEvidence` and `CampaignVersion`. TypeScript component files PascalCase, other TS files camelCase; Rust follows standard Rust naming. One concern per module. Preserve/update `AIDEV-*` anchors, at most 120 characters, where intent or cross-file coupling is non-obvious. Never comment secrets or copy dead code for reference. Linters own style checks.

**Review:** any existing company naming conventions this should adopt?

## 4. Errors and validation

Validate every external boundary with schemas, including environment, IPC, files, webhooks and provider responses. Errors carry a stable code, safe message and correlation ID. No swallowed failures, silent fallback, seed-data substitution in production or provider timeout treated as definitive non-acceptance. Unknown send outcomes remain visible and unreplayed except for verified provider idempotent recovery.

**Review:** accept a visible “needs review” state when the provider outcome cannot safely be determined?

## 5. Data and migrations

Database records and objects are scoped to the authenticated owner, including foreign keys and uniqueness constraints. Use transactions/conditional state changes, a durable outbox and deduplicated receipts. Validate D1 SQL behaviour rather than copying PostgreSQL assumptions. Use additive migrations, tested rollback/forward repair and explicit confirmation for destructive changes. Restore with sending paused until suppression and send activity are reconciled.

**Review:** ten mailboxes per user is confirmed; review retention and import/storage allowances separately. Unlimited retained mail is not proposed.

## 6. API and state

HTTPS versioned JSON, schema-first contracts, server-derived ownership, bounded cursor pages and revision checks. User-scoped idempotency keys for side effects. Server is authoritative; client cache is disposable except explicitly saved local drafts. URL holds navigation, not secrets. Mail supports multiple labels. Keep acceptance, delivery, bounce and reply separate. Update affected UI states/contracts together.

**Review:** accept explicit conflict/retry screens rather than silently overwriting simultaneous edits?

## 7. Sending rules

Maximum 30 per connected mailbox per day, applying across providers, aliases, manual, campaign and AI paths. Proposed counting: each recipient in a rolling 24 hours; stable mailbox identity survives reconnect. Confirmed pilot: ten private users, each with up to ten mailboxes; effective maximum 300/user/day and 3,000 total/day. The earlier 600/user/day ceiling applies only to a later mailbox expansion. Use atomic quota reservation and clear dispatch timestamps; pending/unknown work cannot fall out of counters while still capable of sending. Lower provider limits win. Resend sends opted-in campaigns only from approved verified identities; Gmail handles personal inbox mail. Consent/suppression and approved revision are checked at admission. Disclose the in-flight cancellation boundary.

**Review:** confirm rolling 24 hours and per-recipient counting; reserve some of the 30 for personal replies if desired.

## 8. Security, privacy and AI

Google app sign-in and separate least-privilege mailbox grants; settle MFA before production. Encrypt provider credentials with a separate versioned wrapping key; use Windows-protected local credential storage. AI reads only selected mailboxes and prepares app drafts; sending is separately enabled and approved. App-owned MCP tools enforce the same backend permissions and quota ledger. Secrets enter secure settings, never chat. No raw HTML/script/remote tracking by default. External email content is untrusted, not agent instruction. Local CLI context transfer requires permission and applicable Google policy review. Approval binds exact actions; no unsandboxed tool fallback. Claude initially drafts with tools/MCP/hooks disabled; a later bounded mail MCP mode requires verified isolation.

DNS writes are limited to an isolated broker for explicitly approved subdomains, exact record names/types and human-approved change plans. Mail workers and AI have no DNS credentials. Root/company MX and the reported existing `in.elevateoco.com` route remain protected. Recheck record state and scope at execution; invalidate changed plans. Cloudflare zone tokens are broader than this application policy; document the residual risk and use manual owner changes or a provider-isolated child zone where strict isolation is required. See [Connections security](../docs/connections/security-plan.md).

**Review:** confirm MFA, data region and allowed AI providers/context; these are product decisions, not implementation details.

## 9. Testing and review

Docker for lint, typecheck, domain, integration, provider-fake and browser tests. Keep at least 90% domain line coverage, with behavioural happy/failure cases; no arbitrary global coverage or snapshot target. Every bug fix gets a regression. Concurrency, isolation, unknown outcomes, import bounds and restore are mandatory. Native Windows installer/sandbox/notification checks are a documented platform exception. Inspect actual UI before release. Adversarial code reviews cover small slices plus a dedicated design reviewer; report defect counts/density. Clean only task-owned disposable Docker resources.

**Review:** accept focused failure tests and native Windows checks instead of paying for a cloud test service?

## 10. Performance and cost budgets

Correctness and security precede performance. Preserve the prototype's 250 KB initial JS budget pending an explicit desktop revision. Target app idle CPU under 1%, working set below 250 MB visible/150 MB tray and p95 interaction feedback below 100 ms on recorded hardware. One CLI task, bounded memory/output/time, cancellation and child cleanup. Target API-owned work p95 under 500 ms at agreed pilot load, excluding provider latency; measure Worker CPU and database queries independently. Import/backfill cannot starve dispatch or UI. Hosting goal under A$15 includes storage/backups/operations; provider, AI, verification and signing costs are separate. Maximum workload fit remains unproven.

The [efficiency plan](../docs/efficiency-plan.md) defines bounded queries/imports, push coalescing, fair job scheduling and the 100-mailbox cost scenario. Its approximately A$10.47 base / A$11.87 busy reconciliation estimates assume a proposed 50-GB R2 allowance and exclude additional traffic/overages; they are not a guaranteed bill.

**Review:** choose history/import allowances and accept measured resource targets rather than promises of unlimited scale.

## 11. Operations and release

Private custom health screen plus redacted provider logs, independent outage check, documented incident/restore runbooks and bounded retention. No self-hosted monitoring cluster initially. Separate development/staging/production credentials and fixture data. Release only after required tests, native/visual QA, standards review and live contract checks pass. Maintain README current state, state files, relevant docs and review notes in each implementation commit. Backend standards approval, Google approval route and a demonstrated cost envelope are launch gates.

A backup in the same cloud account is not independent disaster recovery. Agree an independent destination, encryption-key recovery, operator and affordable schedule before promising a 24-hour recovery point. Rehearse the independent outage alert through its chosen notification destination.

**Review:** confirm the operator and incident notification destination before the pilot.

## Approval record

| Sections | Status | Evidence |
| --- | --- | --- |
| 1–11 | Proposed, awaiting section-specific review | Backend foundation explicitly authorised 2026-10-05; remaining production/desktop decisions proposed |

## Authorised foundation defaults (2026-10-05)
Rolling 24 hours; normalised unique recipient deliveries across To/CC/BCC; maximum 30 per mailbox. Reconnects preserve provider identity and quota. Only connected records occupy the ten active slots; disconnected history retains quota, and replacements share a 300-recipient owner ceiling. Pending, dispatching and unknown outcomes reserve quota until cancellation or positive reconciliation; accepted usage ages from dispatch time. Scheduled approvals expire at scheduled time plus configured TTL (default one hour; 60–86400 seconds); schedules are bounded to 30 days. These are conservative simulation choices, not silent approval of launch policy. Quota constants are validated against SQL: changing them requires a reviewed migration, not an ignored environment override.

Tooling uses a separate pinned backend lockfile to preserve frontend work; portable v1 runtime schemas and a fetch consumer share the integration boundary without creating an unnecessary package. Strict checks, behavioural failure tests and adversarial review apply now. Domain coverage measurement and real cloud performance/cost verification remain release checks; no production-readiness claim is made.
