# Elevateo Mail

Shared company mailroom with one Rails domain authority and a React/TypeScript client.

## Current state

Mira OFF405 R11 ADV798: source-only SCN-DRAFT-008-F2 authored on exact c8ffa46 in an isolated branch. Real committed/lost-ACK receipt barrier distinguishes original operation, newer unsaved buffer and server snapshot. Memory-only reload gap remains OPEN; server saved reopening is not uncertain-buffer recovery. Runtime and independent review NOT_RUN; prior Soren R9 evidence is separate. See [R11 handoff](docs/completion/fe405-r11-uncertain-reload.md). No production changes.

The current repair freeze integrates exact Rowan R7 `6c9a4ac`, Mira R9 `e88273b` and Mira R10 `3919d2a` over application `94d32db` and documentation parent `e37603f`. Source reviews are accepted; this repair candidate runtime is **NOT_RUN**. Soren alone owns fleet Docker validation. Observer remains OFF; BE02 is unaccepted, BE03 closed and F2 durable recovery OPEN (memory-only retention and unload prompts are not durable recovery).

Actual Soren R8 on immutable **94d32db**: ReadController 15/362, Auth request 3/62, Auth client 8/44, full backend 386 tests/5,734 assertions, native 5/26, Steep, RuboCop 152 files and Python 3+3 passed. Real authenticated HTTP 1/33 passed. **Worker drain failed after 31.08s**; intent state was NOT_CAPTURED before cleanup, and sanitized 204 then 403/session_not_found logs do not prove exact intent ordering. All eight frontend gates ran: unit 623 cases, 621 passed and two failed; the other seven gates passed. **GUI NOT_RUN, zero screenshots**. Backend/frontend cleanup and independent absence checks passed; shared pins and persistent services were retained. Receipt `reports/soren-r8-immutable-receipt.json`, SHA-256 `c9fb1a4e22fe6eba31ba4341bb9911ecc27e5f962809fa1a9451abc678fbef8a`.

Exact source provenance is in [current provenance](docs/completion/int401-current-freeze-provenance.json); historical evidence remains in [history](docs/completion/int401-status-history-20261014.md). [Remaining milestones](docs/completion/int401-remaining-milestones.md) require exact repair tests, worker drain and actual GUI evidence. Root owns acceptance and the actual vault; Cassian mirrors it. No local application execution, live sending or public deployment occurred. Authority: `task_5886a83067b8 / ctx_0a526cc2d333`.

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
