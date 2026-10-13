# Local completion plan — credentials last

Status: documentation-only handoff updated 2026-10-13. The user selected Rails backend, Laravel Blade/Livewire frontend, self-hosted Supabase and Resend. This document specifies future implementation; no application or test result is claimed. The next agent must complete the research and implementation-detail opinion gates below, then build/prove local services with a deterministic mail-provider simulator before requesting production credentials. The current instruction prohibits live sends, including Instantly warmup. No application code changes are authorized by this documentation update.

## Target and boundaries

Deliver a shared company mailbox for approximately ten people and a planning fixture of nine addresses across one or two domains: authenticated web UI, mailbox permissions, incoming threads, assignments, notes, labels, per-user read state, search, versioned drafts, reviewed simulated sending, attachments, audit history, a durable worker, local Claude/Codex MCP, separate in-app agent adapters and native client source/build configuration. Actual addresses, aliases and mailboxes are still unknown. All clients use one backend. Use Resend for eventual separately authorized live transport and self-hosted Supabase for PostgreSQL, Auth and private Storage.

The local demonstration must survive API/worker restarts and use real database transactions and real authentication. A polished UI with hardcoded data, browser-only persistence, bypassed authorization or an always-successful mock is incomplete. Simulated provider delivery must be visibly identified as simulated. Do not add campaign engines, IMAP hosting, Gmail/Graph synchronization or offline mailbox storage to the initial scope.

Use [architecture](architecture.md), [ADR 0002](decisions/0002-rails-laravel-presentation.md), [the diagram](architecture-diagram.md), [reuse playbook](component-reuse-playbook.md), [cross-platform tests](cross-platform-testing.md), [reliability contracts](contracts-and-reliability.md), [desktop/connectors](desktop-and-connectors.md), [end goal](end-goal.md) and [component adoption](component-adoption.md), reconciled with [the polyglot plan](../.planning/POLYGLOT_ARCHITECTURE.md), [agent workflow](../.planning/AGENT_ORCHESTRATION.md) and [client/CLI plan](../.planning/CLIENTS_AND_CLI_CONNECTORS.md). The user's selected Rails/Laravel split supersedes React/TypeScript product UI and Node-domain defaults. Detailed reviews remain pending; preserve existing reliability/permission contracts.

## 0. Research, independent opinions and task ownership

Codex's first assignment is the GitHub/Reddit reuse scan against these goals and the local frontend inventory. Verify exact source paths, revisions, license, maintenance, security and integration cost before adoption; Reddit supplies operational leads, not source-level proof. Reconcile larger candidates with the six archived dossiers instead of discarding their findings.

GPT 6 ASTRA MAX owns design and backend architecture. The next agent must launch the [saved Fable 5, Opus 5.5 and Fable 5.1 consultations](../.planning/consultations/README.md) against the selected stack and, for each bounded task, record accepted/adapted/rejected suggestions and reasons. Initial attempts failed before inference because Claude OAuth expired; no opinions were returned. Do not retry consultations in this documentation-only update. Keep implementation-detail gates pending without treating user-selected frameworks as undecided. Agent-login recovery is a tooling prerequisite distinct from production credentials.

After the accepted design, assign Devin bounded backend milestones through the verified official connection, with isolated branches, cohesive commits, tested draft PRs and review-derived issues. Assign Astra LOW bounded reproduced fixes; architecture/security changes return to Astra MAX and the same opinion gate. Fable 5 or Opus 5.5 owns frontend implementation; Opus 5.5 owns Anime.js/motion and every C++ task. Use the orchestration plan's actual capability status and task brief; a named assignment is not a successful agent session.

## 1. Inspect and reuse the local frontend

- Inspect first-party frontend work, manifests, assets, routes and git changes before scaffolding. Preserve useful designs/behavior and adapt them to the selected Laravel presentation. If `apps/web` exists, assess it first; preserve its useful work without silently retaining a conflicting framework.
- Inspect the pinned reference frontends and select useful parts through the reuse playbook/adoption matrix. Port React markup, style tokens and interaction patterns into Blade/Livewire and Alpine/plain JavaScript, with explicit provenance and tests; do not install React/TypeScript as the product frontend or start the archived applications.
- Keep `third_party/upstream` immutable. Place adaptations in first-party packages, preserve applicable license notices, record exact upstream paths/pins and describe changes. BillionMail remains an AGPL reference unless its integration is separately authorized and obligations resolved.
- Audit imported components for raw HTML rendering, fake authentication, direct provider calls, exposed secrets, obsolete dependencies and inaccessible controls. Reuse their useful presentation without carrying over those behaviors.

