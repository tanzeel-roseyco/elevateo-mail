INT-401 FROZEN APP REVISION (2026-10-14), IN PROGRESS: merged exact Rowan e0c2d358, Mira 81293f77, Elara f28d8589 and Nadia f5235cd3 over Cassian 59a8ce66 with lineage preserved. Restored later canonical contracts/v1 source (identical BE02 Codex/Fable FE01 R1/Local Completion), without regenerating or hand-editing client types. Fixed the Docker mock regression to use an interpreter-backed function while preserving noexec and checking NUL-delimited argv boundaries. New integrated source is UNTESTED; root schedules one frozen fleet acceptance request. Research remains secondary and does not gate app progress.

Reported fleet infrastructure: 24 assertions plus restore/restart/fault injection PASS; eight independently found infra defects repaired/rechecking, immutable Soren source pending and dirty source not adopted. Historical Rowan 42f6369: migrations 6, DB guards 116, Auth concurrency 3 PASS, but Ruby 368 runs/4379 assertions/15 failures/55 errors and Steep three syntax failures; not accepted. Mira 81293f77 diagnostics: check:api exit1, generated check exit0, lint exit0, typecheck exit2, unit exit1 (438 PASS/74 FAIL of512), build exit2; restored source contract needs container generation validation. Elara authored 13/26 acceptance identities, 13 unavailable, actual browser NOT RUN. Native PowerShell, lifecycle and visual validation remain pending. No release/live-mail claim.

Linus ADV-729 packet A:151 LOC,0 new defects,43 hashes match. Packet B:82 LOC,1 HIGH noexec regression defect,12.20/KLOC; total233 LOC,1 defect,4.29/KLOC. Fix source is present, independent re-review and Docker execution pending. Earlier 68-LOC repair check had0 new repair defects and2 inherited blockers (29.41/KLOC). Design review and Ada Rowan F/H bounded reviews are underway, not accepted here. Full INT-401 rubric applies to all substantive changed sources; central-doc conflict reconciliation preserves each worker record below as historical evidence.

See docs/completion/int401-frozen-app.md.

# Elevateo Mail — ongoing project record

BE-403 runtime failure repairs (2026-10-14): IN PROGRESS. Source fixes target observed 42f6369 errors: Minitest fixture message collision/block binding/frozen strings/nil assertion, draft keyword and rotating-CSRF fixtures, obsolete JSON 3 create_additions option, invalid RBS protected declarations, and worker function namespace USAGE. Auth/session boundaries remain unchanged. Current changes are NOT runtime verified; pool/deadline/input/controller failures remain open.

BE-403 semantic guard reconciliation (2026-10-14): IN PROGRESS. Approved design hash b08976256765ce546325418a403a23b958933cbbf97ec42a228c5412198d0acb verified. Bootstrap preserves ACL representation and unrelated objects; shared up/down prerequisite checks migration identity, independent ownership, separate owner CREATE/USAGE, foreign ACL and effective runtime denial. Source authored; current changes await independent review and Soren container verification. Earlier 42f6369 migration/guard passes do not validate this revision; its full suites failed (15 failures/55 errors).

BE-403 (2026-10-14): IN PROGRESS. Rowan authored privileged draft-schema bootstrap and fail-closed migration prerequisite checks on c3ecd1f; rollback retains the schema and unrelated objects for least-privilege reapply. Source review found no blocking defect; new real-role/drift regressions await Soren container execution. No runtime acceptance or release. See docs/completion/be403-bootstrap.md.


QA-404 attempt 3: IN PROGRESS. Added real-cookie CSRF/session-continuity checks and unforwarded login duplicate/retry stimulus; fixed private/missing denial comparison after bounded adversarial review. 13 of 26 scenarios source-authored; all fresh runtime/visual results NOT_RUN pending Soren immutable integration scheduling. See docs/completion/qa404-attempt3.md.


QA-404 attempt 2: IN PROGRESS. Elara authored two additional real-backend Playwright cases (zero visible mailboxes and same-mailbox private drafts), preserving all 26 identities; 12 are source-authored and 14 remain explicitly unavailable. All new runtime checks and actual UI evidence are NOT_RUN pending Rowan schema repair and Soren immutable-SHA container scheduling. See docs/completion/qa404-acceptance.md.

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


