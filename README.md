# Elevateo Mail

Shared company mailroom with one Rails domain authority and a React/TypeScript client.

## Current state

Application IN PROGRESS — R24 isolated BE03 candidate (2026-10-14). Root authorizes implementation on baseline `03ae770c56271cd8236726bfd8fe63248e81283d` in parallel with BE02 acceptance. BE02 remains OPEN/unaccepted; integration/release gated. S1+S2 priority: saved draft -> consistent review -> human approval -> durable queued intent. Canonical additive `contracts/v1/openapi.json` version `1.0.0-send.1` is prepared; every baseline C/D operation/component and original fixture is preserved.

Contract source `013fe663563165a986f866ca9119b8b49c4332bf` passed fleet pinned-bundle Docker regressions (8 runs/78 assertions/zero failures/errors/skips, exit0) and affected lint (1 file/zero offenses, exit0). Four independent review findings and one lint-derived warning were repaired and re-reviewed; dedicated design review found no additional defects. Initial setup failures and lint history remain recorded. All task containers independently absent; shared images/persistent resources/Lyra18140 preserved. Reviewed SQL persistence source is assembled in the isolated candidate; real SQL runtime, API/UI intake, generation and S3-S5 lifecycle remain pending. Root R21f closure and six-worker deployment registry are integrated as documentation-only lineage; actual vault remains untouched. No BE03 completion, live activation or vault synchronization claim. Requested Fast billing remains unverified. See [R24 record](docs/completion/be03-r24-contract-integration.md) and [Docker receipt](docs/completion/be03-r24-contract-docker.json).

R24 Elara worker branch: root explicitly authorizes isolated BE03 implementation in parallel with BE02 acceptance; BE02 remains OPEN and integration/release gated. Offline control/driver seams are source-reviewed; standalone fleet Docker units passed14runs/125assertions on exactfc912d7 with bundled Minitest5.25.4. Final exact3d7b61f pinned bundle units14/125, strict Steep and affected lint6files passed in fleet Docker; initial tuple-inference failure and repaired review defects remain recorded. Real SQL integration remains NOT_RUN; no integrated runtime acceptance. See [worker record](docs/completion/be03-elara-r24-worker.md). This branch note supersedes the historical BE03-closed sequencing below.

## Historical R23 checkpoint — sequencing superseded only for isolated R24

Application IN PROGRESS — R23 documentation checkpoint (2026-10-14). BE02 OPEN/unaccepted; BE03 CLOSED until root accepts BE02. Application completion has priority; R&D remains separate. Invitation source is exact 51ca5d2eadd74b7ac4c1a2f5f82cd49323b15dc5; core/empty/revoked/logout evidence belongs to exact 86036e276df9c3294206e6bfa14d478c223c54dd. Observer remains OFF. Production, contracts, observer boundary and four Docker recipes are unchanged.

R19 core login/read/persisted-draft/search PASS stands with restoration, authenticated HTTP, worker drain and cleanup. Its sixteen screenshots do not establish complete visual acceptance: search was loading; settled-search evidence remains in R12. R12's 21 PNGs and R18 conflict/revocation PASS stand. R18 logout FAILED, cause UNKNOWN; F2 memory-only recovery limitation remains OPEN.

R21d build/TypeScript compile/privacy regression PASS. First empty visual partition failed setup with MODULE_NOT_FOUND ./quiet-reporter.ts: zero cases/zero PNGs; seven partitions not admitted. R21e CLI reporter override was insufficient because config resolves its reporter first: zero cases/zero PNGs, seven not admitted. Exact cleanup/independent absence PASS, lease FREE. R21f fresh runtime completed all eight F1/F2 partitions: four desktop PASS with six retained private PNGs; four mobile FAIL with zero PNGs, all attempt zero. Build, privacy regression, compile and runtime dependencies PASS. Launcher exit 101; original queue ledger stops at seven entries, but the eighth lifecycle has its own final receipt. All eight cleanup receipts and exact independent resource absence now PASS; task compile image removed and lease FREE. See [reconciled closure](docs/completion/jules-r21f-closure.md).

Remaining: diagnosis/fix of four mobile empty/revoked failures and root manual visual acceptance; R22 invitation affected unit/lint/type checks, frozen genuine SCN-AUTH-006-P and separate supplemental keyboard/visual evidence on exact51ca; corrected logout on exact86036. Root owns acceptance and actual vault; Jules supervises Soren fleet runtime; Cassian OFF401 / INT-403 owns this documentation integration. No new research gate or repeat of passed unchanged suites is implied.

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

