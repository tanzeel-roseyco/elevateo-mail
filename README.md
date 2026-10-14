# Elevateo Mail

Shared company mailroom with one Rails domain authority and a React/TypeScript client.

## Current state

Mira OFF-405 / issue #14 / R17 source-only repair over exact `5c5cc39748668f0252bc6420cef46b32f6ef4efc`: draft-conflict `load()` now visits `about:blank` before the existing authenticated GET/navigation barrier, forcing a fresh document while retaining browser-context auth cookies. Total source remains 145 lines; cleanup `finally` remains line 140. Tessa's confirmed navigation finding is 1 MED / 240 unique LOC = 4.17 defects/KLOC; independent closure/design review and Soren fleet runtime remain pending. Original R12 1093ms failure cause remains UNKNOWN; the derived 120s GET timeout fits the confirmed defect but does not establish that original cause. Reported R14 actual evidence remains Python 25 PASS, frontend 629 PASS, diagnostics 8 PASS / 4 FAIL, GUI NOT_RUN; these historical results do not verify R17. Observer OFF; BE02 unaccepted; BE03 closed. Root owns acceptance and actual vault writes; no vault edit here. See [R17 handoff](reports/mira-r17-handoff.md).

Application IN PROGRESS: this source-only candidate follows immutable bc8a1a5 and selectively integrates Mira R16 empty-mailbox guidance with exact reviewed production/regression blobs. Role-query typing and Python fixture-completeness repairs are source accepted by ADV836/837. Elara R18 guarded native-error diagnostics are source accepted by ADV838/839. New candidate runtime NOT_RUN; Soren's frozen R13 snapshot remains unchanged. Observer OFF; BE02 unaccepted; BE03 closed.

Actual frozen R13 failed frontend strict build at two unsupported `exact` role-query options before any GUI execution. Its Python runner regression also failed with three AttributeErrors because the synthetic fixture omitted `adv815_expiry`. Migration completed; the separate wrapper-finalizer scope error remains recorded. Root reports independent Soren backend proofs PASS as a checkpoint; safe-diagnostic units have three assertion failures across nine tests, repaired in accepted R18 source but not rerun. Final immutable receipt/counts remain pending; no new candidate GUI or runtime success is inferred.

Sealed R12 3bf retains nine PASS / three FAIL across 12 cases and 16 screenshots; R9 c8 backend390/5792 and frontend624/all eight gates PASS retain their original provenance. See linked history for immutable receipts. F2 durable recovery remains OPEN: accepted reload loses newer memory-only buffer/operation while the server-committed version survives.

See [R16 handoff](docs/completion/int401-r16-handoff.md), [history](docs/completion/int401-status-history-20261014.md) and [milestones](docs/completion/int401-remaining-milestones.md). Root owns acceptance and actual vault writes; Cassian mirrors it; Soren alone schedules Docker. Authority `task_407c8daf5948 / ctx_34cc108a605b`.

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
