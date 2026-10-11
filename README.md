# Elevateo Mail

A planned shared company mailbox for approximately **10 people**, available on a web subdomain and as downloadable macOS and Windows clients.

## Current state

**FE-01-R1 data checkpoint passes types, 123 unit tests, API regeneration and build; lint and Fable UI repairs remain open.** See [stage A evidence](docs/evidence/fe-01-r1-data/README.md). No frontend or project acceptance is claimed.


**Design and source intake complete; the first backend checkpoint is preserved in incomplete draft PR #5.** Resend and self-hosted Supabase are selected by the user. This update replaces the earlier assumption that the primary product is a campaign engine across 18 existing mailboxes. The expanded brief specifies nine addresses across one or two domains; actual addresses, inbox/alias boundaries and migration requirements remain unresolved.

Local execution is underway from main `103baeb0` in an isolated checkout. Three independent exact-model PLAN consultations completed successfully; [runtime evidence and opinions](.planning/consultations/results/initial-plan/metadata.json) distinguish these from the earlier failed attempts. Astra MAX has accepted the initial local architecture; see [ADR 0002](docs/decisions/0002-local-architecture.md). Fresh BE-01 task opinions and Astra MAX synthesis are complete; Devin preserved a partial foundation checkpoint in draft PR #5 and is verified suspended. Official Devin MCP is authenticated and its read-only session verified this repository/base and working Docker. [Devin setup](docs/research/devin-cli/README.md) records the connection and its limitations. Fable retains frontend ownership; FE-01 has three completed exact-model opinions, accepted Astra MAX synthesis and a frozen canonical read contract; Fable has authored an unaccepted FE-01 draft; its compiler and test failures require repair.

The repository contains 2,764 pinned upstream files under `third_party/upstream`, six independent technical dossiers, per-file integrity manifests, preserved licenses, architecture, requirements, a database/backend tutorial, connector/desktop designs and a phased implementation plan. The upstream snapshots contain executable source but are not installed, run or integrated. There is no working Elevateo application, installer or deployment. The expanded 2026-10-12 [planning index](.planning/README.md) supplies the next agent's research, consultation and execution path; [the standards](.planning/STANDARDS.md) are its engineering baseline, with production decisions still open.

## Start the local build

Start with [the planning index](.planning/README.md), then give the implementation agent [LOCAL_BUILD_PROMPT.md](LOCAL_BUILD_PROMPT.md). It directs the agent to inspect and reuse the existing local frontend material, then complete [the end-to-end local plan](docs/local-completion-plan.md) with real local Supabase services and simulated mail transport. Required agent authentication precedes named consultations and Devin work; application provider, host, DNS, AI and signing credentials stay at final activation. The earlier authentication failures were resolved; the initial and BE-01 exact-model opinions have completed. [Ready-to-use consultation prompts and launch instructions](.planning/consultations/README.md) are saved for the next AI agent. This prompt is a handoff; writing it has not built the application.

## Recommended design

- **Resend** transports permitted outbound mail and delivers incoming-mail events. Elevateo owns the mailbox experience and durable history.
- **Self-hosted Supabase** supplies PostgreSQL, Auth and private attachment Storage. It is not an IMAP/SMTP mail server.
- **Accepted local direction (ADR 0002):** React/strict TypeScript and one Ruby on Rails domain application running as API and worker. Use PostgreSQL for the durable job ledger; no second queue authority is selected.
- **Accepted local direction:** Rust/Tauri Mac and C#/.NET Windows hosts; requested Java Android APK and SwiftUI iOS clients follow. Separate platform artifacts use one backend. PHP, Go and Python have bounded SDK, diagnostic and fixture roles; other requested languages have explicit conditional roles.
- **Accepted local direction:** an Elevateo MCP connector exposes authorized search/read/draft tools to Codex and Claude. Sending stays in the human-controlled application initially. Separate in-app Codex and Claude/Fable adapters use supported local runtimes, scoped tools and explicit authentication eligibility.
- **Proposed:** start on a VPS with Docker Compose, TLS reverse proxy and off-host backups. Railway remains an alternative if operational convenience outweighs infrastructure cost/control.

Use [ADR 0002](docs/decisions/0002-local-architecture.md) to interpret the expanded architecture, preserving suitable first-party work. Each bounded implementation task retains its own consultation and review gates. They are not already implemented dependencies or blanket production approvals. Hosting remains a later decision. Resend now also documents a private-beta Inboxes API; it is not a launch dependency. See [delivery and hosting](docs/mail-delivery-and-hosting.md).

## Source collection and goals

- [Codex-first market/reuse scan: 25 repositories and eight Reddit threads](.planning/research/reuse-market-scan.md) — comparative discovery, with new pins/deep audits pending
- [Devin, Astra MAX/LOW and independent Claude-agent workflow](.planning/AGENT_ORCHESTRATION.md)
- [Language, platform and in-app CLI connector plan](.planning/CLIENTS_AND_CLI_CONNECTORS.md)
- [Nine-address inventory, Resend CLI and disabled Instantly warmup](.planning/MAIL_ACCOUNTS_AND_ACTIVATION.md)

