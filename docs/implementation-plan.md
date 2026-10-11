# Implementation plan and release gates

Status: **expanded provisional application plan**. Six upstream source snapshots are reference material; no integrated Elevateo application, installers or live infrastructure exists. This plan follows the [Rails-led polyglot proposal](../.planning/POLYGLOT_ARCHITECTURE.md). Required Fable 5, Opus 5.5 and Fable 5.1 opinions remain pending after three authentication failures before inference; no final design synthesis is claimed.

## Gate 0 — use the local completion brief

Start with [LOCAL_BUILD_PROMPT.md](../LOCAL_BUILD_PROMPT.md), [the local completion plan](local-completion-plan.md), [the engineering baseline](../.planning/STANDARDS.md) and [agent orchestration](../.planning/AGENT_ORCHESTRATION.md). Reconcile research and obtain the three separately started opinions plus Astra MAX synthesis before accepting each task's approach. The current planning edit aligns documents and continues independent research; it does not bypass that gate or start implementation. After acceptance, Devin through Codex owns bounded backend tasks and Astra LOW owns bounded fixes through the documented branches, PRs and review issues. Implementation-agent authentication is a user-controlled prerequisite for those opinions and Devin; application model/provider/signing credentials stay last. No blanket production approval is claimed.

The milestones below describe product capabilities and eventual release gates. Execute their locally testable parts in the order given by the local completion plan before requesting application/provider/signing credentials. In particular, live send/reply and production hosting checks in milestones 2–3 must not block offline adapter tests, local MCP, development desktop packages or restore exercises. Mark live and unavailable-platform checks pending until actually performed.

The current workload is about ten staff and nine addresses across one or two domains. Resolve the actual address/alias map, company domains/MX provider and whether the first pilot uses new addresses or imports existing accounts before DNS work. Application/provider credentials are unnecessary for this design review.

## Milestone 1 — local vertical slice

Create one Rails application under `apps/server`, with API and worker commands sharing Ruby domain code, plus the strict TypeScript React/Vite UI. Maintain canonical wire schemas in `contracts` and TypeScript bindings in `packages/contracts`; do not create a second Node domain API. Add real local Supabase Auth/Storage/PostgreSQL and one application SQL migration lane. Seed two users, a second organization, shared/private mailboxes and synthetic nine-address fixtures covering one- and two-domain routing; do not expose development services publicly.

Use a TypeScript/Express provider simulator by default. Its durable acceptance ledger remains outside the application restore target, and simulated signed events traverse the normal Rails ingestion path. Implement Ruby provider adapters against the same contract; local transport must fail closed against live Resend/SMTP egress. API and worker alone use narrowly scoped application database roles; only the worker can submit provider sends.

Demonstrate login, mailbox access, received thread, collaborative draft with version conflict, human send approval, durable job execution, result display and audit history. No campaign engine yet. The end-to-end slice is more useful than building many disconnected settings screens.

Exit: Docker lint/typecheck/tests pass; real PostgreSQL tests deny cross-company and cross-mailbox access; UI validated at desktop and narrow widths; duplicate-click/crash/retry tests pass. Track every implemented source file through review assignments of at most 200 lines, with a separate design-tradeoff reviewer, as required by AGENTS.md. The originating full review rubric is absent from this checkout; recover it or have the owner supply it before claiming rubric conformance.

## Milestone 2 — provider adapter and safe content

Add the Ruby Resend adapter, signed webhook receipt, durable body retrieval, attachment quarantine/scanning, threading and reconciliation. Preserve atomic immutable approval, lease fencing, the dispatch boundary and explicit unknown outcomes; generic Rails job retries must not become send authority. Add sender-domain provisioning guidance, operational health indicators and applicable suppression/consent enforcement. Integrate bounced/complained outcomes without confusing them with acceptance.

Local exit: offline provider mapping and forged/duplicate/out-of-order events pass; provider-key-expiry simulation holds unknown sends beyond the safe horizon; scanner outage remains quarantined; revoked access cannot reuse application download links; incoming HTML and external images cannot execute or leak. Retain the full [failure matrix](contracts-and-reliability.md). The real owned-address send/reply is a later, separately authorized activation check, not a prerequisite for the remaining local milestones.

## Milestone 3 — operations, then authorized web pilot

First prove local startup, persistence, worker controls, backup/restore and resource measurements. Production self-hosted Supabase is separate from local CLI development. At authorized activation, deploy the Rails API/worker with essential Supabase services, pinned images, TLS, restricted network exposure, invite-only users and encrypted off-host database/object backups. Include scanner costs; do not deploy the Express simulator or development tools. Document upgrade/rollback and operating ownership. MFA, user removal and session revocation need acceptance tests.

