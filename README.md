# Elevateo Mail

BE-403 runtime failure repairs (2026-10-14): IN PROGRESS. Source fixes target observed 42f6369 errors: Minitest fixture message collision/block binding/frozen strings/nil assertion, draft keyword and rotating-CSRF fixtures, obsolete JSON 3 create_additions option, invalid RBS protected declarations, and worker function namespace USAGE. Auth/session boundaries remain unchanged. Current changes are NOT runtime verified; pool/deadline/input/controller failures remain open.

BE-403 semantic guard reconciliation (2026-10-14): IN PROGRESS. Approved design hash b08976256765ce546325418a403a23b958933cbbf97ec42a228c5412198d0acb verified. Bootstrap preserves ACL representation and unrelated objects; shared up/down prerequisite checks migration identity, independent ownership, separate owner CREATE/USAGE, foreign ACL and effective runtime denial. Source authored; current changes await independent review and Soren container verification. Earlier 42f6369 migration/guard passes do not validate this revision; its full suites failed (15 failures/55 errors).

A planned shared company mailbox for approximately **10 people**, available on a web subdomain and as downloadable macOS and Windows clients.

## Current state

BE-403 (2026-10-14): IN PROGRESS. Approved semantic schema guards are source-reviewed and Soren verified real Rails rollback/reapply, atomic rejection, default-privilege leakage and nonempty sentinel preservation on 786f2f9. Full 28390d7 run:375 runs/5487 assertions,2 native-observation failures,0 errors; later HTTP stages NOT_RUN. Rowan is repairing structured native observation, strict type warnings and lint; current edits are unverified. No public/live mail. See docs/completion/be403-bootstrap.md and reports/rowan-progress.md.


INT-401 bounded repair (2026-10-14): restored canonical BE02 compose.yaml, 37 nested BE01 tooling files, three evidence-script dependencies and eight Backend Performance docs. 629 overlay hashes match; 63 static dependency checks leave one inherited frozen-manifest hash conflict, plus scripts/dev seed/check name absent Compose services. Linus ADV-729 reviewed 172 source lines, confirmed two integration defects (11.63/KLOC); repairs are statically observed, independent re-review and all runtime/visual checks remain pending. Application IN PROGRESS; root owns testing and GitHub issues. See docs/completion/int401-repair.md.

INT-401 handoff: source preservation/integration complete, application IN PROGRESS. Verified 45,507 archived source entries and 580 canonical overlay files with zero hash mismatches; original executable modes restored. Remote tests and independent review remain pending. See docs/completion/int401-handoff.md. An ignored partial runtime export copy remains after automatic cleanup approval rejection; no original data removed.


2026-10-14 INT-401: IN PROGRESS. Canonical frontend/backend/acceptance/performance sources are integrated from Local Completion d2de43b in integrate/cassian-unified. This baseline is UNTESTED; historical results below do not validate it. Archive capture completed: 19 Git checkouts, 18 preserved HEAD refs, 12 source exports, 45,507 source-file entries; original histories and working layers are preserved under ignored .local-audit/INT-401 and refs/preserved/int401. Rowan owns the R3 app_drafts_private migration blocker; Soren schedules all fleet-02 container checks. See docs/issues.md, obsidian.md and docs/completion/int401-overlay-manifest.json.


Current checkpoint: Devin is suspended with $4.20 of the approved existing credit remaining and $0.00 on-demand. Backend source 5785eba is not accepted: the partial ops batch passed heartbeat and egress (one PowerShell skip), but secrets failed to load. The full-bundle Docker runner passed static re-review after cleanup-control repair; execution is pending. Fable completed its source/test draft and review-repair session f85838f4-99dd-42dc-93bc-7dad6b950aab is running. Static review found stale-success ownership defects in inbox and reader, delayed freshness scheduling, misleading empty-continuation text, and a drawer comment defect; repairs and visual validation remain pending.

Frontend data passed 123 unit tests, typechecking, API regeneration and build at handoff `79387b1`. These results do not validate the subsequent Fable UI changes. Devin's successful grantor probe and partial ops results are archived under `docs/evidence`; end-to-end acceptance remains open.

