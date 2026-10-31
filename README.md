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

Production is one Docker Compose project (`ops/production/compose.yaml`) on the Hetzner host. Details:
[docs/architecture.md](docs/architecture.md) and [docs/backend-completion-design.md](docs/backend-completion-design.md).

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
| Backend | `python ops/tests/completion/local_backend.py --execute-final-gate --mox-image <id>` (full gate: tests, Steep, RuboCop, migrations). Image build steps are in [the backend receipt](docs/completion/backend-20261030-receipt.md) |
| Mail chain | `python ops/tests/completion/local_app_chain.py` and `ops/tests/completion/mox_protocol.py` (real SMTP/IMAP) |
| Restore drill | `python ops/tests/completion/local_restore.py` |
| Email finder | `powershell -File ops/tests/email-finder/check.ps1` |
| Android | `apps/android/build/build-apk.sh`, then `apps/android/build/emulator-acceptance.sh` (needs `/dev/kvm`) |

## Deployment

Deployment is one command once credentials exist: `sh ops/production/deploy.sh --dry-run`, then without the flag.
It reads the environment only and refuses to start while any required value is missing.
Fill values in the order of [docs/credentials-last.md](docs/credentials-last.md). Every variable is listed in
[.env.production.example](.env.production.example). Never commit a populated copy.

Before deploying, give the email-finder worker (`ELEVATEO_FINDER_PUBLIC_IP`) a different public IP from Mox.
Its port-25 checks can get an IP blocklisted.

## Current state (2026-11-01)

| Area | State |
| --- | --- |
| Backend module boundaries | Explicit capability/API/table contracts and Docker architecture regressions added on this branch. Safety exceptions and verification limits: [modular architecture](docs/modular-architecture.md), [receipt](docs/completion/modular-monolith-20261101/receipt.md) |
| Backend, contracts, Mox, MCP, native bridge | Implemented. Full local Docker gate passed on `feature/backend-completion`: 1,285 tests / 14,595 assertions, 412-assertion Mox protocol suite, real SMTP→IMAP application chain, encrypted restore, deploy dry run |
| Email finder | Implemented. Module gates passed (53 backend tests, 12 browser cases) |
| Web, macOS, Windows, Android, iOS clients | Implemented, and all 71 review defects fixed. **Not yet built or tested:** lint, typecheck, tests, packaging and visual QA run in one final Docker pass. `apps/native/src-tauri/Cargo.lock` must be regenerated first. Review packets P24–P34 have not run |
| Merged `main` | Not yet tested as a whole after the three merges of 2026-10-29/30 |
| Deployment | Not deployed. No live sends, DNS, MX or Cloudflare changes. Credentials are pending |
| Known limits | Mac `.dmg` signing/notarization and the iOS app build need a macOS host. The Android emulator run needs about 8 GB free RAM |

Open items and evidence: [state.md](state.md). Review records and defect density: [code-reviews.md](code-reviews.md).

## Working in this repository

Read [AGENTS.md](AGENTS.md) and [.planning/STANDARDS.md](.planning/STANDARDS.md) before changing code.
