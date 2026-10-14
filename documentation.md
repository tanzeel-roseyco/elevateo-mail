INT-401 bounded repair (2026-10-14): restored canonical BE02 compose.yaml, 37 nested BE01 tooling files, three evidence-script dependencies and eight Backend Performance docs. 629 overlay hashes match; 63 static dependency checks leave one inherited frozen-manifest hash conflict, plus scripts/dev seed/check name absent Compose services. Linus ADV-729 reviewed 172 source lines, confirmed two integration defects (11.63/KLOC); repairs are statically observed, independent re-review and all runtime/visual checks remain pending. Application IN PROGRESS; root owns testing and GitHub issues. See docs/completion/int401-repair.md.

BE-403 (2026-10-14): IN PROGRESS. Approved semantic schema guards are source-reviewed and Soren verified real Rails rollback/reapply, atomic rejection, default-privilege leakage and nonempty sentinel preservation on 786f2f9. Full 28390d7 run:375 runs/5487 assertions,2 native-observation failures,0 errors; later HTTP stages NOT_RUN. Rowan is repairing structured native observation, strict type warnings and lint; current edits are unverified. No public/live mail. See docs/completion/be403-bootstrap.md and reports/rowan-progress.md.

BE-403 runtime failure repairs (2026-10-14): IN PROGRESS. Source fixes target observed 42f6369 errors: Minitest fixture message collision/block binding/frozen strings/nil assertion, draft keyword and rotating-CSRF fixtures, obsolete JSON 3 create_additions option, invalid RBS protected declarations, and worker function namespace USAGE. Auth/session boundaries remain unchanged. Current changes are NOT runtime verified; pool/deadline/input/controller failures remain open.

BE-403 semantic guard reconciliation (2026-10-14): IN PROGRESS. Approved design hash b08976256765ce546325418a403a23b958933cbbf97ec42a228c5412198d0acb verified. Bootstrap preserves ACL representation and unrelated objects; shared up/down prerequisite checks migration identity, independent ownership, separate owner CREATE/USAGE, foreign ACL and effective runtime denial. Source authored; current changes await independent review and Soren container verification. Earlier 42f6369 migration/guard passes do not validate this revision; its full suites failed (15 failures/55 errors).

BE-403 (2026-10-14): IN PROGRESS. Rowan authored privileged draft-schema bootstrap and fail-closed migration prerequisite checks on c3ecd1f; rollback retains the schema and unrelated objects for least-privilege reapply. Source review found no blocking defect; new real-role/drift regressions await Soren container execution. No runtime acceptance or release. See docs/completion/be403-bootstrap.md.


INT-401 handoff: source preservation/integration complete, application IN PROGRESS. Verified 45,507 archived source entries and 580 canonical overlay files with zero hash mismatches; original executable modes restored. Remote tests and independent review remain pending. See docs/completion/int401-handoff.md. An ignored partial runtime export copy remains after automatic cleanup approval rejection; no original data removed.

2026-10-14 INT-401: IN PROGRESS. Canonical frontend/backend/acceptance/performance sources are integrated from Local Completion d2de43b in integrate/cassian-unified. This baseline is UNTESTED; historical results below do not validate it. Archive capture completed: 19 Git checkouts, 18 preserved HEAD refs, 12 source exports, 45,507 source-file entries; original histories and working layers are preserved under ignored .local-audit/INT-401 and refs/preserved/int401. Rowan owns the R3 app_drafts_private migration blocker; Soren schedules all fleet-02 container checks. See docs/issues.md, obsidian.md and docs/completion/int401-overlay-manifest.json.

# Product requirements and decision record

Current checkpoint: Devin is suspended with $4.20 of the approved existing credit remaining and $0.00 on-demand. Backend source 5785eba is not accepted: the partial ops batch passed heartbeat and egress (one PowerShell skip), but secrets failed to load. The full-bundle Docker runner passed static re-review after cleanup-control repair; execution is pending. Fable completed its source/test draft and review-repair session f85838f4-99dd-42dc-93bc-7dad6b950aab is running. Static review found stale-success ownership defects in inbox and reader, delayed freshness scheduling, misleading empty-continuation text, and a drawer comment defect; repairs and visual validation remain pending.