**Design and source intake complete; the first backend checkpoint is preserved in incomplete draft PR #5.** Resend and self-hosted Supabase are selected by the user. This update replaces the earlier assumption that the primary product is a campaign engine across 18 existing mailboxes. The expanded brief specifies nine addresses across one or two domains; actual addresses, inbox/alias boundaries and migration requirements remain unresolved.

Local execution is underway from main `103baeb0` in an isolated checkout. Three independent exact-model PLAN consultations completed successfully; [runtime evidence and opinions](.planning/consultations/results/initial-plan/metadata.json) distinguish these from the earlier failed attempts. Astra MAX has accepted the initial local architecture; see [ADR 0002](docs/decisions/0002-local-architecture.md). Fresh BE-01 task opinions and Astra MAX synthesis are complete; Devin preserved a partial foundation checkpoint in draft PR #5 and is verified suspended. Official Devin MCP is authenticated and its read-only session verified this repository/base and working Docker. [Devin setup](docs/research/devin-cli/README.md) records the connection and its limitations. Fable retains frontend ownership; FE-01 has three completed exact-model opinions, accepted Astra MAX synthesis and a frozen canonical read contract; Fable authored the isolated FE-01 read checkpoint; it is unaccepted pending Docker checks, defect repair and visual validation.

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

There is no Elevateo application to install yet. Do not execute the archived upstream setup instructions as a way to launch this design. Clone this repository and start from LOCAL_BUILD_PROMPT.md. Code blocks and route names in the design remain examples until implemented. The local completion plan defines commands the next agent must create and prove, not scripts already available today.

Application lint, typecheck, unit/integration tests must run in Docker; browser validation and platform-specific packaging checks follow before release. Documentation checks for this update are recorded in `code-reviews.md`. No live email, domain change, infrastructure purchase or deployment occurred.

Verify source intake with `python3 scripts/verify_upstream.py`; run isolated provenance-tool tests with `python3 -B scripts/test_snapshot_tools.py -v`. These are repository tooling checks, not application acceptance tests.

### Devin credit authorization (2026-10-12)

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation was dispatched from frozen planning commit `5ae9771`. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.