Evidence: a frontend inventory identifying existing work, exact reused/ported paths and pins, licenses, chosen routes, integration boundaries and removed assumptions. Distinguish copied code from independently reimplemented behavior. Every domain feature must call Rails through the user-scoped Laravel adapter or clearly state that it is unavailable; typing/focus/selection remain local browser interactions.

## 2. Establish a repeatable local stack

After implementation-detail reviews, create one Rails domain codebase with separate API and worker commands, Laravel Blade/Livewire presentation, Alpine/plain JavaScript and Anime.js, versioned OpenAPI/event contracts, TypeScript/Node MCP and process adapters, and later platform hosts. Rails owns domain migrations, business rules, provider mapping and durable PostgreSQL send intent. Laravel owns presentation and only its protected session-store migrations; it has no mailbox models/queries/jobs or provider/privileged Supabase credentials. Supabase owns internal Auth/Storage schemas. Express is only the local provider simulator. Go diagnostics/Python fixtures remain bounded tools; no competing domain writers. Pin compatible versions and dependencies.

Provide a Docker-based development/test stack with real local Supabase PostgreSQL, Auth and private Storage, plus a local mail catcher for authentication messages. Distinguish this development setup from the eventual production self-hosted Supabase deployment. Bind services to loopback by default; prevent unintended external mail sending. Expose health/readiness checks and readable configuration errors.

Generate any necessary development-only secrets locally into ignored files. Do not request Resend, cloud, domain, AI-provider or signing credentials. Never reuse development secrets for production, print them in evidence, commit them or embed privileged keys in frontend bundles. Generate synthetic users and mail; do not import real company email to make the demo convincing.

Evidence: a clean-checkout setup transcript, pinned versions, successful service health checks and a second startup proving persistent data survives. Document first-run image downloads and disk/RAM requirements from measurement.

## 3. Build the database and identity boundary

Implement versioned migrations for organizations, memberships, mailboxes, mailbox memberships, addresses, contacts/participants, threads, messages, recipient outcomes, assignments, notes, labels, per-user read state, drafts/versions, attachment metadata, immutable send intents, jobs/leases, attempts, inbound events/imports, suppression records, connector grants and audit events. Refine this model against the tutorial; avoid creating unused abstractions without a workflow.

Use composite organization/mailbox constraints, explicit lifecycle states, necessary uniqueness and indexes. Protect business tables from unintended Data API access. Ordinary API requests use a restricted database role with transaction-local verified claims; worker privileges are separate. RLS and application checks must both enforce current membership, including pooled connection reuse. Object paths do not grant attachment access.

Implement local Supabase Auth login/logout, invite-only enrollment, session expiry/revocation and current mailbox authorization on every call. Use local mail-catcher enrollment/recovery and test MFA where included. Laravel holds encrypted per-user access/refresh material in a protected server-side store; if PostgreSQL is used, create a separate private presentation schema and restricted role with no domain/Auth-table access. Its host-only secure cookies identify sessions; no tokens in HTML, Livewire properties or browser storage. Add CSRF/origin checks, refresh serialization, session rotation/expiry and restore-time invalidation unless replay-safe recovery is proven. Laravel forwards the individual token to Rails; Rails checks authoritative current session/membership, never trusting a BFF user ID or all-powerful service identity. Use local TLS or a documented loopback-only development exception. No permanent seeded bearer-login substitute or client service-role key.

Evidence: migrations from empty PostgreSQL, upgrade from the previous schema, seeded two organizations plus permitted/restricted mailboxes, real-role isolation tests, revocation tests and restore of a disposable database copy. Verify data remains intact across a non-destructive migration.

## 4. Complete one real mailbox workflow, then the remaining UI

Wire login → mailbox list → incoming thread → assignment/internal note → draft → human review → approved job → worker result → audit history through Laravel's user-scoped Rails adapter. Add search, filtering, labels, attachments, per-user read state, mailbox/user administration and permission-aware settings. Provide loading, empty, error, reconnect and permission-denied states. Keep typing/selection/focus immediate in Alpine/plain JavaScript, debounce autosave/search and preserve composer state across Livewire updates; do not add a second Alpine runtime. Ensure settings persist and remove decorative controls without behavior.

