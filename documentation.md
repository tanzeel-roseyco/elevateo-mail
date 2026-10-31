# Elevateo Mail: system documentation

This is an orientation to how the system works end to end. Detailed designs are linked from each section, and
[docs/README.md](docs/README.md) indexes every document. Earlier milestone notes are preserved in
[docs/history/logs/documentation-log.md](docs/history/logs/documentation-log.md).

For company setup and ongoing ownership, use the [engineering handoff](docs/handoff/README.md).
Jeison implements setup; Jeison and Tanzeel share maintenance; Callum decides updates and approves releases.
The [2026-11-01 audit](docs/completion/handoff-20261101/audit.md) distinguishes current procedures from historical
design snapshots. No deployment or new application test pass is claimed by this documentation change.

## 1. Authority and boundaries

Database invariants and evidence-backed normalization exceptions are recorded in
[database design](docs/database-design.md). The schema integrity catalog tests inspect the migrated PostgreSQL
catalog, including private schemas and later ALTER statements. Finder jobs store one work item per child row;
delivery suppression keys are canonical lowercase while approved address snapshots retain their original semantics.
Migrations 111?117 passed Docker up/down/up and the full backend gate; exact counts and retained exceptions are
recorded in the [schema verification receipt](docs/completion/schema-integrity-20261101/).
The web PWA caches only integrity-checked, build-versioned static interface assets. Its worker bypasses API,
authentication, attachments, query-bearing URLs and every write. It never stores mailbox responses or queues
approvals. Updates wait for all windows to close; no worker claims or reloads a running client. Sign-out clears
local Elevateo records and broadcasts a fence to other windows. Native desktop hosts retain their existing updater.
See [installation and offline behavior](docs/product/install-app.md) and [PWA verification](docs/completion/pwa-20261101/receipt.md).

The Rails application in `apps/server` and its PostgreSQL database are the only authority for users, mailbox access,
drafts, send approval and delivery state. Every other component is an adapter:

| Component | Role | Holds credentials for |
| --- | --- | --- |
| Rails API (`launch-api`) | HTTP API for every client; validates sessions and tenant membership on each request | Database (API role) |
| Workers (`launch-worker`, `email-finder-worker`) | Send ledger, IMAP sync, provider events, email-finder jobs | Database (worker role), mail transports |
| Attachment gateway | Private object storage for attachments, HMAC-bound to the API | Storage |
| Mailbox MCP (`apps/mailbox-mcp`) | Claude/Codex protocol adapter: search, read and draft only | None: it acts through API grants |
| Mox | Self-hosted SMTP/IMAP mail server | Its own TLS and mailbox data |
| Supabase (self-hosted) | Auth (GoTrue), REST and Storage over PostgreSQL | — |
| Authentik (external, existing) | Company OIDC identity provider | — |

Design detail: [docs/architecture.md](docs/architecture.md) and [docs/backend-completion-design.md](docs/backend-completion-design.md).

Backend ownership, explicit Ruby APIs, tables, routine contracts and safety exceptions are defined in
[the modular architecture](docs/modular-architecture.md). `apps/server/architecture.json` is enforced
by stdlib architecture tests in the standard backend gate. Connector snapshots share the caller's
guarded connection; draft validation and send authority retain their existing transactions.

## 2. Sign-in

Clients redirect to Authentik through the private Supabase Auth proxy, registered as `custom:authentik`.
Admission requires a verified company email, the configured Authentik group and an existing tenant membership.
Possessing an address never enrols a user. Every protected request rechecks the active identity and session.
Native clients use PKCE. The token exchange they call (`POST /v1/native/sessions`) is still an open contract request
with no server route yet; see [docs/contract-requests.md](docs/contract-requests.md). Google sign-in has been removed.

## 3. Reading mail

The IMAP worker polls each connected mailbox with bounded runtime and recovery after rejections
([docs/mailserver/imap-polling.md](docs/mailserver/imap-polling.md), [imap-rejection-recovery.md](docs/mailserver/imap-rejection-recovery.md)).
It parses MIME within size limits, preserving charset bytes ([mime-ingestion.md](docs/mailserver/mime-ingestion.md)),
and stores threads per organization. Clients read threads through the API. Message bodies are delivered and
rendered as plain text only.

## 4. Sending mail

1. A user writes a draft. Drafts carry an expected version and an operation ID, so retries and concurrent edits cannot overwrite each other.
2. Send review creates an **immutable approved snapshot** of sender, recipients, subject, text and attachments.
3. The worker **atomically reserves budget** before any external I/O: 30 per mailbox and 300 per user per UTC day
   (`ELEVATEO_MAILBOX_DAILY_SEND_LIMIT`, `ELEVATEO_USER_DAILY_SEND_LIMIT`). Suppressed and non-consented recipients are rejected.
4. The transport runs under a lease. Mox SMTP and Resend adapters exist, but production deployment currently accepts
   held/Resend mode and forces outbound hold. Mox application wiring/activation is a separate rollout blocker;
   `ELEVATEO_OUTBOUND_MODE` alone cannot enable it. An unknown outcome never triggers an automatic resend.
5. Resend events arrive at `/v2/provider-events/resend`. The Svix signature is verified before parsing. Events are
   idempotent and may arrive out of order. Bounces and complaints create permanent suppressions.