BE-01 implementation is now assigned to [Devin](https://app.devin.ai/sessions/257567ddf6b743c8b9dad365f52e3f99), based on `5ae9771`; partial implementation is preserved in incomplete draft PR #5; independent verification remains pending and the session is suspended.

FE-01 read contract and exact-model synthesis are frozen in .planning/consultations/results/fe-01 and contracts/v1. Docker generation with openapi-typescript 7.13.0 reproduced identical API types; tooling audit reported zero vulnerabilities across 34 packages. This is tooling evidence, not application acceptance. Full frontend/backend integration remains open.

### Active implementation and review checkpoint (2026-10-12)

Fable frontend writer `claude-fable-5`, session `01e556f7-b53b-417b-a529-fbfe867f989e`, has authored the accepted FE-01 read checkpoint from `ce95e89` in the isolated `Elevateo Mail - Fable FE01` checkout. Only `apps/web` is writable; generated contracts are frozen. Docker dependency resolution and static review are underway; application tests and visual verification remain pending.

Devin has been sent to sleep after cleanup; incomplete draft PR #5 is at documentation-only follow-up `eedc43b`, with source unchanged from `5a9d83a`. Static adversarial review has identified ten findings (nine code defects and one worker-health acceptance gap) across 712 unique code lines; none is claimed fixed or runtime-verified. See `code-reviews.md`. The frozen BE-01-R1 security-repair brief is undergoing three fresh exact-model consultations before bounded Astra LOW repair and further Devin implementation.

The visible Devin Usage & Limits page showed Free plan, **$7.74 remaining balance** and $0.00 on-demand usage at approximately 2026-10-11T16:58Z. Existing $10 credit authorization remains the ceiling; no purchases/top-ups. API dollar telemetry remains unavailable. Devin reports remote cleanup in `f7f3bb7`: seven stopped containers, runtime network, 905 MB built image and 15 cache records removed; approximately 1.09 GB host space reclaimed. Persistent volumes and credentials were preserved. The six pulled images (3.45 GB) were then removed by exact ID in `eedc43b`, reclaiming another approximately 3.19 GB on the remote host. Six cache records (118.5 MB) resisted scoped removal and remain; no broad prune was used. These are remote-agent observations, not independent measurements. Local FE contract-generator containers and their newly pulled image were removed; pre-existing images and nine persistent volumes were preserved. Host disk compaction and reclaimed-byte measurement were not performed.

### Local checkpoint update (2026-10-12, approximately 17:17 UTC)

Fable 5 session `01e556f7-b53b-417b-a529-fbfe867f989e` finished authoring the FE-01 read-only frontend in its isolated checkout. Review has covered 1,943 unique lines, finding 14 localized code/test defects plus one inaccurate coverage comment; a suspected navigation/session-generation defect was retracted. Supporting dependencies are exactly pinned and the Docker-generated lock reports zero npm vulnerabilities. Initial container checks are underway; no passing application check or visual validation is claimed yet.

Devin BE-01 session `257567ddf6b743c8b9dad365f52e3f99` is independently verified suspended. Draft PR #5 remains unaccepted. BE-01-R1 has valid fresh Fable 5 and Opus 5.5 opinions; the first Fable 5.1 attempt exhausted its configured runner budget without an opinion. A bounded exact-model retry is underway. Implementation waits for all three substantive opinions and actual Astra MAX synthesis. Devin's approved existing $10 remains the only authorized Devin spending; no top-up or purchase occurred.


### FE-01 Docker diagnostic results

API regeneration passed. Strict compilation failed on FE-R12 and FE-R15. Unit tests: 63 passed, 3 failed out of 66; all failures are retained DOM from previous SessionProvider tests (FE-R17, missing Testing Library cleanup with Vitest globals disabled and no setup hook). These failures prevent validation of the affected session assertions. The separate diagnostic Vite bundle succeeded (148 modules; JS 373.92 kB / gzip 115.76 kB), but does not constitute a passing production build because typechecking failed. Lint, browser/visual checks and real backend integration remain outstanding. See `docs/evidence/fe01-initial-review/unit-bundle.txt`.

All task test containers were automatically removed. The task-owned Node image (332 MB reported image size) was removed; Docker reports zero containers and zero build cache. Pre-existing Playwright/Python images and nine persistent volumes were preserved. Host free space was only 1.42 GB after cleanup; virtual-disk reclaim remains under investigation, so no host-space recovery is claimed.


### Repair execution checkpoint (2026-10-12)

Frontend draft `d7eac07` is preserved in [PR #7](https://github.com/tanzeel-roseyco/elevateo-mail/pull/7), based on `ce95e89`, and remains unaccepted. [Issue #8](https://github.com/tanzeel-roseyco/elevateo-mail/issues/8) tracks 17 code/test defects, two documentation defects and one lint gap across 2,133 reviewed lines. All three fresh FE-01-R1 opinions and actual Astra MAX synthesis are complete; the frozen dispatch is under `.planning/consultations/results/fe-01-r1`. Actual Astra LOW stage A is writing bounded data-layer regressions in the clean `Elevateo Mail - FE01 R1 Data` checkout at `d7eac0791fd6483e47677fe8faa26c70a6522485`, branch `fix/astra-low/fe-01-r1-data`. Fable session/UI repair follows its committed handoff. No repair acceptance is claimed.

BE-01-R1 has three verified substantive exact-model opinions and actual Astra MAX accepted synthesis under `.planning/consultations/results/be-01-r1`. A separate actual Astra LOW writer is assigned to the bounded repair; Devin remains suspended, with backend source unchanged at `5a9d83a` under documentation-only head `eedc43b`. The refreshed Devin Usage page showed $5.60 remaining and $0.00 on-demand usage at approximately 17:40 UTC. The isolated grantor probe failed before database readiness and returned no catalog evidence; its disposable resources were removed. Devin suspension is independently confirmed (updated 17:40:47 UTC). A corrected, reviewed probe is being prepared; the grant migration remains blocked. No purchases/top-ups or hard API spending-cap claims.

Local Docker cleanup removed the task Node image (332 MB reported) and all task containers; cache is zero. Pre-existing images and nine persistent volumes remain. WSL fstrim returned 0 bytes; measured host free space is approximately 1.68 GB, not attributed to trim. Full VHD compaction is unavailable in the non-administrator session (Optimize-VHD absent). This limits further large local test environments; no persistent data was deleted.

### Reviewed grantor probe checkpoint
The corrected isolated grantor probe is frozen in docs/evidence/be-01-r1-grantor-probe.md (SHA-256 5b1e35dfa6a7b8446eabbe1dfae6a6f19125f13ab6e4ca1f659682fad14f83a3). Independent cleanup re-review covered 169 Bash lines with zero new defects; execution remains pending. One bounded attempt on the existing Devin session is authorized using existing credit only; implementation remains frozen until catalog evidence is available.


INT-401 preservation follow-up: original indexed executable modes restored for canonical scripts after Windows overlay staging; baseline remains UNTESTED. Source-only and history bundles remain ignored local deliverables.

BE-403 raw API boundary correction: IN PROGRESS. Rails instrumentation reads filtered params before actions and can parse malformed query/JSON or truncate raw JSON by forged Content-Length. ApiController now suppresses eager body/query parameter parsing before instrumentation; route parameters remain available and existing bounded raw validators still own body/query decoding. Existing duplicate-key, malformed-query and actual-byte-cap regressions must run on fleet-02.

BE-403 bootstrap guard regressions authored: exact private-schema DO block exercised in rollback-only disposable fixture transactions, including nonempty sentinel/OID/ACL representation, default-privilege creation leakage, owner CREATE/USAGE/ALL loss, foreign grants, wrong owner+empty ACL and atomic rejection. Full psql bootstrap and actual Rails migration bookkeeping remain distinct Soren gates; NOT_RUN for current revision.

BE-403 numeric underflow repair: ExactDecimal rejects nonzero JSON mantissas converted to zero by extreme BigDecimal exponents, while preserving exact decimals and true zero. Existing precise-version and exception-mode regression failures provide target coverage; current runtime NOT_RUN. Semantic guard order now follows supplied owner/ACL/owner-privileges/runtime sequence.

BE-403 effective-access regression authored: transaction-local inherited owner membership grants runtime schema access without altering owner-only namespace ACL; bootstrap predicate must still reject. Current source and tests remain pending Soren execution and root independent review.

BE-403 atomic down dependency regression authored: an unrelated view depending on app.drafts forces non-CASCADE down failure; rollback to savepoint must restore earlier function/table drops and preserve dependency. This supplements actual-migrator SQL down/reapply; real Rails schema_migrations bookkeeping remains Soren gate. Current changes NOT_RUN.

BE-403 e0c2d35 fresh remote Docker result: migrations succeeded; full suites FAILED with nine assertions and zero Minitest errors; Steep now parses but exposes inherited typing diagnostics. Raw-boundary, exact-decimal and bootstrap semantic tests passed in this SHA, not full acceptance. Follow-up source repairs strengthen pool backend continuity, scope safe-handoff instrumentation to the request checkin, commit the lower generation fixture for NOWAIT, bind remaining assert_raises block, and assert rollback occurs before intentional adapter discard. Native 25P04 proof remains open; no oracle weakened.

BE-403 typing repair batch authored from e0c2d35 diagnostics: nullable boundary inputs accurately typed, BigDecimal standard-library signatures loaded, Thread required block and demonstrated Rails request seams declared, exact Auth/config/cipher locals narrowed without casts, empty collection/tuple shapes annotated. Strict Steep configuration retained; no suppression or blanket untyped domain types. Bootstrap source-load failure moved inside test execution for explicit reporting; Soren must mount exact immutable bootstrap SQL. Runtime NOT_RUN for this batch.

BE-403 native timeout diagnostics authored: request verbose libpq errors before the two native schedules and emit only backend ID, result SQLSTATE, error class and booleans for exact 25P04 presence/broken connection. No raw SQL/error/credentials exported; original structured-result assertion remains unchanged and may still fail. This is diagnostic evidence collection, not a timeout PASS or widened oracle.

BE-403 coordinated harness source prerequisite: Soren explicitly requested Rowan add exact test-only read-only bootstrap.sql bind and matching cleanup allowlist. Test service preserves its original three read-only source mounts; production API/worker mounts unchanged. This enables actual bootstrap-block regression discovery; no Docker executed by Rowan, independent source review and fresh runtime still required.

BE-403 28390d7 fresh fleet result: 54 suite summaries,375 runs,5487 assertions,2 native deadline failures,0 errors,0 skips; all other suites including bootstrap contract/race repairs passed. Structured server logs correlate both backend PIDs to FATAL25P04; transport error text is diagnostic only. Follow-up captures first structured query PGresult before draining, and copies idle structured fatal fields from libpq notice receiver before discard. Require exact SQLSTATE25P04+FATAL from original structured result; unrelated transport death cannot pass. Remaining Steep errors receive typed literals, correct optional record syntax, explicit saved parse value and nonnullable owned lease. Current follow-up NOT_RUN; RuboCop95 offenses await container lint repair.

BE-403 native protocol refinement: active schedule uses send_query/get_result async first-result observation, salvaging only a retained structured PGresult if the async read reports connection failure. Idle schedule waits at most two seconds for socket readiness before parsing the server fatal through the structured notice receiver. Exact25P04+FATAL remains mandatory; this source-only refinement requires independent review and Soren execution.

BE-403 protocol reviewer caveat resolved in source: active first-result observation now calls the async driver block with an explicit two-second bound before reading the ready result; idle fatal also has bounded socket readiness. A driver connection failure may salvage only an already buffered structured result. Runtime confirmation remains pending, outer disposable suite watchdog remains in force.

BE-403 ADV738 boundedness correction: the two-second driver block bounds result-read readiness AFTER ruby-pg flush, whose backpressure wait is not covered. The existing external 90-second per-suite timeout and bounded parent runner/cleanup own the complete CI time limit. No two-second whole-operation guarantee is claimed. Tiny fixed local query reduces likelihood, not a runtime proof. Chose the reviewer-offered explicit contract plus existing watchdog rather than adding a generic IO pump to this diagnostic fixture; exact structured25P04+FATAL unchanged.

BE-403 fatal-cleanup regression authored: real API-pool fixture disconnects the detached adapter, raises SystemExit, verifies the fatal signal propagates, original business transaction marker remains absent, and the next tenant uses a clean connection. This explicitly tests the recoverable-versus-process-fatal cleanup change; NOT_RUN, independent design/source review required.

BE-403 ADV748 fatal cleanup repairs authored: disposal now runs in ensure after proven detachment even if pool.remove exits fatally/nonlocally; no repeated pool removal. A non-StandardError cleanup exit takes precedence over an earlier recoverable request error; ordinary-primary preservation remains. Three new real-pool regressions cover fatal-after-remove disposal, checkin-primary versus fatal quarantine, and fatal-before-native-close. If native disposal itself fails before closing, the adapter remains detached but its physical session may stay open until process shutdown; fixture explicitly detects and closes it, no false closed claim. Current repairs NOT_RUN and need bounded independent review.

BE-403 latest observed4c3b432 full result:54 summaries377runs5532assertions0failures0errors0skips; native structured25P04 five cases PASS; RuboCop149files0offenses; build/migrations/DB/Auth guards PASS; overallFAILED onlySteep14problems(2duplicate declarations,12warnings). Fresh source removes duplicate path_parameters and retains originalHash[Symbol,String] declaration; precisely types remaining guard/write callbacks and reopens the same namedData principal class so its constructor is checked. Includes644988f fatal repairs; fresh fullrun and warning-free type evidence pending, HTTP NOT_RUN in4c lane.
