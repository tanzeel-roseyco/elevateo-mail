# Local completion plan — credentials last

Status: implementation handoff, 2026-10-12. This document specifies work to build and prove; it does not report a running application. Follow the root agent instructions and the current user-authorized scope. Complete the local application with real Supabase services and a deterministic mail-provider simulator before requesting external credentials.

## Target and boundaries

Deliver a shared company mailbox for approximately ten people: authenticated web UI, mailbox permissions, incoming threads, assignments, notes, labels, per-user read state, search, versioned drafts, reviewed sending, attachments, audit history, a durable worker, local Claude/Codex MCP integration and native client source/build configuration. All clients use the same backend. Use Resend for the eventual live transport and self-hosted Supabase for PostgreSQL, Auth and private Storage.

The local demonstration must survive API/worker restarts and use real database transactions and real authentication. A polished UI with hardcoded data, browser-only persistence, bypassed authorization or an always-successful mock is incomplete. Simulated provider delivery must be visibly identified as simulated. Do not add campaign engines, IMAP hosting, Gmail/Graph synchronization or offline mailbox storage to the initial scope.

Use [architecture](architecture.md), [reliability contracts](contracts-and-reliability.md), [desktop/connectors](desktop-and-connectors.md), [end goal](end-goal.md) and [component adoption](component-adoption.md) as the detailed design. Record intentional deviations and their evidence rather than silently replacing the contracts.

## 1. Inspect and reuse the local frontend

- Inspect existing first-party frontend work, package manifests, assets, route maps and git changes before scaffolding. Preserve useful existing work and adapt it to the mailbox workflow. If `apps/web` already exists, assess it first.
- If no suitable first-party frontend exists, inspect the pinned MIT reference frontends and select useful components using the adoption matrix. Build one coherent React/Vite frontend; do not start several upstream applications or join incompatible backends.
- Keep `third_party/upstream` immutable. Place adaptations in first-party packages, preserve applicable license notices, record exact upstream paths/pins and describe changes. BillionMail remains an AGPL reference unless its integration is separately authorized and obligations resolved.
- Audit imported components for raw HTML rendering, fake authentication, direct provider calls, exposed secrets, obsolete dependencies and inaccessible controls. Reuse their useful presentation without carrying over those behaviors.

Evidence: a short frontend inventory identifying what existed, what was retained/adapted, provenance, chosen routes and removed assumptions. Every visible feature must eventually call the real local API or clearly state that it is unavailable.

## 2. Establish a repeatable local stack

Create the TypeScript workspace with `apps/web`, `apps/api`, `apps/worker`, shared domain/contracts/database/provider packages and the later desktop/MCP packages. Pin compatible versions and lock dependencies. Keep the business rules shared between API and worker; PostgreSQL is the durable job store.

Provide a Docker-based development/test stack with real local Supabase PostgreSQL, Auth and private Storage, plus a local mail catcher for authentication messages. Distinguish this development setup from the eventual production self-hosted Supabase deployment. Bind services to loopback by default; prevent unintended external mail sending. Expose health/readiness checks and readable configuration errors.

Generate any necessary development-only secrets locally into ignored files. Do not request Resend, cloud, domain, AI-provider or signing credentials. Never reuse development secrets for production, print them in evidence, commit them or embed privileged keys in frontend bundles. Generate synthetic users and mail; do not import real company email to make the demo convincing.

Evidence: a clean-checkout setup transcript, pinned versions, successful service health checks and a second startup proving persistent data survives. Document first-run image downloads and disk/RAM requirements from measurement.

## 3. Build the database and identity boundary

Implement versioned migrations for organizations, memberships, mailboxes, mailbox memberships, addresses, contacts/participants, threads, messages, recipient outcomes, assignments, notes, labels, per-user read state, drafts/versions, attachment metadata, immutable send intents, jobs/leases, attempts, inbound events/imports, suppression records, connector grants and audit events. Refine this model against the tutorial; avoid creating unused abstractions without a workflow.