Design date: 2026-10-11; expanded planning revision: 2026-10-12. This document supersedes the earlier planning assumption of 18 connected outreach mailboxes. It does not erase the original requirement for consent-based sending.

Execution update 2026-10-12: the user has directed autonomous local completion. Initial exact-model consultations succeeded on base `103baeb0`; results are under `.planning/consultations/results/initial-plan`. Official Devin MCP has verified repository access and Docker. Application implementation and acceptance remain pending; initial planning opinions do not authorize skipping per-task gates. Message rendering remains text-only under the current conversation's explicit frontend rule. Production activation and live mail remain separate.

## Confirmed by the user

| ID | Requirement | Acceptance evidence at implementation |
| --- | --- | --- |
| R01 | Shared company mailbox for about 10 people | Two simultaneous users can read and work the same thread with distinct permissions/read state |
| R02 | Resend for email transport | Verified domain, authenticated inbound webhook, provider test events and controlled end-to-end send/reply |
| R03 | Self-hosted Supabase | Repeatable production Compose deployment, Auth, schema/RLS tests, private attachments and restore drill |
| R04 | Web application at a subdomain | HTTPS URL, authentication and authorized mailbox operations in supported browsers |
| R05 | Downloadable Mac and Windows clients | Install, login, logout and update validation on macOS and Windows; signed distribution artifacts |
| R06 | Claude and Codex connectors | Both clients complete authorized mailbox search/read/draft tests; cross-mailbox access denied |
| R07 | Efficient compute and resource use | Measure CPU/RAM/disk/queue age on representative workload before choosing final server size |
| R08 | Teach backend, system and database design, including CAP | Worked examples, ER model, failure cases and exercises in the tutorial |
| R09 | Use the user's Codex CLI and update this repository | CLI-authored tutorial and source tooling reviewed; Git commit and remote update verified |
| R10 | Upload all six repositories or select their best components and document them strictly | Pinned source files, complete file manifests, preserved notices, six independent dossiers and adoption/goal traceability |
| R11 | Give the next agent a local frontend reuse prompt and end-to-end local completion instructions; leave credentials last | LOCAL_BUILD_PROMPT.md and local completion plan; future implementation evidence must cover real local services, simulated transport, UI, connectors, desktop and final activation inputs |
| R12 | Codex research first; Astra MAX designs with separate Fable 5, Opus 5.5 and Fable 5.1 opinions on each task; Devin backend branches/PRs/issues and Astra LOW fixes | Evidence ledger, actual execution identities, accepted synthesis, reviewed task/fix PRs and no invented consultation results |
| R13 | Fit requested languages/frameworks to useful boundaries; reuse major projects and evaluate brick/math | Polyglot matrix, pinned/license-aware adoption decisions, one domain authority and conformance tests; no gratuitous services |
| R14 | C# Windows GUI, Java Android APK, SwiftUI iOS and suitable desktop/mobile alternatives | Separate platform artifacts and target-runtime evidence; Qt/Ionic/Electron assessed as alternatives |
| R15 | Distinct in-app Codex and Claude/Fable CLI connectors | Supported authentication/protocols, fixed-executable adapters, stream/cancel/approval tests and enforced tool/data scopes |
| R16 | Opus 5.5 owns all C++ and motion design; use Anime.js for web polish | Actual assignment identity, accessible reduced-motion behavior and measured browser/native evidence |
| R17 | Nine addresses across one or two domains; user Resend CLI; future computer-use connection to Instantly; no live sends | Inventory distinguishes aliases; read-only CLI discovery; separate account-connection and warmup gates; warmup stays disabled until no-live-send constraint explicitly changes |

The current source-intake request explicitly authorizes collecting all six codebases in this repository. See [source inventory](third_party/README.md), [independent dossiers](docs/reference-repositories/README.md) and [goals](docs/goals-and-traceability.md). Archival source import is complete; runtime integration remains future work.

## Product boundary

The first release is a company mailroom: named addresses, shared conversations, assignment, team status, per-user read state, composer, drafts, search, attachments and audit history. Individual mailbox permissions allow private addresses where required. Ten users do not imply ten paid email accounts or ten servers; people, addresses, mailboxes and provider identities are separate concepts.