Proposed initial targets for discussion: 10 active staff; p95 common API reads under 500 ms on representative data; inbound visible within 60 seconds in normal conditions; RPO 24 hours and RTO 4 hours for a first noncritical pilot. These are not measured, approved SLAs or suitable defaults for every company. Daily backups alone cannot meet a tighter RPO. Require continuous WAL archiving/PITR and object-version recovery if the company needs lower data loss. For a primary-company-mailbox candidate, discuss a stricter 15-minute RPO with the same proposed 4-hour RTO; accept and measure the final tier before rollout. Recovery starts with outbound dispatch held until pre-restore provider effects are reconciled; a rolled-back send ledger must not restart old sends. A restore drill, not an existing backup file, proves recoverability.

Exit: measured pilot workload, restored copy verified, outage runbook exercised, audit and membership controls checked. Do not advertise high availability on a single VPS. Define escalation and downtime communication before making it the company's primary inbox.

## Milestone 4 — Claude and Codex

Implement a TypeScript local stdio MCP bridge over the authenticated Rails API. Tools: list mailboxes, search, get thread, create/update draft within explicit scopes. Connector output treats email content as untrusted data. Human sending remains an application action; grants do not allow send or arbitrary network calls. In-app Codex/Fable CLI adapters are distinct work packages governed by the [client plan](../.planning/CLIENTS_AND_CLI_CONNECTORS.md), not implied by mailbox MCP registration.

Complete the bounded PHP read/search/draft SDK example, Go operations-read/backup-manifest CLI and Python synthetic failure fixtures through the same versioned contracts. None gets direct application-table or provider access. These are on-demand integration/development tools, not separate production backend services.

Exit: both Codex CLI and Claude client smoke tests; revoked token denied; mailbox permission change enforced; prompted exfiltration to another mailbox denied; paginated/size-bounded results. Remote HTTP/OAuth for cloud-hosted Claude connectors is a separate deliverable, not something a localhost stdio bridge provides automatically.

## Milestone 5 — Mac and Windows

Use a Rust/Tauri Mac host and the requested C#/.NET Windows GUI/host; assess bundled shared UI in the client ADR before duplicating screens. Use system-browser PKCE, protected session storage and narrowly scoped native capabilities. Build a DMG on macOS and a separate Windows installer on Windows; do not also ship a Tauri Windows client. Opus 5.5 owns Anime.js refinement and any justified C++ task. Sign/notarize and publish only during authorized activation after local evidence; keep development artifacts private/internal.

Exit: installation on clean machines, native login/logout, safe external links, no application secrets in bundles, update signature validation, rollback and backend API compatibility. An unsigned local bundle is not a production release. Offline mailbox synchronization is deferred, because it introduces another database, conflict resolution and data-at-rest lifecycle.

## Milestone 6 — requested mobile clients

After the web/desktop core stabilizes, implement the Java Android client/APK and SwiftUI iOS client over the same Rails API and versioned wire contracts. Use platform session storage and lifecycle handling; do not duplicate mailbox permissions, sending rules or the database. Ionic/Capacitor, Electron and Qt remain evaluated alternatives, not simultaneous shells or grounds to replace the requested languages silently.

Exit: actual emulator/device login/logout, revocation, lifecycle/reconnect, draft conflicts, content isolation and permission checks. Record Android and iOS separately; missing toolchains or signing remain explicit gaps. Mobile delivery is a required later milestone and does not block proving the first local mailbox slice. Production signing and distribution stay at final activation.

## Milestone 7 — optional expansion

Add consent-based sequences, Gmail/Graph synchronization, advanced search or additional event-driven services only after the core mailbox is stable and these needs are confirmed. Preserve one scheduler authority. A provider adapter does not automatically import labels/history or respect external read state; each integration needs its own contract and recovery tests.

## Effort and resource planning

No fixed delivery date is promised. First estimate after the local slice reveals auth, threading and packaging integration costs. Track developer time, defects, memory, queue age, database growth and operator hours. Ten users makes interactive traffic modest, but incoming spam, attachments and retention can dominate storage and CPU. A simpler operational model is useful only if somebody can maintain it.

## Definition of done

A milestone is done when its behavior, failure cases, security boundaries, documentation and user-visible status agree. Keep README, state and review ledger synchronized in every implementation commit. Record pending opinions, client/platform gaps and conditional language roles explicitly. Do not count planned APIs as working connectors, local development as production hosting, test email acceptance as inbox delivery, or CI packaging config as verified installers.