Use composite organization/mailbox constraints, explicit lifecycle states, necessary uniqueness and indexes. Protect business tables from unintended Data API access. Ordinary API requests use a restricted database role with transaction-local verified claims; worker privileges are separate. RLS and application checks must both enforce current membership, including pooled connection reuse. Object paths do not grant attachment access.

Implement actual local Supabase Auth login/logout, invite-only enrollment, session expiry and revocation, and current mailbox authorization on every request. Use local mail-catcher flows for enrollment/recovery; test MFA locally where included. For the web, implement the documented backend session, CSRF and origin controls, with local TLS or an explicitly documented loopback-only development exception. Do not substitute a permanent seeded bearer token for login. Never expose a Supabase service-role key to a client.

Evidence: migrations from empty PostgreSQL, upgrade from the previous schema, seeded two organizations plus permitted/restricted mailboxes, real-role isolation tests, revocation tests and restore of a disposable database copy. Verify data remains intact across a non-destructive migration.

## 4. Complete one real mailbox workflow, then the remaining UI

Wire login → mailbox list → incoming thread → assignment/internal note → draft → human review → approved job → worker result → audit history through the real API. Add search, filtering, labels, attachments, per-user read state, mailbox/user administration and permission-aware settings. Provide loading, empty, error, reconnect and permission-denied states. Ensure settings persist; remove decorative controls that have no behavior.

Draft edits require an expected version; concurrent edits display a recoverable conflict. Human approval freezes sender, recipients, subject, content and attachment versions. Approved version uniqueness prevents different clients from sending the same logical draft twice. Display queued, dispatching, accepted, unknown and delivery outcomes accurately. A request accepted into the queue is not evidence of delivery.

Evidence: two separate browser sessions completing the workflow against actual local services; restart the API and reopen the browser to prove server persistence. Capture representative desktop and narrow-width screenshots plus keyboard navigation, focus, overflow and readable error-state checks.

## 5. Finish worker, receiving and recovery with the simulator

Implement the provider interface and production Resend adapter, but default the running application to a local deterministic provider. The simulator must preserve its own acceptance/idempotency records across application/worker crashes and keep that ledger outside the application backup/restore target. Use an injectable clock and explicit fault controls; reject accidental live transport configuration in the local test profile.

Model: success, definitive rejection, rate limiting, accepted request with lost response, unavailable provider, duplicate/reordered signed webhook delivery, body-fetch failure, expired attachment URLs and provider key expiry. Simulated inbound traffic must pass the production webhook verification/import pipeline with a generated development signing secret; it must not insert UI rows directly.

Implement row-lock claims, bounded leases, generation-checked writes, immutable payload/key reuse, a persisted first-attempt time and the documented safe retry horizon. Recheck suppression, mailbox state and cancellation at dispatch authorization. Never hold a database transaction across provider I/O. Preserve `unknown` and require review after the retry horizon; do not reset all dispatching jobs on startup.

Persist inbound event and import intent before acknowledgment. Fetch content asynchronously, deduplicate per provider/account/mailbox, quarantine unknown recipients and thread only with compatible mailbox routing and participants. Reconciliation and replay must use stable identities and preserve known facts.

Evidence: the failure matrix below passes with real PostgreSQL and the durable simulator. Adapter contract fixtures must exercise actual Resend request/response mapping. These prove local behavior, not current Resend account permissions or internet delivery.

## 6. Make attachments and email content safe

Use private Storage and authorized metadata for uploads/downloads. Enforce size/type limits, bounded streaming and attachment ownership. Quarantine uploads/imports until a real local scanner releases them; unavailable/failed scanning leaves content quarantined. Use safe synthetic scanner fixtures and do not execute attachments. Implement orphan cleanup with a retention policy that protects references from drafts and immutable sends.