Draft edits require an expected version; concurrent edits display a recoverable conflict. Human approval freezes sender, recipients, subject, content and attachment versions. Approved version uniqueness prevents different clients from sending the same logical draft twice. Display queued, dispatching, accepted, unknown and delivery outcomes accurately. A request accepted into the queue is not evidence of delivery.

Evidence: two separate browser sessions completing the workflow against actual local services; restart the API and reopen the browser to prove server persistence. Capture representative desktop and narrow-width screenshots plus keyboard navigation, focus, overflow and readable error-state checks.

Opus 5.5 adds restrained Anime.js motion only after the persisted flows work. Meet the client plan's reduced-motion, focus, contrast and measured responsiveness budgets. Use Node.js contract scripts and Playwright as the primary browser suite; use Puppeteer only for a distinct diagnostic requirement. Do not add a graphics engine or native C++ dependency without its documented benefit and review.

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

## 7. Complete mailbox MCP, in-app adapters and native clients

Build a versioned stdio MCP package over the authenticated API with list/search/read/create-draft/update-draft tools only. Issue individually scoped, expiring, revocable development grants; store bearer-secret hashes on the server and secrets in OS secure storage after local enrollment. Test transport retries, draft idempotency, bounded output, mailbox revocation and malicious email instructions. Do not expose send, SQL, shell, arbitrary fetch or privileged keys.

Run a protocol client/harness against the real local MCP process and API. Smoke-test installed Codex and Claude clients when their existing local sessions are available; record exact client/version/transport and results. If a client is absent or requires a new external login, finish the adapter and protocol tests and report that specific client check as pending. Do not claim harness tests prove both applications connected.

Build separate in-app process adapters: Codex owns its stdio app-server adapter; Fable 5 owns the Claude runtime adapter, with Opus 5.5 reviewing. These are not mailbox MCP. First use a fake agent with the real local bridge to prove streaming, cancellation, crash/reconnect, malformed events and approval denial. Use supported structured protocols and fixed executable/argument arrays; no arbitrary command strings or inherited server secrets. Default mailbox assistance to read/search/draft capabilities with local filesystem/shell disabled by runtime policy. Optional workspace access requires separate explicit grants and sandboxing; mail must not automatically enter a shell-enabled context.

A public browser page or remote mailbox WebView cannot spawn local tools. Only the separate trusted bundled assistant panel may invoke its native bridge. A later browser companion requires a separately reviewed boundary, explicit pairing, authenticated loopback, exact origin/Host checks, CSRF, expiry, revocation and replay tests; it is not an exception to the current zero remote capabilities. Product authentication and entitlement remain separate from developer CLI login. Never extract subscription credentials or label fake-runtime tests as actual model execution.

Rust/Tauri Mac and C#/WinUI 3 Windows with WebView2 load the hosted Laravel mailbox in a WebView with zero native IPC, host objects or web-message command forwarding. Bundle only the separate trusted assistant panel and host assets, not a PHP server or offline mailbox renderer. No remote script, URL, navigation or cross-window message may invoke the assistant. Keep its enrollment and OS-protected credentials separate from the mailbox's Laravel cookie session; never forward browser tokens or events into the bridge. Review system-browser/PKCE for native assistant/mobile user sessions and reject callback replay. Test separate logout/revocation, connection loss, forbidden remote native calls and shared draft state. If isolation cannot be proven, leave native release pending. Do not build duplicate Windows clients.

Build/test unsigned development artifacts on actual target OS runners: macOS DMG, C#/WinUI 3 Windows installer and WebView2 behavior. Produce separate downloads, preserve checksums/logs and record missing platform execution. Signing/notarization/release stays last; test updater rejection with development keys and no public channel. Java Android Views/APK and SwiftUI iOS follow as native Rails API clients with actual emulator/device lifecycle, auth and attachment-proxy tests. No PHP server or offline promise on mobile. Qt, Electron and Ionic remain alternatives, not simultaneous duplicate clients. Follow the [cross-platform test matrix](cross-platform-testing.md).

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

Provide separately documented platform-native build/test commands for Mac, Windows and later Android/iOS, an MCP enrollment/smoke-test command and fake-runtime in-app adapter checks. Do not label an unexecuted command successful. Never make ordinary bootstrap/stop delete volumes or overwrite unrelated local services. Any reset command must identify and require explicit selection of its disposable target.