Company correspondence must meet the provider's rules. Marketing sequences are a later, explicitly scoped module with consent evidence, unsubscribe and dispatch-time suppression. The original ambition to resemble Instantly/Smartlead informs workflow quality; Resend is not an approved transport for unsolicited cold outreach. See the [current provider constraints](docs/mail-delivery-and-hosting.md).

This is an API-based mailbox product. Full Gmail/Outlook history synchronization, conventional IMAP access from Apple Mail, calendars, contacts synchronization and federation are not implied by the first release. Add Gmail/Graph adapters later if existing account history becomes a requirement. Do not move existing company MX records to Resend until that migration is separately designed and tested.

## Decision status

| Decision | State | Rationale |
| --- | --- | --- |
| Resend + self-hosted Supabase | User selected | Explicit current instruction |
| Company mailbox + web + Mac + Windows + AI connectors | User requested | Current product direction |
| Rails API/worker; React/TypeScript; Rust/Tauri Mac; C# Windows | Accepted local direction under ADR 0002; per-task gates remain | One domain authority and versioned cross-language contracts; inspect existing first-party work first |
| PostgreSQL job queue, separate API and worker | Working defaults for scoped local completion | One durable source of truth; API restarts must not lose jobs |
| VPS, Docker Compose, reverse proxy, off-host backups | Recommended, approval pending | Small fixed team; operational ownership must be deliberate |
| Resend stable send/receive APIs, not private-beta Inboxes | Recommended | Avoid availability and response-shape dependency on limited beta |
| MCP read/search/draft first; human-controlled sending | Recommended | Enforce permissions and prevent email content from granting actions |
| Best-of reuse by selective adaptation | Recommended | Audited foundations need reliability/security fixes; no blind merge |
| Engineering standards | Local engineering baseline; production decisions open | 2026-10-12 local-completion instruction supersedes the blanket wait within that scope; no blanket approval claimed |
| Expanded orchestration/language/client plans | Requested workflow documented; implementation pending | Follow .planning/README.md and ADR 0002; initial exact-model opinions and synthesis completed; BE-01 partial draft #5 unaccepted; FE-01 read checkpoint synthesis accepted |

## Proposed permissions

Organization roles: owner, administrator, member. Mailbox roles: viewer, contributor, sender. A membership in the organization does not automatically disclose every mailbox. Administrator can manage access, but reading content requires mailbox membership; access changes are audited. Emergency access must be explicit, temporary and visible.

Viewers can read approved content; contributors can draft, assign and label; senders can finalize a reviewed draft for dispatch. Connector grants intersect the user's current mailbox permissions and granted scopes, and can never increase them. A connector with `drafts:write` cannot issue a send request.

## Working assumptions, not settled facts

Start with one company, about 10 staff and nine addresses across one or two domains. Actual inbox/alias mapping and receiving routes remain unknown. Use online-first clients and the smallest useful service set. The old figure of 18 addresses is superseded. No actual company domain, provider account, budget, message volume, storage growth, data residency, legal retention, SSO vendor or continuity target is assumed known.

Before deployment, resolve the actual addresses and existing MX provider, new-address versus migration scope, ordinary correspondence versus marketing, peak inbound/outbound volume and attachment sizes, region, backup retention and who owns server maintenance. These questions do not block designing or reviewing the system. They do block safe DNS migration and final capacity/SLA commitments.

## Design artifacts

The architecture contains C4-style context/container views and trust boundaries. The database tutorial contains the conceptual ER model and constraints. Contracts document route shapes, transaction boundaries and state transitions. [The local agent prompt](LOCAL_BUILD_PROMPT.md) and [completion plan](docs/local-completion-plan.md) now define the bounded execution path before credentials; the release plan describes later live gates. These documents are not evidence of implemented features. The [expanded planning index](.planning/README.md) now governs research, exact agent routing, language ownership, later mobile targets and no-live-send activation. Application credentials stay last; implementation-agent authentication is a separate prerequisite.

### Devin credit authorization (2026-10-12)

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation was dispatched from frozen planning commit `5ae9771`. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.

