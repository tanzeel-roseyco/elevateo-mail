# Elevateo Mail

QA-404 R18 source-only followup: R17 9d904 remains HOLD after ADV838 found1 MED/211LOC (4.74/KLOC). Native stack extraction now rejects unsafe effective name/message descriptors, coercible values and custom prepareStackTrace hooks/accessors; zero-read regressions added. Original scenario oracles/security/body-vs-cleanup distinction preserved. Independent functional/design review and ADV839 verdict PENDING; all new runtime NOT_RUN, Soren sole lane. ObserverOFF; BE02unaccepted; BE03closed. See docs/completion/qa404-r18-diagnostic-guard.md.

Shared company mailroom with one Rails domain authority and a React/TypeScript client.

## Current state

R13 integrates accepted Nadia ADV815 expiry proof, Elara safe diagnostics and the bounded revocation-navigation fix after immutable **130cb5c**. The new opt-in expiry runner/strict typing integration is source accepted; all new-source runtime is NOT_RUN. Soren's existing snapshot is unchanged. Observer OFF; BE02 unaccepted; BE03 closed.

Sealed original R12 3bf records 12 cases: nine PASS and three FAIL (conflict, revocation and delayed logout), with 3,735 source files unchanged and cleanup/independent absence PASS. Receipt SHA256 b913e4700d88cd23b20f9fe25574391de462fdb3cd80963f51778ea3b5377b8e preserves that failed result. Four core flows passed and 16 screenshots were captured. Mira viewed all 16 images: search shows loading only and one LOW glyph-visibility finding remains. This is bounded visual evidence, not whole-application acceptance. R9 c8 backend390/5792 and frontend624/all eight gates PASS retain their original provenance; later failures remain in linked history.

F2 durable recovery remains OPEN: newer memory-only buffer/operation is lost on accepted reload while the committed server version survives. No durable local recovery, warning or ledger proof is inferred.

See [R13 handoff](docs/completion/int401-r13-expiry-handoff.md), [history](docs/completion/int401-status-history-20261014.md) and [milestones](docs/completion/int401-remaining-milestones.md). Root owns acceptance and the actual vault; Cassian mirrors it; Soren alone schedules fleet Docker. Authority `task_9832f910c826 / ctx_7030db288587`.

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


## Elara OFF404 R17 diagnostic-unit repair (source-only)
Based exact bc8a1a5a6d61a80e756f6078cd8d5fbec5957c6c in fresh owned elara-r17. R13 diagnostic unit observed 9 tests: 6 PASS, 3 AssertionError FAIL at source declarations21:1/35:1/76:1 (compiled19:1/33:1/72:1). These are unit failures, not GUI case evidence. Original private log inspected without exporting raw values/messages/stacks.
Source diagnosis: captureDiagnostic reads stack descriptor.value only; Node24 native accessor therefore loses coordinates. Framework-string reporter regression passed. Preserve synthetic fixture/original oracles; support only the exact intrinsic Error stack getter, reject arbitrary getters. Added native/data-stack/custom-getter regression; production path/message/coordinate bounds, strict allowlist and cleanup/body distinction unchanged.
All R17 runtime/lint/typecheck/build/Docker/browser NOT_RUN; Soren sole scheduler, frozen jobs unchanged. Independent functional and dedicated design review PENDING via root; no zero-defect or density claim. Observer OFF; BE02 unaccepted; BE03 CLOSED. R14/R15/R16 untouched; root sole vault writer. Requested Sol6.1 LOW/Fast/YOLO; effective identity/tier not independently audited.
