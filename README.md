<p align="center">
  <img src="assets/brand/elevateo-logo.png" alt="Elevateo" width="140">
</p>

<h1 align="center">Elevateo Mail</h1>

<p align="center">Self-hosted, multi-mailbox mail and outreach platform for the Elevateo team.<br>
Web, macOS, Windows, Android and iOS clients over one Rails backend, with a self-hosted Mox mail server.</p>

---

This is the single repository for all Elevateo Mail work. Every earlier repository, worktree, branch,
bundle and uncommitted change was consolidated here on 2026-10-30. `main` holds the current product;
the full history is in `archive/` branches (see [docs/history](docs/history/README.md)).

## What it does

- **Unified inbox** across a team's company mailboxes: threads, folders, snooze, stars, reply all and forward.
  Message content is always rendered as plain text, never as HTML.
- **Human-approved sending.** Every send is reviewed and approved. Outbound mail goes through the self-hosted
  Mox server or, optionally, Resend. The ledger enforces at most 30 sends per mailbox and 300 per user per day.
  Outbound starts in `held` mode.
- **Outreach:** campaigns, short sequences, contacts with explicit consent, and permanent suppression of
  bounces and complaints.
- **Email finder:** person lookup, verification, company emails and decision makers, with resumable CSV jobs
  and hard safety limits.
- **AI connectors:** a mailbox MCP server lets Claude and Codex search, read and draft (never send) within
  per-user, per-mailbox grants. A desktop assistant panel drives local Codex and Claude CLIs through a bounded bridge.
- **Sign-in** through the existing Authentik SSO service. Google Cloud is not used.

## Architecture

```
 Web (React) ─┐                                   ┌─ Mox mail server (SMTP / IMAP, self-hosted)
 macOS (Tauri)├─ HTTPS ─ edge ─ Rails API ─┬─ PostgreSQL (self-hosted Supabase: auth, storage, data)
 Windows(.NET)│      Authentik SSO         ├─ Workers: send ledger, IMAP sync, email finder, provider events
 Android/iOS ─┘                            ├─ Attachment gateway (private object storage)
                                           └─ Mailbox MCP server ◄── Claude / Codex (search · read · draft)
```

The production assembly is one Docker Compose project (`ops/production/compose.yaml`); the company deployment
host and public edge still need approval. Start with the [engineering handoff](docs/handoff/README.md)
and [backend design](docs/backend-completion-design.md). Earlier architecture documents are historical.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/server` | Rails API, workers and attachment gateway (Ruby, Steep-typed, PostgreSQL migrations) |
| `apps/web` | React + TypeScript web client (Vite, Vitest, Playwright) |
| `apps/native` | macOS desktop shell (Rust/Tauri): login, updater, assistant panel, `.dmg` release script |
| `apps/windows` | Windows client (.NET 8 + Avalonia) and NSIS installer |
| `apps/android` | Android client and APK/emulator build in Docker |
| `apps/ios` | SwiftUI client and Linux-testable `ElevateoCore` package |
| `apps/mailbox-mcp` | MCP server for Claude/Codex mailbox access (TypeScript) |
| `apps/shared` | Cross-client auth conformance vectors |
| `contracts/` | OpenAPI v1/v2: the API source of truth shared by server and clients |
| `ops/production` | Production Compose, `deploy.sh`, initializer, Authentik and Mox configuration |
| `ops/selfhosted-mail`, `ops/mailserver`, `ops/mail` | Self-hosted Mox provisioning and mail-server tooling |
| `ops/tests` | Docker-only test runners and acceptance harnesses |
| `ops/supabase`, `ops/db` | Local and production database stack |
| `docs/` | All documentation; start at [docs/README.md](docs/README.md) |
| `assets/brand` | Elevateo logo, wordmark and repository preview image |
| `third_party/` | Imported reference source with preserved notices (not linked into the runtime) |

## Getting started

Requirements: Docker Desktop and Git. Toolchains are pinned inside the images: Node 24 (`apps/web/docker/test.Dockerfile`)
and Ruby 3.4 (`apps/server/Dockerfile`).

```sh
# Web client against simulated data (no backend needed)
cd apps/web && npm ci && npm run dev:fixtures