## R24 production delivery deployment

Root explicitly authorized isolated BE03 implementation alongside BE02 acceptance. BE02 remains OPEN; integration and release remain gated. First useful BE03 delivery is S1/S2 review, approval and durable queued intent. Later worker phases are separate follow-on scope. New routes fail closed until SQL/auth bridges are accepted. Canonical contract path is contracts/v1/openapi.json. No live activation, paid paths or ultrareviews. Deadline 12:17 UTC.

Six native Orca SSH terminals run bounded 90-minute Codex CLI0160 sessions on fresh fleet branches based03ae770. Requested model gpt-6.1-sol, low effort, fast service tier and fast mode; EffectiveFast is unverified. Root terminal and Lyra preview remain untouched. Launchers and native thread events verified live; no completion claim.

| Worker | Ticket | Terminal | Fleet PID | Branch |
|---|---|---|---|---|
| Cassian | BE03-CONTRACT | term_ec69b3d1-9199-4898-a1f1-fd95167fc5b9 | 2809271 | delivery/cassian-r24 |
| Rowan | BE03-SQL | term_0c9cd67d-81d6-440f-8ff3-35291e6b105b | 2809391 | delivery/rowan-r24 |
| Nadia | BE03-API | term_c3ddf20f-c50f-47b5-8d5e-908dabeedd8a | 2809400 | delivery/nadia-r24 |
| Mira | BE03-UI | term_827eb0de-a486-4a1a-a76d-4c0ffa141317 | 2809402 | delivery/mira-r24 |
| Elara | BE03-WORKER | term_282bc624-1b00-477c-a4ab-de25f0d76e09 | 2809401 | delivery/elara-r24 |
| Soren | BE02-ACCEPT | term_cf5c85d8-38c5-4611-945d-7b0be8c7af4e | 2809403 | delivery/soren-r24 |

Fleet checkout paths and thread IDs: reports/delivery-r24-registry.json. Ownership and safe coordination: incoming/be03-r24-coordination/. Soren owns R22 invitation/corrected logout; four R21f mobile FAIL remain unresolved pending Tessa diagnosis. Docker builds/tests require the shared heavy lease and exact task-owned cleanup.

## Rowan BE03-SQL R24 isolated implementation

Root explicitly authorizes isolated BE03 work over03ae770 while BE02 remains OPEN; integration/release remain gated. Rowan owns all migration00007 SQL and SQL database tests. S1/S2 source adds private role/bootstrap prerequisites, immutable reviewed snapshots, durable approval-key binding and atomic queued intent/job/audit/draft consumption, plus scoped review/queued status. No worker dispatch or cancellation SQL is implemented. Runtime and independent source review are pending; no PASS or completion claim. See [Rowan SQL evidence](docs/completion/be03-rowan-r24-sql.md).

Rowan pre-runtime source correction: removed duplicate bootstrap role candidate; consumed draft protects content while retaining BE02 reply-FK clearing. Runtime remains NOT_RUN.

Rowan SQL timestamp projection now uses frozen C/D UTC microsecond Z spelling; added exact projection assertions. Runtime still pending.

Independent Rowan review found two MEDIUM issues (post-wait replay expiry and incomplete fresh distinct-key race coverage); fixes/regressions are prepared, awaiting re-review and Docker.

Rowan repair re-review found zero remaining actionable issues in scope. Added exact mutation-fault, save/approval ordering and empty-down regressions; legacy destructive schema probe first downgrades the empty send schema within rollback-only fixture. Docker syntax/lint on ae90c13 PASS; database runtime still NOT_RUN.

Rowan canonical SQL header controls are explicitly C-locale C0/DEL, preserving allowed C1 Unicode scalars; exact byte/control-escape and maximum-version regressions added. SQL runtime pending.

Rowan final SQL source ebf64cd: all bounded functional/design reviews complete, zero remaining actionable source findings; fleet Docker syntax7/lint7 PASS exit0 and exact taskcontainer absence PASS. Real SQL/API vertical-slice tests remain NOT_RUN pending Soren lease on one integrated immutable source.

## Historical R23 checkpoint — sequencing superseded only for isolated R24
