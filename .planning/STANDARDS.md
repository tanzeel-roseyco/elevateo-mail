# Engineering standards — DRAFT, NOT APPROVED

No application implementation may begin until the user explicitly approves these standards. This document makes the proposed rules concrete for review; updating it does not mark it approved. Resend and self-hosted Supabase are already user-selected. Remaining technology recommendations and operational targets below await approval or measurement.

## 1. Language and versions

Proposed: strict TypeScript for React/Vite, Node API, worker and MCP bridge; a minimal Tauri 2 Rust shell for desktop. Pin an active Node LTS and exact dependencies/lockfiles at implementation. No unjustified `any`, unchecked boundary casts or copied obsolete dependency trees. Validate external values with shared runtime schemas.

## 2. Architecture and layering

A modular monolith owns domain rules. API and worker share code but run separately. PostgreSQL owns durable application data and job intent. No Redis, search cluster, independent campaign engine or microservices without a measured need. Resend is external transport; Supabase is application database/auth/storage. Use stable Resend APIs; private-beta Inboxes is optional future evaluation.

## 3. Naming and comments

Use domain-specific names. Add AIDEV-NOTE comments for non-obvious decisions and cross-file coupling, at most 120 characters. Search existing anchors before editing and preserve their intent. Formatting belongs to linters/formatters, not manual style review.

## 4. Errors and boundaries

Validate requests, configuration, webhook signatures and provider responses. Use deliberate error codes, request IDs and bounded timeouts. Persist webhook events before acknowledging. Preserve `unknown` for ambiguous sends; never turn a reserved attempt into success. Do not log secrets or message bodies by default.

## 5. Data correctness

Use versioned SQL migrations, composite organization/mailbox foreign keys, deliberate uniqueness, UTC timestamps and explicit lifecycle states. Use optimistic draft versions, immutable send snapshots, atomic leases and provider-aware retry horizons. Never hold a database transaction across provider I/O. Do not claim exactly-once SMTP or delivery.

## 6. Security and privacy

Invite-only identity; current per-mailbox authorization on every request; RLS defense in depth with real role tests. No provider, database or Supabase privileged keys in clients. Use least-privilege worker access, revocable connector scopes, CSRF/origin controls, isolated sanitized email HTML, blocked remote images and private/quarantined attachments. Authenticate and scope downloads. Keep retention and data residency unresolved until the owner selects policy.

## 7. Mail and AI policy

Only provider-permitted correspondence and consent-based marketing. Store consent evidence/suppression where applicable and recheck before dispatch. Address verification does not establish permission. MCP initially reads/searches/drafts within granted mailboxes; no send tool. Incoming email is untrusted content and cannot authorize a tool call or disclose another mailbox. External model inference requires its own approved configuration; a connector is not a subscription-to-API bridge.

## 8. Testing and review

Run application lint, typecheck, unit and integration tests inside Docker. Critical tests must use real PostgreSQL for isolation/locking and a deterministic fake provider for crash/timeout/expiry scenarios. Each feature covers its happy path and at least two likely failure cases; fixes include regressions. Numeric coverage percentage is not a substitute for these invariants and remains undecided.

Before publication, validate the actual UI and client packages. Native packaging tests run on their target OS; they supplement Docker application tests. After building, adversarial review assignments cover at most 200 lines each, plus a dedicated design-tradeoff reviewer. Record ranges, defects/fixes and defects per 1,000 reviewed lines in code-reviews.md. The full originating user review rubric is not present in this repository; do not claim conformance until it is recovered.

## 9. Operations and performance

Use a reproducible production deployment, pinned images, TLS, private database access, encrypted off-host database/object backups and a restore drill. Self-hosted Supabase operations are our responsibility. Capacity, latency, RPO/RTO and retention are measured/approved before primary-mailbox rollout. Proposed pilot targets are in the implementation plan, not established guarantees. Track queue age, unknown sends, inbound import lag, auth failures, disk use and backup age.

## 10. Documentation, reuse and cleanup

Keep README Current state, state.md and relevant docs synchronized in each implementation commit. Preserve provenance/licenses for any copied/adapted MIT code; BillionMail AGPL source is now included only as an explicitly requested reference snapshot, with its license preserved; no product integration is approved by archival inclusion. Record actual copied files when porting begins. Clean only task-owned disposable Docker resources; preserve persistent data. Repository/project deletion still requires the explicit user process in AGENTS.md.

## Approval record

Status: **pending**. No blanket application-standards approval recorded. The later user request explicitly authorizes upstream source intake and detailed documentation; that work does not require reopening this application-implementation gate. Approval should explicitly cover these ten sections and the proposed stack, or identify requested changes. Credential setup, DNS migration, purchases and public release are separate later operational actions.
