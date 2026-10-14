# Elevateo Mail — ongoing project record

BE-403 runtime failure repairs (2026-10-14): IN PROGRESS. Source fixes target observed 42f6369 errors: Minitest fixture message collision/block binding/frozen strings/nil assertion, draft keyword and rotating-CSRF fixtures, obsolete JSON 3 create_additions option, invalid RBS protected declarations, and worker function namespace USAGE. Auth/session boundaries remain unchanged. Current changes are NOT runtime verified; pool/deadline/input/controller failures remain open.

BE-403 semantic guard reconciliation (2026-10-14): IN PROGRESS. Approved design hash b08976256765ce546325418a403a23b958933cbbf97ec42a228c5412198d0acb verified. Bootstrap preserves ACL representation and unrelated objects; shared up/down prerequisite checks migration identity, independent ownership, separate owner CREATE/USAGE, foreign ACL and effective runtime denial. Source authored; current changes await independent review and Soren container verification. Earlier 42f6369 migration/guard passes do not validate this revision; its full suites failed (15 failures/55 errors).

BE-403 (2026-10-14): IN PROGRESS. Rowan authored privileged draft-schema bootstrap and fail-closed migration prerequisite checks on c3ecd1f; rollback retains the schema and unrelated objects for least-privilege reapply. Source review found no blocking defect; new real-role/drift regressions await Soren container execution. No runtime acceptance or release. See docs/completion/be403-bootstrap.md.


Status: IN PROGRESS. Updated 2026-10-14, Australia/Sydney.

## Nontechnical brief
Elevateo Mail is a shared team mailroom. It brings reading, searching, assigning, composing and tracking work into one interface. This phase reconciles existing frontend/backend work, repairs the first complete integration blocker, and prepares separate live and test hosting. It is not yet approved for live use.

The product research compares Gmail's familiar conversation workflow with Instantly's account-health and operations views. Any resulting design is an original Elevateo experience. Instantly's claims about warmup will be distinguished from observed behavior and provider-supported practices; no warmup or email sends have been activated.

## Technical and strategic brief
Accepted stack: strict TypeScript/React web client through MailroomGateway, Rails API and worker, PostgreSQL durable state/jobs, self-hosted Supabase Auth and Storage. Existing architecture is retained unless measurement justifies change. Separate live and test Supabase deployments are planned on fleet-02, with separate databases, object storage, keys, networks and backups. Disposable CI fixtures remain a third identity.

All Docker builds and application tests run on fleet-02. The laptop coordinates and performs requested visual inspection. Current runtime is not demonstrated production-ready: the last integration run passed image build and early migrations, then failed PostgreSQL app_drafts_private schema privileges; its app/backend browser tests did not run.

## Current team and responsibility ledger
| Identity | Name | Ticket | Branch | Responsibility |
|---|---|---|---|---|
| OFF-401 | Cassian | INT-401 | integrate/cassian-unified | Preserve old work and reconcile unified source; documentation and provenance |
| OFF-402 | Soren | OPS-402 | ops/soren-supabase | Fleet resource admission, isolated Supabase stacks, serialized Docker jobs |
| OFF-403 | Rowan | BE-403 | fix/rowan-schema-auth | Schema privilege repair and backend acceptance |
| OFF-404 | Elara | QA-404 | test/elara-acceptance | Real backend browser acceptance and regression evidence |
| OFF-405 | Mira | FE-405 | feat/mira-mailroom-experience | Original premium mailroom frontend informed by evidence |
| OFF-406 | Nadia | RES-406 | research/nadia-deliverability | Instantly/Gmail primary-source research, REA claims ledger and deliverability |
| ADV-714 | Ada | Design advice | Read-only | Infrastructure isolation, backup consistency and resource tradeoffs |
| ADV-729 | Linus | Merge advice | Read-only | Canonical source selection and preservation strategy |

Root supervises, challenges decisions, reviews implementation and validates evidence. Worker model mandate: GPT-6.1-Sol, low effort, Fast tier, YOLO. Specialist helpers receive numeric identities and bounded assignments. No more Claude ultrareviews.

## Decisions and measured evidence
- Local RAM fell to 0.25 GiB free of 15.71 GiB. Fleet reported 36,690 MiB available and 235 GiB disk free.
- Preserved two old idle Elevateo terminal transcripts, then closed only those terminals. Closed the five new idle local Codex processes before recreating their jobs through named SSH-backed Orca terminals.
- Local free RAM subsequently measured 1.38 GiB. This is a point-in-time reading, not attributed reclamation.
- Fleet already has Codex 0.156.1 authenticated with ChatGPT, Claude 2.1.283, Node 24.21.0 and Docker. No existing Orca remote environment was configured; remote jobs therefore run via SSH with explicit process/transcript/exit evidence.
- Cassian's local terminal confirmed GPT-6.1-Sol low fast and YOLO. Remote commands request the same model/effort/tier; successful remote execution remains to be confirmed.
- Source changes were not discarded. Fresh per-worker clones live under Code and projects, and fleet execution clones under /home/tanzeel/elevateo-mail-wave-20261014.
- No Docker mutations or new application tests have run in this phase yet.

