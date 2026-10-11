# Elevateo Mail

A planned shared company mailbox for approximately **10 people**, available on a web subdomain and as downloadable macOS and Windows clients.

## Current state

**Design package and six-repository source intake complete; Elevateo application implementation has not started.** Resend and self-hosted Supabase are selected by the user. This update replaces the earlier assumption that the primary product is a campaign engine across 18 existing mailboxes. The expanded brief specifies nine addresses across one or two domains; actual addresses, inbox/alias boundaries and migration requirements remain unresolved.

Local execution is underway from main `103baeb0` in an isolated checkout. Three independent exact-model PLAN consultations completed successfully; [runtime evidence and opinions](.planning/consultations/results/initial-plan/metadata.json) distinguish these from the earlier failed attempts. Astra MAX has accepted the initial local architecture; see [ADR 0002](docs/decisions/0002-local-architecture.md). Fresh BE-01 task opinions are complete and their synthesis is underway. Official Devin MCP is authenticated and its read-only session verified this repository/base and working Docker. [Devin setup](docs/research/devin-cli/README.md) records the connection and its limitations. Fable retains frontend ownership; these assessments have not implemented the application.

The repository contains 2,764 pinned upstream files under `third_party/upstream`, six independent technical dossiers, per-file integrity manifests, preserved licenses, architecture, requirements, a database/backend tutorial, connector/desktop designs and a phased implementation plan. The upstream snapshots contain executable source but are not installed, run or integrated. There is no working Elevateo application, installer or deployment. The expanded 2026-10-12 [planning index](.planning/README.md) supplies the next agent's research, consultation and execution path; [the standards](.planning/STANDARDS.md) are its engineering baseline, with production decisions still open.

**BE-01 checkpoint A is partial, and BE-01 is incomplete.** Draft branch `devin/backend/be-01` (base `5ae9771`) adds a pinned five-service local Supabase Compose profile (Postgres, Auth, PostgREST, Storage, Mailpit), a minimal Rails 8.1.4 API and an idle worker that share one image, generated ignored local credentials, separate migrator/API/worker database logins, and the first `app` schema migration with FORCE RLS. It also adds an internal-only runtime network, a config-enforced outbound hold and `scripts/dev` lifecycle wrappers. Partial Docker checks are in [docs/evidence/be-01.md](docs/evidence/be-01.md): startup/readiness, config rejection, egress denial and role restrictions. Still missing: fixtures through the Auth admin API, the Storage adapter, the A03/A06-A10/A12 isolation tests, Steep/lint/tests and the Windows run. No mail was sent and nothing was deployed. Task Docker cleanup is done: the persistent volumes and ignored credentials are kept, the images were removed and will be pulled again by digest on the next run, and 118.5 MB of build cache that ID-filtered prune cannot remove is still on the host.

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

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation dispatch is being frozen to the planning commit. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.
