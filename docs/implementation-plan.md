# Implementation plan and release gates

Status: proposed plan. No application code, installers or live infrastructure exists in this repository.

## Gate 0 — approve the concrete design standards

Review [the revised standards](../.planning/STANDARDS.md). Resend and self-hosted Supabase are already selected; language/framework, desktop shell, hosting topology and detailed engineering rules are proposed. Existing repository instructions require explicit standards approval before application implementation. The present documentation work does not imply approval.

Resolve the actual company domain/MX provider and whether the first pilot uses new addresses or imports existing accounts before DNS work. Credentials are unnecessary for this design review.

## Milestone 1 — local vertical slice

Create the TypeScript workspace, shared contracts, API, worker and React UI. Add Supabase local development configuration and versioned migrations; do not expose the development stack publicly. Seed a company, two test users and one shared mailbox. Use a fake mail provider by default.

Demonstrate login, mailbox access, received thread, collaborative draft with version conflict, human send approval, durable job execution, result display and audit history. No campaign engine yet. The end-to-end slice is more useful than building many disconnected settings screens.

Exit: Docker lint/typecheck/tests pass; real PostgreSQL tests deny cross-company and cross-mailbox access; UI validated at desktop and narrow widths; duplicate-click/crash/retry tests pass. Track every implemented source file through review assignments of at most 200 lines, with a separate design-tradeoff reviewer, as required by AGENTS.md. The originating full review rubric is absent from this checkout; recover it or have the owner supply it before claiming rubric conformance.

## Milestone 2 — real transport and safe content

Add Resend adapter, signed webhook receipt, durable body retrieval, attachment quarantine, threading and reconciliation. Add sender-domain provisioning guide and operational health indicators. Add suppression/consent enforcement for the relevant message type. Integrate bounced/complained outcomes without confusing them with acceptance.

Exit: owned-address test send/reply succeeds; forged/duplicate/out-of-order events rejected or safely deduplicated; 24-hour provider key expiry simulation holds unknown sends; attachments cannot bypass authorization; incoming HTML and external images cannot execute or leak through the app.

## Milestone 3 — team pilot on the web

Production self-hosted Supabase installation is separate from local CLI development. Deploy with pinned images, TLS, restricted network exposure, invite-only users and off-host encrypted database/object backups. Document upgrade/rollback and on-call ownership. MFA, user removal and session revocation need acceptance tests.

Proposed initial targets for discussion: 10 active staff; p95 common API reads under 500 ms on representative data; inbound visible within 60 seconds in normal conditions; RPO 24 hours and RTO 4 hours for a first noncritical pilot. These are not measured, approved SLAs or suitable defaults for every company. Daily backups alone cannot meet a tighter RPO. Require continuous WAL archiving/PITR and object-version recovery if the company needs lower data loss. For a primary-company-mailbox candidate, discuss a stricter 15-minute RPO with the same proposed 4-hour RTO; accept and measure the final tier before rollout. Recovery starts with outbound dispatch held until pre-restore provider effects are reconciled; a rolled-back send ledger must not restart old sends. A restore drill, not an existing backup file, proves recoverability.

Exit: measured pilot workload, restored copy verified, outage runbook exercised, audit and membership controls checked. Do not advertise high availability on a single VPS. Define escalation and downtime communication before making it the company's primary inbox.

## Milestone 4 — Claude and Codex

Implement a local stdio MCP bridge over the same authenticated API. Tools: list mailboxes, search, get thread, create/update draft within explicit scopes. Connector output treats email content as untrusted data. Human sending remains an application action; grants do not allow send or arbitrary network calls.

Exit: both Codex CLI and Claude client smoke tests; revoked token denied; mailbox permission change enforced; prompted exfiltration to another mailbox denied; paginated/size-bounded results. Remote HTTP/OAuth for cloud-hosted Claude connectors is a separate deliverable, not something a localhost stdio bridge provides automatically.

## Milestone 5 — Mac and Windows

Package the shared UI with Tauri, system-browser PKCE, protected session storage and explicit capabilities. Build DMG on macOS and Windows installer on Windows CI. Sign/notarize and publish only after signing identities and release destinations are available. Keep artifacts private/internal until release intent is explicit.

Exit: installation on clean machines, native login/logout, safe external links, no application secrets in bundles, update signature validation, rollback and backend API compatibility. An unsigned local bundle is not a production release. Offline mailbox synchronization is deferred, because it introduces another database, conflict resolution and data-at-rest lifecycle.

## Milestone 6 — optional expansion

Add consent-based sequences, Gmail/Graph synchronization, advanced search or additional event-driven services only after the core mailbox is stable and these needs are confirmed. Preserve one scheduler authority. A provider adapter does not automatically import labels/history or respect external read state; each integration needs its own contract and recovery tests.

## Effort and resource planning

No fixed delivery date is promised. First estimate after the local slice reveals auth, threading and packaging integration costs. Track developer time, defects, memory, queue age, database growth and operator hours. Ten users makes interactive traffic modest, but incoming spam, attachments and retention can dominate storage and CPU. A simpler operational model is useful only if somebody can maintain it.

## Definition of done

A milestone is done when its behavior, failure cases, security boundaries, documentation and user-visible status agree. Keep README, state and review ledger synchronized in every implementation commit. Do not count planned APIs as working connectors, local development as production hosting, test email acceptance as inbox delivery, or CI packaging config as verified installers.