## Issues and completion gates
- R3 migration failure: private draft schema permission. Rowan owns repair and regression proof.
- Current frontend test counts are historical fixture evidence, not a successful integrated live backend run.
- Merging many dirty checkouts requires source-only preservation, explicit canonical ownership and conflict review. Cassian owns it.
- Actual production domain/TLS and off-host backup destination are not yet established.
- Public release requires lint, types, unit/integration, real API browser tests, cross-tenant isolation, restore rehearsal and actual visual QA.
- Persistent live/test databases and uploads must survive disposable Docker cleanup. No broad prune or project deletion.
- Computer Use browser focus was rejected by the OS on the first navigation attempt; recover through supported native accessibility actions without disturbing unrelated tabs.
- Obsidian MCP is unavailable in this session. This record is written directly into the existing Obsidian vault, with a project mirror planned. It is not presented as a completed report.

## Evidence locations
- Coordinator worktree: C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion
- Source integration: C:/Users/Tanzeel/Code and projects/Elevateo Mail - Cassian 20261014
- Local operational receipts: coordinator ops/local/wave-20261014
- Remote operational receipts: /home/tanzeel/elevateo-mail-wave-20261014/reports
- Prior failing integration evidence: coordinator ops/local/acceptance-integration-r3-20261014


## Preserved Cassian integration record before mirror

# Elevateo Mail — IN PROGRESS

## Nontechnical brief

Existing frontend, backend and acceptance work is being combined without discarding older source. This checkpoint is source integration, not a working-system or release claim. No real email is enabled. Backend migration repair, remote automated checks and actual visual verification remain open.

## Technical and strategic record

Hash verification observed zero mismatches across 45,507 snapshot entries and 580 final overlay files. Four original executable modes were restored after Windows staging. Remote application checks remain NOT_RUN. The audit-only partial results-fe01r10 copy is retained after automatic cleanup approval rejection; it is ignored and excluded from the committed source bundle.

Cassian OFF-401 owns INT-401 on integrate/cassian-unified from Local Completion d2de43b. Canonical FE01 R1 frontend, BE02 Codex backend/ops/scripts, coordinator acceptance/docs, Backend Performance ops/perf and unique BE01 services/tools are paired. Selected tenancy code keeps read-only repeatable-read behavior and matched signatures/tests. Root owns approval and mirrors this file to Obsidian; Cassian does not edit the vault.

## Process, timeline and evidence

Concrete baseline b0d73327ed8f9c6dc033d65102f8107d1ecc9e33 is committed and bundled for fleet transfer. Archive capture completed across 19 Git checkouts and 12 source-only exports; 18 valid HEADs are preserved in named refs, and the broken empty BE01 Repair checkout is reported. docs/completion/int401-preservation-manifest.json records patch hashes/counts and exclusions. All three canonical generated api.d.ts files have matching SHA-256 bb43a39e6fb514268ab9b89e1b443edb752f6e6eb3a7b0c87468cae5a75b077a.

2026-10-14: read current wave policy, project state and accepted Rails/React architecture; capture original checkout HEADs and separate binary index/worktree patches without changing original indexes. Hash source-only snapshots in ignored .local-audit/INT-401 and fetch histories into refs/preserved/int401. Overlay manifests are committed in docs/completion/int401-overlay-manifest.json. Every application check is UNRUN for this baseline; Soren schedules fleet-02 container jobs. R3 app_drafts_private creation is blocked and owned by Rowan. Root transferred implementation CLI execution toward fleet due to laptop memory pressure.


## Latest bounded repair and remote execution correction

INT-401 bounded repair (2026-10-14): restored canonical BE02 compose.yaml, 37 nested BE01 tooling files, three evidence-script dependencies and eight Backend Performance docs. 629 overlay hashes match; 63 static dependency checks leave one inherited frozen-manifest hash conflict, plus scripts/dev seed/check name absent Compose services. Linus ADV-729 reviewed 172 source lines, confirmed two integration defects (11.63/KLOC); repairs are statically observed, independent re-review and all runtime/visual checks remain pending. Application IN PROGRESS; root owns testing and GitHub issues. See docs/completion/int401-repair.md.



## INT-401 Linus ADV-729 bounded review and repair