Detail: [docs/contracts-and-reliability.md](docs/contracts-and-reliability.md), [docs/mailserver/queued-transport.md](docs/mailserver/queued-transport.md),
[docs/mailserver/aggregate-send-budgets.md](docs/mailserver/aggregate-send-budgets.md).

## 5. Email finder

Person lookup, verification, company emails and decision makers run as durable PostgreSQL jobs with CSV import and export.
Discovery uses public websites and keyless search. Verification connects to recipient servers on port 25 and stops
before `DATA`, so no message is sent. A database advisory lock serialises probing; hard limits and reputation pauses are
persisted before each probe. Detail: [docs/email-finder.md](docs/email-finder.md).

## 6. AI connectors

A user grants Claude or Codex access to specific mailboxes, choosing search, read and/or draft scope. The server stores
only a SHA-256 digest of the bearer secret. Each call rechecks the grant and current membership. Revocation takes the
same lock, so any request that starts after a revocation fails. No send tool exists, and instructions inside an email
cannot widen a grant. The desktop assistant panel runs local CLIs through `apps/native/src-tauri/src/agents`: fixed
binaries, no shell interpolation, a disposable working directory each run, and file and shell tools disabled.
Detail: [docs/desktop-and-connectors.md](docs/desktop-and-connectors.md).

## 7. Clients

| Client | Path | Notes |
| --- | --- | --- |
| Web | `apps/web` | React + TypeScript. Backend access only through gateway ports in `src/data`; fixture and demo builds use clearly simulated adapters |
| macOS | `apps/native` | Tauri shell; Keychain session storage; signed auto-update with phased rollback; `.dmg` via `macos-release.sh` |
| Windows | `apps/windows` | .NET 8 + Avalonia; NSIS installer with environment-driven signing |
| Android | `apps/android` | APK build and emulator acceptance in Docker |
| iOS | `apps/ios` | SwiftUI app plus the Linux-testable `ElevateoCore` package |

## 8. Deployment and operations

- One Compose project: `ops/production/compose.yaml`. Entry point `sh ops/production/deploy.sh [--dry-run]`.
  It reads the environment only, uses immutable image digests and refuses to start while any required value is missing.
- Credentials, in order: [docs/credentials-last.md](docs/credentials-last.md). Variable list: [.env.production.example](.env.production.example).
- Backups cover PostgreSQL, private objects, Mox and configuration, taken behind a write barrier. The restore drill is
  `ops/tests/completion/local_restore.py`. Runbooks are in [docs/runbooks/](docs/runbooks/).
- Mailbox provisioning reads approved assignments and stays dry-run until `ELEVATEO_PROVISIONING_ENABLED=true`.

## 9. Testing

All tests run in Docker; commands are in the README "Testing" table. Verification receipts per milestone are in
[docs/completion/](docs/completion/). Review records and defect density are in [code-reviews.md](code-reviews.md).

## Client verification checkpoint — 2026-11-01

Windows: Docker Release build passes with 0 warnings/errors; 93 tests pass (0 failed/skipped),
7 installer regressions pass, and the unsigned win-x64 self-contained NSIS installer builds.
The installer is retained locally in apps/windows/artifacts (not committed). Actual Avalonia views
were rendered and inspected at 960/1280 px. Native Windows launch exposes the sign-in UI, but the
computer-use provider captured an overlapping window; those captures were discarded and native
screenshot verification remains limited. No live authentication was performed.
P24–P34 and dedicated design reviews ran in bounded packets; repairs and exact coverage are in
[review evidence](docs/completion/final-readiness-20261101/reviews.md). Web repairs await their Docker gate.
Cargo.lock regeneration, remaining client gates and web visual/backend browser coverage remain in progress.
Evidence: [Windows receipt](docs/completion/final-readiness-20261101/windows-receipt.md).

## Client web verification checkpoint — 2026-11-01

Docker Desktop final web gate passed: lint, typecheck, 1,195 tests / 99 files, production build and bundle budget. Five product defects repaired with regressions; browser visual verification remains pending. See docs/completion/final-readiness-20261101/web-receipt.md. Native/Android/iOS verification remains in progress; no deployment.


Android resource-limit repair — 2026-11-01: the APK entrypoint now preserves caller Cargo/Gradle limits with conservative defaults. Docker tests: 42 package + 26 build/helper tests pass, including three executable configuration regressions. APK/emulator results remain pending/not run respectively. See November 1 evidence.


iOS Core verification — 2026-11-01: Linux Swift build and 36 tests pass; three signing-helper tests pass separately in the Python-capable Docker image. Fixed the Linux FoundationNetworking import. The first combined wrapper exited 127 after Swift passed because Python was absent; the recorded recipe now runs Swift only. iOS app packaging remains macOS-only. See docs/completion/final-readiness-20261101/ios-receipt.md.


Native verification — 2026-11-01: Cargo.lock regenerated. Docker formatting, compile check, Clippy rules, 40 Rust tests, 14 macOS helper tests and one wrapper regression pass. Eight compiler dead-code warnings remain; strict -D warnings failed and is not claimed passing. macOS packaging/signing remains unavailable. See docs/completion/final-readiness-20261101/native-receipt.md.