Sanitize incoming HTML and render it in an isolated restrictive frame; block remote images by default, dangerous URLs and native access. Restrict imported attachment download origins, redirects, sizes and timeouts; never fetch arbitrary links from an email. A simulated provider's loopback origin must be explicitly allowed only in the local profile. Route user downloads through an authenticated API/proxy that rechecks session/grant and current mailbox access on each new request. Keep any Storage signed URL server-side and never expose quarantined objects. Revocation cannot recall bytes already received; it must deny new downloads, including through previously obtained application links.

Evidence: cross-mailbox upload/download denial, a previously obtained application download link denied after revocation, malicious HTML and URL fixtures, oversized/failed downloads, scanner outage, quarantine release, attachment replacement after send approval, deletion/retention behavior and browser checks confirming no remote tracking request or script execution.

## 7. Complete local MCP and native clients

Build a versioned stdio MCP package over the authenticated API with list/search/read/create-draft/update-draft tools only. Issue individually scoped, expiring, revocable development grants; store bearer-secret hashes on the server and secrets in OS secure storage after local enrollment. Test transport retries, draft idempotency, bounded output, mailbox revocation and malicious email instructions. Do not expose send, SQL, shell, arbitrary fetch or privileged keys.

Run a protocol client/harness against the real local MCP process and API. Smoke-test installed Codex and Claude clients when their existing local sessions are available; record exact client/version/transport and results. If a client is absent or requires a new external login, finish the adapter and protocol tests and report that specific client check as pending. Do not claim harness tests prove both applications connected.

Package the working frontend in Tauri with restricted capabilities, system-browser PKCE and strict callback/state checks. Store refresh material in OS secure storage; keep native token forwarding narrowly scoped. Test logout, callback replay, connection loss, forbidden native calls and shared draft state. No arbitrary remote UI may receive native privileges.

Build and test unsigned development artifacts on the available target OS. macOS DMG verification needs a macOS runner; Windows installer verification needs Windows and its WebView2 prerequisite path. Add both build lanes and preserve checksums/logs. Missing Windows execution is a recorded native-validation gap, never a passing result. Production signing, notarization and release upload remain final activation work. Test updater rejection with development-only keys without enabling a public update channel.

## 8. Prove operations and finish the handoff

Provide local startup/shutdown, worker pause/resume, health, backup, restore, migration and rollback procedures. Keep logs structured and redact bodies/secrets. Expose queue age, unknown sends, inbound lag, scanner failures, authentication failures and storage use. Measure representative ten-user concurrency and attachment workloads before selecting hosting capacity.

Restore database and attachment backups together into a separate disposable environment. Keep the simulator's external acceptance ledger intact and outside the restore target. Include a backup taken before a send was accepted, then restore the application while retaining the provider's later acceptance record. Start the restored worker with outbound dispatch held; reconciliation must recover that accepted outcome without a fresh send. Verify attachment availability, authorizations, send identity and audit history after restoration. Measure observed recovery/data-loss behavior; do not declare an unmeasured SLA.

Update README with actual executable setup commands, `state.md` with implemented/pending boundaries, architecture/schema/API documentation, troubleshooting, source provenance and a tutorial showing one complete request through UI/API/PostgreSQL/worker. Record bounded adversarial reviews and a design-tradeoff review as required by root instructions. Do not claim conformance to an absent originating review rubric.

## Commands the implementing agent must provide

The following are **proposed command interfaces to implement**, not existing scripts or proof of a working stack. Supply these names or document an equally complete alternative. Make commands fail visibly when prerequisites are missing.

```sh
./scripts/dev bootstrap       # Check tools; create ignored local config; start healthy services
./scripts/dev migrate         # Apply versioned migrations without deleting existing data
./scripts/dev seed            # Idempotent synthetic fixture creation in the local profile only
./scripts/dev up              # Start web/API/worker/provider simulator
./scripts/dev check           # Docker lint, typecheck, unit and real-PostgreSQL integration tests
./scripts/dev e2e             # Container browser tests against the actual running application
./scripts/dev failure-check   # Deterministic crash/retry/revocation/import fault suite
./scripts/dev backup          # Create a local backup without printing secrets
./scripts/dev restore-check   # Restore into an isolated copy with sending initially held
./scripts/dev stop            # Stop task-owned services; retain persistent data
```