Root supplied Linus results: 172 source lines, two confirmed integration defects, 11.63 defects/KLOC. Scope: missing root compose.yaml required by scripts/dev and ops/perf/lib.sh; helper leaf-name filter omitted nested be01-* tooling. Full INT-401 rubric applies; formatting belongs to linters. These are narrow integration findings, not a whole-application review. Both repaired by canonical source restoration and tool-root selection. Independent repair re-review is pending; overlap adds no unique review LOC. Original mode defect remains a separate artifact finding.

Ada ADV-714 design advice: contract/hash identity proves provenance, not lifecycle correctness. Root must reconcile R3 with the actual log and test real login/mailbox/thread/draft/reload, tenant/session invalidation, draft version conflicts/lost ACK, Storage isolation and restore. No additional defect count or reviewed LOC was supplied for Ada; density N/A. Analytical advice is recorded here and mirrored Obsidian records, not claimed as an executed connected simulation. All application tests and visual gates NOT_RUN in Cassian checkout. Static source dependency audit finds one inherited frozen package hash conflict and absent seed/check services; root owns disposition and test strategy.

Five fleet jobs failed model startup with HTTP400 for gpt-6.1-sol in the old CLI/account. Root is repairing compatibility before relaunch. Named fleet SSH terminals use report/control files and manual supervision; they are not remote Orca dispatches. Vault content was copied verbatim above and prior Cassian record retained; vault original untouched.

BE-403 raw API boundary correction: IN PROGRESS. Rails instrumentation reads filtered params before actions and can parse malformed query/JSON or truncate raw JSON by forged Content-Length. ApiController now suppresses eager body/query parameter parsing before instrumentation; route parameters remain available and existing bounded raw validators still own body/query decoding. Existing duplicate-key, malformed-query and actual-byte-cap regressions must run on fleet-02.

BE-403 bootstrap guard regressions authored: exact private-schema DO block exercised in rollback-only disposable fixture transactions, including nonempty sentinel/OID/ACL representation, default-privilege creation leakage, owner CREATE/USAGE/ALL loss, foreign grants, wrong owner+empty ACL and atomic rejection. Full psql bootstrap and actual Rails migration bookkeeping remain distinct Soren gates; NOT_RUN for current revision.

BE-403 numeric underflow repair: ExactDecimal rejects nonzero JSON mantissas converted to zero by extreme BigDecimal exponents, while preserving exact decimals and true zero. Existing precise-version and exception-mode regression failures provide target coverage; current runtime NOT_RUN. Semantic guard order now follows supplied owner/ACL/owner-privileges/runtime sequence.

BE-403 effective-access regression authored: transaction-local inherited owner membership grants runtime schema access without altering owner-only namespace ACL; bootstrap predicate must still reject. Current source and tests remain pending Soren execution and root independent review.

BE-403 atomic down dependency regression authored: an unrelated view depending on app.drafts forces non-CASCADE down failure; rollback to savepoint must restore earlier function/table drops and preserve dependency. This supplements actual-migrator SQL down/reapply; real Rails schema_migrations bookkeeping remains Soren gate. Current changes NOT_RUN.

BE-403 e0c2d35 fresh remote Docker result: migrations succeeded; full suites FAILED with nine assertions and zero Minitest errors; Steep now parses but exposes inherited typing diagnostics. Raw-boundary, exact-decimal and bootstrap semantic tests passed in this SHA, not full acceptance. Follow-up source repairs strengthen pool backend continuity, scope safe-handoff instrumentation to the request checkin, commit the lower generation fixture for NOWAIT, bind remaining assert_raises block, and assert rollback occurs before intentional adapter discard. Native 25P04 proof remains open; no oracle weakened.

BE-403 typing repair batch authored from e0c2d35 diagnostics: nullable boundary inputs accurately typed, BigDecimal standard-library signatures loaded, Thread required block and demonstrated Rails request seams declared, exact Auth/config/cipher locals narrowed without casts, empty collection/tuple shapes annotated. Strict Steep configuration retained; no suppression or blanket untyped domain types. Bootstrap source-load failure moved inside test execution for explicit reporting; Soren must mount exact immutable bootstrap SQL. Runtime NOT_RUN for this batch.

BE-403 native timeout diagnostics authored: request verbose libpq errors before the two native schedules and emit only backend ID, result SQLSTATE, error class and booleans for exact 25P04 presence/broken connection. No raw SQL/error/credentials exported; original structured-result assertion remains unchanged and may still fail. This is diagnostic evidence collection, not a timeout PASS or widened oracle.

BE-403 coordinated harness source prerequisite: Soren explicitly requested Rowan add exact test-only read-only bootstrap.sql bind and matching cleanup allowlist. Test service preserves its original three read-only source mounts; production API/worker mounts unchanged. This enables actual bootstrap-block regression discovery; no Docker executed by Rowan, independent source review and fresh runtime still required.
