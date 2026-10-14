# Elevateo Mail

Shared company mailroom with one Rails domain authority and a React/TypeScript client.

## Current state

Application IN PROGRESS — R23 documentation checkpoint (2026-10-14). BE02 OPEN/unaccepted; BE03 CLOSED until root accepts BE02. Application completion has priority; R&D remains separate. Invitation source is exact 51ca5d2eadd74b7ac4c1a2f5f82cd49323b15dc5; core/empty/revoked/logout evidence belongs to exact 86036e276df9c3294206e6bfa14d478c223c54dd. Observer remains OFF. Production, contracts, observer boundary and four Docker recipes are unchanged.

R19 core login/read/persisted-draft/search PASS stands with restoration, authenticated HTTP, worker drain and cleanup. Its sixteen screenshots do not establish complete visual acceptance: search was loading; settled-search evidence remains in R12. R12's 21 PNGs and R18 conflict/revocation PASS stand. R18 logout FAILED, cause UNKNOWN; F2 memory-only recovery limitation remains OPEN.

R21d build/TypeScript compile/privacy regression PASS. First empty visual partition failed setup with MODULE_NOT_FOUND ./quiet-reporter.ts: zero cases/zero PNGs; seven partitions not admitted. R21e CLI reporter override was insufficient because config resolves its reporter first: zero cases/zero PNGs, seven not admitted. Exact cleanup/independent absence PASS, lease FREE. R21f private active-config .ts-to-.js correction before tsc is pending review/runtime; no PASS is claimed. Source review does not establish runtime sufficiency.

Remaining: eight empty/revoked UI partitions and root manual visual acceptance; R22 invitation affected unit/lint/type checks, frozen genuine SCN-AUTH-006-P and separate supplemental keyboard/visual evidence on exact51ca; corrected logout on exact86036. Root owns acceptance and actual vault; Jules supervises Soren fleet runtime; Cassian OFF401 / INT-403 owns this documentation integration. No new research gate or repeat of passed unchanged suites is implied.

Project obsidian.md and the remote pending record are NOT synchronized to the actual vault. Actual Obsidian remains 134117 bytes, SHA256 de210bf0205ae28125d2c6125ff18fdbac87f947b6e2f92fff89b4b09e54b372, unchanged because C: is full. Automatic approval review rejected deleting a verified duplicate as “blocked by policy”, with no detailed reason; no deletion or retry. Requested LOW/Fast is not verified effective billing. See the R23 journal for receipt hashes, process history and BE03 readiness; R18 seal and failed histories remain linked.

Evidence: [R23 journal](docs/completion/int403-r23-application-state.md), [R18 seal](docs/completion/int401-r18-handoff.md), [history](docs/completion/int401-status-history-20261014.md).

## Start the local build

Start with [the planning index](.planning/README.md), then give the implementation agent [LOCAL_BUILD_PROMPT.md](LOCAL_BUILD_PROMPT.md). It directs the agent to inspect and reuse the existing local frontend material, then complete [the end-to-end local plan](docs/local-completion-plan.md) with real local Supabase services and simulated mail transport. Required agent authentication precedes named consultations and Devin work; application provider, host, DNS, AI and signing credentials stay at final activation. The earlier authentication failures were resolved; the initial and BE-01 exact-model opinions have completed. [Ready-to-use consultation prompts and launch instructions](.planning/consultations/README.md) are saved for the next AI agent. The prompt retains setup requirements; current implementation evidence is summarized above.

## Recommended design

- **Resend** transports permitted outbound mail and delivers incoming-mail events. Elevateo owns the mailbox experience and durable history.
- **Self-hosted Supabase** supplies PostgreSQL, Auth and private attachment Storage. It is not an IMAP/SMTP mail server.
- **Accepted local direction (ADR 0002):** React/strict TypeScript and one Ruby on Rails domain application running as API and worker. Use PostgreSQL for the durable job ledger; no second queue authority is selected.
- **Accepted local direction:** Rust/Tauri Mac and C#/.NET Windows hosts; requested Java Android APK and SwiftUI iOS clients follow. Separate platform artifacts use one backend. PHP, Go and Python have bounded SDK, diagnostic and fixture roles; other requested languages have explicit conditional roles.
- **Accepted local direction:** an Elevateo MCP connector exposes authorized search/read/draft tools to Codex and Claude. Sending stays in the human-controlled application initially. Separate in-app Codex and Claude/Fable adapters use supported local runtimes, scoped tools and explicit authentication eligibility.
- **Proposed:** start on a VPS with Docker Compose, TLS reverse proxy and off-host backups. Railway remains an alternative if operational convenience outweighs infrastructure cost/control.

Use [ADR 0002](docs/decisions/0002-local-architecture.md) to interpret the expanded architecture, preserving suitable first-party work. Each bounded implementation task retains its own consultation and review gates. They are not already implemented dependencies or blanket production approvals. Hosting remains a later decision. Resend now also documents a private-beta Inboxes API; it is not a launch dependency. See [delivery and hosting](docs/mail-delivery-and-hosting.md).

## Source collection and goals

- [Codex-first market/reuse scan: 25 repositories and eight Reddit threads](.planning/research/reuse-market-scan.md) â€” comparative discovery, with new pins/deep audits pending
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

Integrated application source is present. Use the maintained `scripts/dev` command surface and root `compose.yaml`; follow [the local completion plan](docs/local-completion-plan.md). Soren alone runs application builds and tests in fleet Docker during this wave. Do not execute archived upstream setup instructions. Source availability does not establish runtime acceptance.

Application lint, typecheck, unit/integration tests must run in Docker; browser validation and platform-specific packaging checks follow before release. Documentation checks for this update are recorded in `code-reviews.md`. No live email, domain change, infrastructure purchase or deployment occurred.

Verify source intake with `python3 scripts/verify_upstream.py`; run isolated provenance-tool tests with `python3 -B scripts/test_snapshot_tools.py -v`. These are repository tooling checks, not application acceptance tests.

## Rowan BE03-SQL R24 isolated implementation

Root explicitly authorizes isolated BE03 work over03ae770 while BE02 remains OPEN; integration/release remain gated. Rowan owns all migration00007 SQL and SQL database tests. S1/S2 source adds private role/bootstrap prerequisites, immutable reviewed snapshots, durable approval-key binding and atomic queued intent/job/audit/draft consumption, plus scoped review/queued status. No worker dispatch or cancellation SQL is implemented. Runtime and independent source review are pending; no PASS or completion claim. See [Rowan SQL evidence](docs/completion/be03-rowan-r24-sql.md).

Rowan pre-runtime source correction: removed duplicate bootstrap role candidate; consumed draft protects content while retaining BE02 reply-FK clearing. Runtime remains NOT_RUN.
