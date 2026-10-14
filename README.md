# Elevateo Mail

Shared company mailroom with one Rails domain authority and a React/TypeScript client.

## Current state

This source-only candidate integrates accepted Elara R10 `7c035de` draft recovery, Nadia R10 `c251b45` literal-read scenarios and Nadia R11 `bbf23cc8` strict optional-body repair over immutable **c8ffa46**. Exact source is accepted; compilation and browser execution remain untested on this candidate. New candidate runtime is **NOT_RUN**. Observer OFF; BE02 unaccepted, BE03 closed, server durability required; unsaved reload retention is memory-only, with F2 demonstration pending.

Actual c8 Soren R9 reports backend 390 tests/5,792 assertions (zero failures/errors/skips across 57 summaries), authenticated HTTP/worker drain and frontend 31 files/624 cases across all eight gates PASS. Acceptance compilation FAILED with TS2769 in read-revocation.e2e.ts:34 (optional body property); browser execution and screenshots remain zero. Final receipt `reports/soren-r9-immutable-receipt.json` SHA256 `54268cd037223da8e7f065d87fc6b0de5a5ffbb5090cd76593b40fe7b5c58e58` confirms these results; independent GUI cleanup passed with no errors and shared bases retained. No result validates the next candidate.

See [current provenance](docs/completion/int401-current-freeze-provenance.json), [handoff](docs/completion/int401-r10-acceptance-handoff.md), [history](docs/completion/int401-status-history-20261014.md) and [remaining milestones](docs/completion/int401-remaining-milestones.md). Root owns acceptance and the actual vault; Cassian mirrors it. Soren alone runs fleet Docker validation. No tests/builds or deployment performed here. Authority `task_71a9e1250412 / ctx_0f5d20301a25`.

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