# Local backend stack (database, auth, storage, Mailpit, API, worker)
scripts/dev bootstrap
scripts/dev up
```

## Testing

All tests run in Docker, never on the host.

| Area | Command |
| --- | --- |
| Web | `docker build -f apps/web/docker/test.Dockerfile -t elevateo-web-check . && docker run --rm elevateo-web-check` from the repository root (contract check, lint, typecheck, unit with coverage, build, bundle budget) |
| Web browser | `cd apps/web && npm run test:e2e` inside the Playwright container (see `apps/web/playwright.config.ts`) |
| Backend | Follow [verified command definitions](docs/handoff/verification.md#backend-database-protocol-and-recovery), including both server and Mox image arguments |
| Mail chain | Included in `local_backend.py`; `local_app_chain.py` is an imported helper. Standalone protocol command is in the handoff |
| Restore drill | `local_restore.py` requires explicit gate, images and revision; full command is in the handoff |
| Email finder | Use the backend/web/browser gates in the handoff. `ops/tests/email-finder/check.ps1` has a stale `deploy.sh config --quiet` call and needs repair before reuse |
| Android | `apps/android/build/build-apk.sh`, then `apps/android/build/emulator-acceptance.sh` (needs `/dev/kvm`) |

## Deployment

Held bootstrap starts with `sh ops/production/deploy.sh --dry-run`, then without the flag only after Callum's approval.
It reads the environment only and refuses to start while any required value is missing. It does not supply public
web hosting, production Mox activation or a safe post-activation update procedure. Follow the [ordered setup](docs/handoff/production.md).
Fill values in the order of [docs/credentials-last.md](docs/credentials-last.md). Every variable is listed in
[.env.production.example](.env.production.example). Never commit a populated copy.

Before enabling probes, give the finder a different public IP from Mox and verify actual routing/SNAT.
`ELEVATEO_FINDER_PUBLIC_IP` does not configure that routing. Its port-25 checks can get an IP blocklisted.

## Current state (2026-11-01)

Schema integrity work on this branch covers the complete server DDL and query surface. New reversible migrations
add relationship indexes and constraints, unify delivery suppression lookup, normalize finder work items, and
bound materialized attachments. Docker up/down/up and the full backend gate passed: 1,399 standard tests /
15,907 assertions, dedicated database/mail/API/contracts checks, Steep and RuboCop. See [database design](docs/database-design.md)
and [schema evidence](docs/completion/schema-integrity-20261101/).
The [Jeison handoff](docs/handoff/README.md) and [documentation audit](docs/completion/handoff-20261101/audit.md)
record setup procedures, approval gates and unresolved rollout blockers. Tanzeel built most of the product;
Jeison implements company setup, Jeison and Tanzeel maintain it, and Callum decides updates and approves releases.
This documentation change did not rerun application suites or activate infrastructure. Uncommitted Windows work
on `feature/final-readiness` and schema-integrity/modular-boundary branches still need release reconciliation.

| Area | State |
| --- | --- |
| Backend module boundaries | Explicit capability/API/table contracts and Docker architecture regressions added on this branch. Safety exceptions and verification limits: [modular architecture](docs/modular-architecture.md), [receipt](docs/completion/modular-monolith-20261101/receipt.md) |
| Backend, contracts, Mox, MCP, native bridge | Implemented. Full local Docker gate passed on `feature/backend-completion`: 1,285 tests / 14,595 assertions, 412-assertion Mox protocol suite, real SMTP→IMAP application chain, encrypted restore, deploy dry run |
| Email finder | Implemented. Module gates passed (53 backend tests, 12 browser cases) |
| Clients | Windows Docker build: 0 warnings/errors, 93 tests and 7 installer regressions pass; unsigned installer built, Avalonia views inspected at 960/1280 px. P24–P34 and design reviews completed with repairs. Web lint/types, 1,195 unit tests, production build and bundle budget pass. Android helper tests: 68 pass; build resource limits repaired. iOS Core: Swift build and 36 tests pass, plus 3 signing-helper tests. Native Linux: fmt/check/Clippy rules, 40 Rust and 14 helper tests pass; 8 compiler warnings remain. Browser QA and Android APK are in progress. [Evidence](docs/completion/final-readiness-20261101/windows-receipt.md) |
| Merged `main` | On `feature/final-readiness`: web gate passes (1,190 unit tests); fixture Playwright across four projects: 176 passed, 0 failed, 344 production-URL skips. Production browser coverage, visual QA, packaging and merged backend gates remain unverified |
| Deployment | Not deployed. No live sends, DNS, MX or Cloudflare changes. Credentials are pending |
| Known limits | Mac `.dmg` signing/notarization and the iOS app build need a macOS host. The Android emulator run needs about 8 GB free RAM |

Open items and evidence: [state.md](state.md). Review records and defect density: [code-reviews.md](code-reviews.md).

## Working in this repository

Read [AGENTS.md](AGENTS.md) and [.planning/STANDARDS.md](.planning/STANDARDS.md) before changing code.