- [What the finished Elevateo Mail looks like](docs/end-goal.md)
- [All six source snapshots, exact revisions and integrity checks](third_party/README.md)
- [Six independent repository dossiers](docs/reference-repositories/README.md)
- [Best-component adoption matrix](docs/component-adoption.md)
- [Our goals and acceptance evidence](docs/goals-and-traceability.md)
- [Third-party licenses and notices](THIRD_PARTY_NOTICES.md)

The source collection preserves all 2,765 tracked paths in its manifests. One published sample TLS private-key file is deliberately omitted; all other 2,764 files retain exact upstream bytes. Reference inclusion does not approve runtime adoption.

## Read in this order

1. [Product requirements and decisions](documentation.md)
2. [System architecture](docs/architecture.md) and [ownership decision](docs/decisions/0001-mailbox-ownership.md)
3. [Backend and database tutorial, including CAP](docs/backend-database-tutorial.md)
4. [Mail delivery, DNS, Supabase and hosting tutorial](docs/mail-delivery-and-hosting.md)
5. [Mac/Windows and Claude/Codex connectors](docs/desktop-and-connectors.md)
6. [What we will reuse from the audited repositories](docs/repository-reuse.md)
7. [API contracts and failure recovery](docs/contracts-and-reliability.md)
8. [Implementation roadmap and release gates](docs/implementation-plan.md)
9. [Engineering baseline and scope](.planning/STANDARDS.md)
10. [Current state](state.md) and [review evidence](code-reviews.md)

## Setup and testing

There is no Elevateo application to install yet. Do not execute the archived upstream setup instructions as a way to launch this design. Clone this repository and start from LOCAL_BUILD_PROMPT.md. Code blocks and route names in the design remain examples until implemented. The local completion plan defines commands the next agent must create and prove, not scripts already available today.

Application lint, typecheck, unit/integration tests must run in Docker; browser validation and platform-specific packaging checks follow before release. Documentation checks for this update are recorded in `code-reviews.md`. No live email, domain change, infrastructure purchase or deployment occurred.

Verify source intake with `python3 scripts/verify_upstream.py`; run isolated provenance-tool tests with `python3 -B scripts/test_snapshot_tools.py -v`. These are repository tooling checks, not application acceptance tests.

### Devin credit authorization (2026-10-12)

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation was dispatched from frozen planning commit `5ae9771`. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.

BE-01 implementation is now assigned to [Devin](https://app.devin.ai/sessions/257567ddf6b743c8b9dad365f52e3f99), based on `5ae9771`; partial implementation is preserved in incomplete draft PR #5; independent verification remains pending and the session is suspended.

FE-01 read contract and exact-model synthesis are frozen in .planning/consultations/results/fe-01 and contracts/v1. Docker generation with openapi-typescript 7.13.0 reproduced identical API types; tooling audit reported zero vulnerabilities across 34 packages. This is tooling evidence, not application acceptance. Full frontend/backend integration remains open.


### FE-01 authored checkpoint (2026-10-12)

Fable 5 authored the read-only React client under apps/web. This is an **unaccepted draft checkpoint**, not a completed or deployable application. Session/mailbox/inbox/plaintext-reader code, fixture/HTTP adapters, tests and Docker/browser configurations are present. The core API contract is unchanged. Docker API type regeneration passed, but strict compilation failed on the fixture resolver return union and missing Node declarations; unit diagnostics have three failures; the isolated Vite bundler succeeds. Mandatory lint and actual visual QA have not passed.

Adversarial review covered all non-generated authored files (2,133 unique lines) plus a dedicated design review. Sixteen localized code/test defects, two documentation defects and one lint acceptance gap remain open; see code-reviews.md and docs/evidence/fe01-initial-review. Source/API design is not runtime integration: real Rails session/storage/mailbox behavior and all mutation flows remain pending. Fresh FE-01-R1 consultation and Astra synthesis must precede repair implementation. No mail, live deployment or purchase occurred.


### FE-01 Docker diagnostic results

API regeneration passed. Strict compilation failed on FE-R12 and FE-R15. Unit tests: 63 passed, 3 failed out of 66; all failures are retained DOM from previous SessionProvider tests (FE-R17, missing Testing Library cleanup with Vitest globals disabled and no setup hook). These failures prevent validation of the affected session assertions. The separate diagnostic Vite bundle succeeded (148 modules; JS 373.92 kB / gzip 115.76 kB), but does not constitute a passing production build because typechecking failed. Lint, browser/visual checks and real backend integration remain outstanding. See `docs/evidence/fe01-initial-review/unit-bundle.txt`.

All task test containers were automatically removed. The task-owned Node image (332 MB reported image size) was removed; Docker reports zero containers and zero build cache. Pre-existing Playwright/Python images and nine persistent volumes were preserved. Host free space was only 1.42 GB after cleanup; virtual-disk reclaim remains under investigation, so no host-space recovery is claimed.

Stage A source checkpoint: 3ab182fd7100628758165111ba3bf32054ae7045. This follow-up preserves the four sanitized Docker transcripts explicitly despite the global log ignore. No application bytes changed; the recorded tests still apply.