Provide separately documented platform-native build/test commands for macOS and Windows and an MCP enrollment/smoke-test command. Do not label an unexecuted command successful. Never make ordinary bootstrap/stop delete volumes or overwrite unrelated local services. Any reset command must identify and require explicit selection of its disposable target.

## Required acceptance evidence

Run application checks in Docker; add actual browser validation and target-OS native checks. Store synthetic-only logs/reports under a documented evidence directory with commit, command, exit status, tool versions and test counts. Keep authentication material and private local paths out of published artifacts.

| Check | Required result |
| --- | --- |
| Identity and isolation | Real login; foreign organization/mailbox IDs denied; viewer cannot send; reused pooled connection cannot inherit another user's claims |
| Revocation | An otherwise unexpired revoked session/grant and removed mailbox membership fail on the next protected call, including new downloads through old application links; unavailable authority fails closed |
| Concurrent drafts and sends | Stale draft update conflicts; same key/different payload conflicts; concurrent approvals with different keys produce one approved-version job |
| Worker contention | Two real PostgreSQL workers do not concurrently own one lease; a stale generation cannot overwrite the new owner |
| Ambiguous/crashed send | Provider accepts then response disappears; restart preserves one identity, recovers within the safe window and holds after expiry |
| Cancellation/suppression | Before dispatch boundary, no provider call; after that boundary, UI never promises recall |
| Inbound durability | Invalid signature rejected; DB failure is not acknowledged; replay/reordering causes one logical import and no regression of known facts |
| Mail and attachment safety | Scripts/tracking/native calls blocked; unauthorized and quarantined downloads denied; scanner failure remains closed |
| Browser completion | Two users complete the full persisted workflow, conflict recovery, permission failure and restart/reconnect at desktop and narrow widths |
| MCP | Actual stdio process accesses only permitted data and saves an unsent draft; retry is idempotent; invalid/revoked grants fail |
| Native | Per available target: install/launch/login/logout, protected storage, callback replay rejection and network-loss recovery verified |
| Recovery | Separate DB/object restore retains the later external provider ledger; a pre-acceptance backup reconciles to the accepted send without resubmission; dispatch starts held and original development data is preserved |

Report pass, fail, blocked or not run for each item; attach concrete evidence and remaining remediation. Local application completion requires the web/backend/database/worker/content/MCP-protocol/recovery checks. Native target gaps and unavailable AI-client checks remain explicit incomplete deliverables even when the web application passes.

## 9. Final activation: external credentials and real-world proof

Only after local work and its evidence are complete, prepare a concise activation checklist describing each needed credential, its purpose, minimum permissions, secret-store destination and rotation owner. Do not request secret values in chat or commit them. Separate external credentials from development secrets already generated locally.

Resolve domain/MX ownership, new-address versus migration plan, permitted message purposes, hosting region, retention, operating owner and recovery tier before live changes. Configure Resend keys/webhook secret and verified owned sending/receiving domains; server-side Supabase production secrets and storage; hosting/TLS/backups; desktop signing/notarization and updater signing. AI model API credentials are needed only if separately scoped embedded inference is added; local MCP does not require them.

Then perform controlled send/reply tests with owned addresses, real signed provider callbacks, bounce/rejection handling, actual provider reconciliation, TLS and production session checks, off-host restore, and signed clean-machine installation/update tests on each supported OS. Remote Claude web OAuth/MCP, public deployment, DNS migration and external release each need their own activation evidence and authorized operational scope.

The final report must distinguish **locally implemented and tested**, **provider-simulated**, **awaiting external activation**, and **unverified platform/client checks**. Never call simulated acceptance internet delivery, a local Supabase stack a production deployment, an unsigned build a signed release, or planned configuration a functioning integration.