BE-01 dispatched through official Devin MCP at 2026-10-11T16:34:21Z: session `257567ddf6b743c8b9dad365f52e3f99`, implementation base `5ae9771ad30923a66a2a5ed6aa5d6902d3e439d2`, branch `devin/backend/be-01`. Existing-credit-only $10 approval; no topups. First 30-minute checkpoint at 17:04:21Z. Partial commit 5a9d83ad4de7403f349131bf0c3e45df7fd97c28 is preserved in draft PR #5; no acceptance is claimed. Session suspension verified at 2026-10-11T16:50:37Z; dollar usage remains unavailable.

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


### Current repair checkpoint 2026-10-12

The corrected Devin grantor probe succeeded and its authenticated raw attachment is preserved under docs/evidence/be-01-r1-probe-result (SHA2563263793b298326c2231a22fcd847b13ada0b365ae3ccb2bb44097534f1b69327). Actual Astra MAX disposition permits the narrow additive membership repair. Unit A sources are now authored; independent review identified four test/guard defects and repairs are underway. No backend runtime acceptance.

FE data source checkpoint3ab182fd7100628758165111ba3bf32054ae7045 and evidence handoff79387b1bab0f5958b1a80028c0b35152fc10ecbc are pushed on fix/astra-low/fe-01-r1-data. Pinned Docker types, API regeneration,123unit tests and production build pass; lint and UI/visual gates remain open. Fresh exact claude-fable-5 session b878fb94-6e40-482d-9b26-1e39f8e98920 is authoring stage B in clean Elevateo Mail - Fable FE01 R1, branch fix/fable/fe-01-r1, parent79387b1. Runtime init verifies only Edit/Glob/Grep/Read/Write, no MCP. Runner2.1.296 restricted/safe mode, no fallback, $10 API-list-cost ceiling distinct from Devin credit,30minute checkpoint; root owns execution and stop control.

Devin remains independently verified suspended; last visible credit$5.17 and on-demand$0.00. Existing $10-only authorization remains binding. Task Docker containers/Node image removed; zero containers/cache, pre-existing Playwright/Python images and nine persistent volumes retained. Last measured host free1,030,987,776bytes; no host-space recovery claim. Project remains incomplete and unpublished.


BE-01-R1 source checkpoint `5785eba47f3709debb2815c8d86608f7e62d02f3` is pushed on `fix/astra-low/be-01-r1`. Final authority review 165 LOC, catalog 29 LOC, protocol 131 LOC and dependency 60 LOC report zero new defects; overlapping coverage is not additive. At 18:24:36 UTC Devin resumed for ops-only pinned Ruby Docker tests with a five-minute execution checkpoint and verified cleanup. Last visible prepaid balance $5.17; no purchases. Test results remain pending. Dispatch is preserved under docs/evidence/be-01-r1-ops-dispatch.txt.

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

BE-403 container lint and typing warning repair batch authored: applied Soren safe55-correction/21-test-file patch; fixed remaining unused callback keywords while preserving parent contract, made health script executable, removed redundant nesting-error rescue, and narrowed recoverable cleanup catches to StandardError. Test-thread cleanup explicitly retains Minitest::Assertion, which is outside StandardError; fatal process signals propagate through existing ownership ensures. Fakes now enforce supplied deadlines/cache invalidation/budget and trace authorization connection; real read dispatch asserts exact leased connection. Controller keyword locals have explicit contract types to address84 fallback warnings; strict flags/cop checks unchanged. Current batch NOT_RUN; fatal cleanup behavior requires dedicated review.

BE-403 fatal-cleanup regression authored: real API-pool fixture disconnects the detached adapter, raises SystemExit, verifies the fatal signal propagates, original business transaction marker remains absent, and the next tenant uses a clean connection. This explicitly tests the recoverable-versus-process-fatal cleanup change; NOT_RUN, independent design/source review required.

BE-403 ADV748 fatal cleanup repairs authored: disposal now runs in ensure after proven detachment even if pool.remove exits fatally/nonlocally; no repeated pool removal. A non-StandardError cleanup exit takes precedence over an earlier recoverable request error; ordinary-primary preservation remains. Three new real-pool regressions cover fatal-after-remove disposal, checkin-primary versus fatal quarantine, and fatal-before-native-close. If native disposal itself fails before closing, the adapter remains detached but its physical session may stay open until process shutdown; fixture explicitly detects and closes it, no false closed claim. Current repairs NOT_RUN and need bounded independent review.