## Required acceptance evidence

Run application checks in Docker; add actual browser validation and target-OS native checks from [cross-platform testing](cross-platform-testing.md). Store synthetic-only reports with commit, command, exit status, tool/OS versions and test counts. Keep authentication material and private local paths out of published artifacts.

| Check | Required result |
| --- | --- |
| Identity and isolation | Real login; foreign organization/mailbox IDs denied; viewer cannot send; reused pooled connection cannot inherit another user's claims |
| Laravel presentation boundary | Real per-user Laravel-to-Rails calls; encrypted isolated session store, no domain/Auth-table/provider access, CSRF, refresh-race protection, fail-closed outage and no cross-user cache |
| Revocation | An otherwise unexpired revoked session/grant and removed mailbox membership fail on the next protected call, including new downloads through old application links; unavailable authority fails closed |
| Concurrent drafts and sends | Stale draft update conflicts; same key/different payload conflicts; concurrent approvals with different keys produce one approved-version job |
| Worker contention | Two real PostgreSQL workers do not concurrently own one lease; a stale generation cannot overwrite the new owner |
| Ambiguous/crashed send | Provider accepts then response disappears; restart preserves one identity, recovers within the safe window and holds after expiry |
| Cancellation/suppression | Before dispatch boundary, no provider call; after that boundary, UI never promises recall |
| Inbound durability | Invalid signature rejected; DB failure is not acknowledged; replay/reordering causes one logical import and no regression of known facts |
| Mail and attachment safety | Scripts/tracking/native calls blocked; unauthorized and quarantined downloads denied; scanner failure remains closed |
| Browser completion | Two users complete the full persisted workflow, conflict recovery, permission failure and restart/reconnect at desktop and narrow widths |
| MCP | Actual stdio process accesses only permitted data and saves an unsent draft; retry is idempotent; invalid/revoked grants fail |
| In-app adapters | Separate real local bridges with fake inference enforce read/search/draft-only mailbox mode, cancellation, replay rejection and no shell/file authority; real model checks remain separate |
| Native | Per target: install/launch, remote WebView zero native powers, separate assistant enrollment/logout, protected storage, callback replay rejection and network recovery; mobile direct Rails contracts |
| Recovery | Separate DB/object restore retains the later external provider ledger; a pre-acceptance backup reconciles to the accepted send without resubmission; dispatch starts held and original development data is preserved |

Report pass, fail, blocked or not run for each item; attach concrete evidence and remaining remediation. Local application completion requires web/backend/database/worker/content/MCP-protocol/in-app fake-runtime/recovery checks. Native/mobile target gaps and unavailable actual AI-client checks remain explicit incomplete deliverables even when the web application passes. Pending named opinions remain a design gate; tests cannot be presented as a substitute for those consultations.

## 9. Final activation: external credentials and real-world proof

Only after local work and its evidence are complete, prepare a concise activation checklist describing each needed credential, its purpose, minimum permissions, secret-store destination and rotation owner. Do not request secret values in chat or commit them. Separate external credentials from development secrets already generated locally.

Resolve the actual nine addresses/aliases, one-or-two-domain routing, existing provider/MX ownership, migration plan, permitted message purposes, region, retention, operating owner and recovery tier before live changes. Verify any available Resend CLI provenance/version and use only safe read-only or local fixture operations in the current scope; no real sends. Final activation may configure Resend keys/webhook secret, production Supabase/storage, hosting/TLS/backups and platform signing. In-app inference needs its own supported authentication and entitlement; mailbox MCP alone does not require model API credentials.

Only after a later explicit activation instruction resolves the current no-live-send constraint, perform controlled send/reply tests with owned addresses, real signed callbacks, bounce/rejection handling and actual provider reconciliation. Instantly account linking/warmup is a separate blocked activation item: warmup sends real mail, and neither simulated tests nor CLI access authorizes it. Do not alter MX or connect guessed addresses. TLS/session checks, off-host restore, signed clean-machine installation/update, remote OAuth MCP, public deployment and external releases each need their own activation evidence and authorized scope.

The final report must distinguish **locally implemented and tested**, **provider-simulated**, **awaiting external activation**, and **unverified platform/client checks**. Never call simulated acceptance internet delivery, a local Supabase stack a production deployment, an unsigned build a signed release, or planned configuration a functioning integration.