## INT-401 versioned tool followup

INT-401 current-tools followup: new versioned BE01 runner authenticates 43 current dependencies, preserving all frozen records unchanged. POSIX/PowerShell dev commands are bootstrap/up/migrate/stop; unsupported seed/check removed. ADV-729 preceding independent review: 68 unique LOC, 0 new repair defects (0/KLOC), 2 inherited blockers (29.41/KLOC). Followup independent review and fleet Docker tests pending; application IN PROGRESS.

Created issue roster: #10 INT-401 Cassian OFF-401; #11 OPS-402 Soren OFF-402; #12 BE-403 Rowan OFF-403; #13 QA-404 Elara OFF-404; #14 FE-405 Mira OFF-405; #15 RES-406 Nadia OFF-406 (https://github.com/tanzeel-roseyco/elevateo-mail/issues). Root owns issues and testing. Five workers execute in named SSH-backed Orca terminals on fleet-02, supervised through append-only report/control files. Task-local Codex 0.160.0 model probe succeeded READY exit0 after 0.156.1 rejected gpt-6.1-sol; LOW/service_tier fast requested, billed tier not audited. Base c3ecd1f integrates all five lanes. Windows REA failed unsupported_provider (macOS utilities required); root uses supported Orca Computer Use with distinct evidence claims. No further ultrareviews/paid Devin. Root-owned Obsidian vault untouched. See docs/completion/int401-current-package.md.
BE-403 raw API boundary correction: IN PROGRESS. Rails instrumentation reads filtered params before actions and can parse malformed query/JSON or truncate raw JSON by forged Content-Length. ApiController now suppresses eager body/query parameter parsing before instrumentation; route parameters remain available and existing bounded raw validators still own body/query decoding. Existing duplicate-key, malformed-query and actual-byte-cap regressions must run on fleet-02.

BE-403 bootstrap guard regressions authored: exact private-schema DO block exercised in rollback-only disposable fixture transactions, including nonempty sentinel/OID/ACL representation, default-privilege creation leakage, owner CREATE/USAGE/ALL loss, foreign grants, wrong owner+empty ACL and atomic rejection. Full psql bootstrap and actual Rails migration bookkeeping remain distinct Soren gates; NOT_RUN for current revision.

BE-403 numeric underflow repair: ExactDecimal rejects nonzero JSON mantissas converted to zero by extreme BigDecimal exponents, while preserving exact decimals and true zero. Existing precise-version and exception-mode regression failures provide target coverage; current runtime NOT_RUN. Semantic guard order now follows supplied owner/ACL/owner-privileges/runtime sequence.
2026-10-14 FE-405 / GitHub #14: IN PROGRESS. Authored mobile search query/scope controls, focus-owned search edits with URL/history synchronization, and exact sidebar aria-current while preserving mailbox group styling. Independent bounded source and design reviews repaired one duplicated history defect; runtime gates and actual visual evidence remain pending through Soren/Elara. Baseline generated API check failed; regeneration is queued in Docker. See docs/completion/fe405-search-navigation.md.

FE-405 follow-up: navigation regressions now cover Drafts and reader ancestor semantics. CLI metadata confirms gpt-6.1-sol / low, Fast tier remains unverified (service_tier null). Runtime/visual acceptance still pending.
## RES-406 research checkpoint — IN PROGRESS

Nontechnical: recommend a calm shared mailroom with clear ownership, honest account checks and reliable drafts; no invented reputation promise or synthetic engagement.

Technical/strategic: official public sources retrieved 2026-10-14 support timestamped DNS/provider evidence, consent and suppression dispatch rechecks, team quota control and recipient-level event reconciliation within existing Rails/Postgres/React architecture. Current Resend policy is dated October 13, 2026. Research proposals and planned tests are in docs/research/instantly-gmail-rea.md. Historical missing-skill event at 441ac5b resolved: supplied REA v37 skill/references read. Root Orca Accounts semantic observation is reported; full captures/Gmail still partial. Current gateway has no health/consent/send routes; new health contract and acceptance gaps are advisory only. Citation recheck completed independently of root UI capture; independent review and all proposed tests remain pending. Root vault mirror pending. No app source, provider accounts, DNS or live mail changed. Root owns vault mirroring.
