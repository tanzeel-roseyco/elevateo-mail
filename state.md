### INT-801 integrated source candidate (2026-10-14)

The maintained web test Dockerfile now copies canonical `contracts/v2` beside V1 so Soren can generate and check draft.5 declarations without a task-only COPY overlay. The generated draft.5 declaration is still absent; no Docker build or web gate ran in this worktree. The recipe change followed root’s explicit integration instruction and remains pending Soren fleet validation.

OUT-824/SEQ-831 parallel phase: a noncanonical V2 proposal defines one inert campaign sequence draft at GET/PUT `/v2/outreach/campaigns/{campaign_id}/sequence`, with strict path/body equality, optimistic revision and replay, bounded steps/timezone, and deliberate 400/404/409 errors. No due claim, send eligibility, active route or canonical generated DTO is added. Maeve persistence and Celeste editor remain isolated pending authority review and fleet SQL/HTTP proof.

ADV090 found that two browser tests expected promise rejection from synchronous Zod input parsing; the assertions now check synchronous throws before dispatch. V2 browser gateways also parse the closed CollaborationError envelope, preserving real HTTP 409 `membership_conflict` and `operation_mismatch` results without replay; focused source regressions were added. Fleet execution remains pending.

ATT-823 config preparation now rejects `ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN` in every Rails process, including migrator, and optionally validates a dedicated 32-byte decoded `ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64` for API-to-gateway signing. This adds no Storage request, key value or active route. Source tests cover absent/valid/short/malformed HMAC keys and privileged-token rejection; Soren fleet verification and the gateway process remain pending.

Soren exact 7aa61be disposable PostgreSQL/Auth run passed migrations through Mailpit 00013 and reached isolated Minitest/Steep, then failed the full Ruby suites: 74 suite summaries, 518 runs/6,935 assertions/6 failures/17 errors/0 skips across 11 failing suites; Steep also reported 70 problems in 8 files. The first failure is a BE02 mail-search fixture hitting `app.prevent_owner_loss()` while deleting an owner membership; later fixture dependency, protected-write-guard, lock-timeout, missing-send-ID and snapshot-byte errors also appear. Cleanup passed. Authenticated HTTP, worker and browser gates were not reached; the stronger owner guard is preserved while owners repair fixtures/security seams.

The isolated preference gateway is now re-exported through `createV2Gateway()` to match Lyra’s proposed PersonalSettingsPage call names. The Lyra UI and Theo route remain unmerged/unregistered pending bounded review and fleet checks, so this adapter seam does not expose a production preferences page yet.

Rowan `d9d428e` replaced the IF-embedded Mailpit profile CASE that blocked exact 4a0ba0b migration with explicit permitted profile/hash pairs and added a real-DB regression. It is merged; Soren has been asked for a fresh disposable migration and targeted worker/schema/HTTP gates. No corrected-source runtime PASS is claimed yet.

Orion `8d98b42` source repair rejects bare reserved native origins as well as trailing-dot forms and is merged; focused fleet Rust/PowerShell checks and icon hashes are pending. This is source candidate only, not a native package or installed-app proof.

PREF-822 browser preparation now adds an unbound typed gateway for current-actor GET/PUT display name with strict input, revision ceiling, CSRF proof and response context/version binding. The route remains absent from canonical V2/Rails; Theo isolated backend, fleet type/unit/SQL/HTTP and independent review are pending. The integration also narrows the existing V1 simulated-send cancel mailbox ID through its current UUID validator for strict Steep typing, without changing the frozen request schema.

Soren exact integrated 4a0ba0b disposable PostgreSQL/Auth runner passed the repaired Outreach migration, then failed Rowan AddMailpitTestReceipt migration at `mailpit_test_receipt.sql:65-67` with a CASE-expression `PG::SyntaxError` at end of input. Later Ruby, authenticated HTTP and worker checks did not run; cleanup passed. Rowan owner repair and a new exact fleet rerun are pending.

Elara `f060f18` strict worker/SMTP type repair and Dorian `82d438e` controller-test lint repair are merged into the isolated core source. Cassian added pinned `net-smtp` to shared Steep libraries for the declared SMTP transport; these repairs have no exact integrated fleet static PASS yet.

ATT-823 parallel phase: a noncanonical V2 proposal defines message-scoped attachment metadata pagination and clean-only authenticated byte streaming, with explicit 400/404/423 error mapping. No scanner, private Storage adapter, list repository, active route or generated DTO exists; browser upload and draft-send attachment remain unsupported. The frozen core candidate is unchanged.

PREF-822 parallel phase: a separate noncanonical OpenAPI proposal defines session-derived GET/PUT `/v2/me/preferences` for display name only. It is absent from the active Rails registry and canonical V2 draft.5, pending Theo source SHA, review and fleet proof; current core candidate remains frozen.

Dorian `ebfe780` repaired the SQL predicate concatenation that produced the exact fa3082a `ENDAND` migration failure and added a migration policy regression. It is merged in the current isolated candidate; the corrected disposable database run has been requested from Soren and has not yet returned.

Soren exact fa3082a disposable PostgreSQL/Auth run failed during CreateCampaignFoundation migration at line 174 with `PG::SyntaxError` near `ENDAND`; backend Ruby, SQL/HTTP and worker gates did not run, and task resources were cleaned. Dorian owns the SQL interpolation repair. Fable `2ce4c54` stale consumed Outreach error policy/tests were cherry-picked as `d89b4cd`; this later frontend source has no full fleet pass. Root requested a maintained web Dockerfile V2 copy; Soren, its recipe owner, received the exact change request.

Soren’s exact older f210b5b frontend fleet gate passed API generation/check, lint, typecheck, 791 units and build; draft.5 consent/UI source still requires its own rerun and generated declaration.

V2 draft.5 adds a guarded manual lead consent action and redacted detail evidence projection to complete the inert draft-to-lead source journey. The browser gateway validates attestation input and exposes the detail read; no send route or independently verified consent state exists. Fleet DTO generation and exact integrated tests remain pending.

Current isolated source includes Dorian's monotonic consent-history follow-up and Cassian's strict V2 operation allowlist. Account/worker routes remain gated. Exact latest-source fleet web, DTO, backend SQL/HTTP and browser checks are pending; the prior 8eb840d web unit and 45be80b backend fixture failures are not acceptance.

Cassian merged the Foundation, Frontend, Delivery, Native, QA and Mail owner candidates in the isolated `completion-cassian-int801` worktree. A validated active-operation registry source-registers guarded V2 organization grants/roster, inert Outreach reads and draft writes, and a scoped direct-message read; no V2 route can dispatch mail or expose the disabled worker proposal. Canonical V2 operation statuses and the Rails allowlist are checked for exact agreement in source tests. Fable binds the production Outreach adapter and Mira’s direct-message UI through the typed App route capability. Account, worker status, native authentication and inbound ingestion routes remain gated. Soren’s fleet V2 contract/route and fake-ingress unit checks passed on ba6151b (3/18, 5/13, 6/32); the earlier 696549b JSON failure remains recorded. Exact 45be80b DB migration passed through inbound, then full Ruby suites failed on cross-migration fixture dependencies; cleanup passed and SQL/HTTP acceptance was not reached. Exact 8eb840d web check:api, lint and typecheck passed, then Vitest recorded 779 passed/10 failed across Fable and Celeste suites; build was not reached and cleanup passed. Owner repairs and a later integrated web rerun remain pending. Canonical V2 draft.4 declarations, browser acceptance and latest integrated web/HTTP checks remain pending. No integrated acceptance, live sending or production release is claimed. See `docs/completion/cassian.md` and owner records.

### INT-801 additive V2 interface candidate (2026-10-14)

Cassian prepared disabled organization grant, simulation-only outreach and internal worker-status V2 interfaces over `bbf2353`. Frozen V1 contracts and Rails routes remain unchanged. The V2 route registry fails closed until owning controllers and authorization gates are ready. Source and tests are committed for fleet Docker validation; runtime acceptance and generated web DTO adoption remain pending. See `docs/completion/cassian.md`.

Integrated database evidence at Cassian 45be80b exposed a legacy draft down/reapply probe blocked by BE03's real FK. Theo's transaction-local dependency assertion and roster cursor typing correction are source candidates; Soren fleet rerun and isolated destructive-suite proof remain pending.

ADV052 repair removes a false PASS path in the default-privilege probe; integrated runtime and separate BE02-only down/reapply remain unverified.

PREF-822 source candidate adds display-name-only per-user preferences with optimistic revision, current session/organization authority and no credential fields. Cassian V2 route/DTO, Lyra UI adaptation and Soren fleet database/HTTP evidence are pending; frozen core candidate unchanged.

ADM-803 roster/grants/audit source was corrected against Soren's exact `fa3082af` Steep/RuboCop errors; fleet rerun and independent bounded review remain pending. See docs/completion/theo-core-static-repair.md.

# Project state

SEND809 exact integrated `7aa61be4649ca251c3faff368ba61dfa7e313708` passed real PostgreSQL migrations but the affected send database suites had eight cancellation guard setup errors, two fixture lock timeouts, three mismatched Mailpit snapshot approval errors, and one binary/UTF-8 oracle failure. Rowan committed bounded test fixture repairs `49aaad8`, `f9f13a0`, `3fe86b7`, `bf2748f`; Soren fleet rerun is pending. Production write guard, lease, approval and Mailpit authority were not loosened.

### Fable FE-805 shell/sidebar/brand candidate (2026-10-15)

Isolated on fleet baseline `bbf2353`, branch `completion/fable-fe805`; not integrated. Adds the authentic Elevateo mark under `apps/web/public/brand` (hashes match root's provenance), a `BrandMark` primitive on a fixed dark tile, a pure validated feature registry with an Outreach seam for Celeste, and a rail split into independent Personal and Outreach landmarks with no global switcher. Existing routes, session gate, drawer names and frozen contracts are unchanged. Registry, sidebar and shell tests are added but **not executed**; Docker lint/type/unit/build and visual evidence are requested from Soren/Tessa. See [Fable record](docs/completion/fable.md).
FE808 Personal Settings candidate: current actor display-name load/save UI and five regression cases are authored on Lyra's isolated branch. Theo's PREF822 route and Cassian's canonical V2 DTO/gateway methods are pending agreement; Soren fleet Docker tests and browser acceptance are NOT_RUN. No timezone persistence or live-mail capability is claimed.
FE808 Personal Settings candidate: current actor display-name load/save UI and six regression cases are authored on Lyra's isolated branch. Theo's PREF822 route and Cassian's canonical V2 DTO/gateway methods are pending integration; Soren fleet Docker tests and browser acceptance are NOT_RUN. No timezone persistence or live-mail capability is claimed.
FE808 Personal Settings candidate: current actor display-name load/save UI and seven regression cases are authored on Lyra's isolated branch. The ADV089 cancellation proof gap has a source-only repair using the real protected-request hook, delayed read/write replies, observed aborts and new-actor revision checks. Theo's PREF822 route and Cassian's canonical V2 DTO/gateway methods are pending integration; Soren fleet Docker tests and browser acceptance are NOT_RUN. No timezone persistence or live-mail capability is claimed.
Nadia attachment backend candidate adds held-by-default quarantine metadata and a bounded service. No scanner, route, private Storage adapter, or fleet validation is present yet; see `docs/completion/nadia-attachments.md`.
Nadia attachment backend candidate adds held-by-default quarantine metadata, a bounded service, restricted private Storage adapter, and scanner verdict port. No scanner, active route, private byte gateway, or fleet validation is present yet; see `docs/completion/nadia-attachments.md`.
Nadia attachment backend candidate adds held-by-default quarantine metadata, a bounded service, restricted private Storage adapter, attempt-fenced scan worker and ClamAV INSTREAM client. No configured scanner, active route, private byte gateway or fleet validation is present yet; see `docs/completion/nadia-attachments.md`.
FE806 inbound attachment UI candidate: an optional thread reader port follows Cassian's noncanonical list/download proposal, with clean-only download, held/blocked states, explicit retry and owner-abort cleanup. There is no active browser route, scanner verdict writer, or draft/send attachment binding, so the fallback remains the existing attachment count. Source tests are authored but not run; Soren fleet Docker and browser acceptance are pending. See docs/completion/mira.md.

ATT843 candidate repairs the attachment UI's overlapping A/B download busy-state race with per-ID pending ownership and an authored deferred-resolution regression. Soren fleet Docker has not yet run this candidate; no live byte access is claimed.

Application IN PROGRESS — R24 isolated BE03 candidate (2026-10-14). Root authorizes implementation on baseline `03ae770c56271cd8236726bfd8fe63248e81283d` in parallel with BE02 acceptance. BE02 remains OPEN/unaccepted; integration/release gated. S1+S2 priority: saved draft -> consistent review -> human approval -> durable queued intent. Canonical additive `contracts/v1/openapi.json` version `1.0.0-send.1` is prepared; every baseline C/D operation/component and original fixture is preserved.
### Mira BE03 UI isolated R24 implementation (2026-10-14)

Root authorizes isolated BE03 implementation over `03ae770` while BE02 remains OPEN/unaccepted and integration/release gated. Mira owns the send gateway, generated web artifacts after canonical contract, and review/approval/status UI. The S1/S2 UI renders full saved plaintext content, explicit correspondence approval, original-binding uncertain retry, and server-owned simulated status. Paired corrected exact canonical contract `aa35c3d`; source607fcb2c passed Docker generator/check/lint/type and8files/260affectedtests; independent functional/data/design reviews found0confirmeddefects. Exact generated artifact and strengthened tests are present, follow-up sourcee037cb9b passed Docker APIcheck/lint/type/full37files660tests/build/fixture-isolation checks; bounded follow-up reviews found0confirmeddefects. Final fixture-only pre-abort repair8f6f5bf8 passed lint/type/9files174affectedtests and independent40LOC repair review0newdefects; seven exact owned containers independently absent, shared image/Lyra18140 preserved; actual visual/integrated validation remains pending; no completion or delivery claim. Canonical source is `contracts/v1/openapi.json`. See [Mira scoped evidence](docs/completion/be03-mira-r24.md).
R24 contract review correction: three unique MEDIUM defects repaired in source (two non-ready schema limits and preservation manifest reseal). Independent repaired-source re-review and fleet Docker regressions remain pending; no runtime PASS.

Contract source `013fe663563165a986f866ca9119b8b49c4332bf` passed fleet pinned-bundle Docker regressions (8 runs/78 assertions/zero failures/errors/skips, exit0) and affected lint (1 file/zero offenses, exit0). Four independent review findings and one lint-derived warning were repaired and re-reviewed; dedicated design review found no additional defects. Initial setup failures and lint history remain recorded. All task containers independently absent; shared images/persistent resources/Lyra18140 preserved. Reviewed SQL persistence source is assembled in the isolated candidate; reviewed API source and fail-closed control dependency are also assembled; real SQL/Auth/API runtime, UI intake, generation and S3-S5 lifecycle remain pending. Root R21f closure and six-worker deployment registry are integrated as documentation-only lineage; actual vault remains untouched. No BE03 completion, live activation or vault synchronization claim. Requested Fast billing remains unverified. See [R24 record](docs/completion/be03-r24-contract-integration.md) and [Docker receipt](docs/completion/be03-r24-contract-docker.json).

R24 Elara worker branch: root explicitly authorizes isolated BE03 implementation in parallel with BE02 acceptance; BE02 remains OPEN and integration/release gated. Offline control/driver seams are source-reviewed; standalone fleet Docker units passed14runs/125assertions on exactfc912d7 with bundled Minitest5.25.4. Final exact3d7b61f pinned bundle units14/125, strict Steep and affected lint6files passed in fleet Docker; initial tuple-inference failure and repaired review defects remain recorded. Real SQL integration remains NOT_RUN; no integrated runtime acceptance. See [worker record](docs/completion/be03-elara-r24-worker.md). This branch note supersedes the historical BE03-closed sequencing below.
R24 continuation: prepared a bounded real HTTP/Auth/PostgreSQL S1/S2 fixture under `ops/tests/be03`; source/design review repaired one MEDIUM oracle gap and one LOW typed-interface defect; fleet boundary3/19, strict two-file typing and affected lint PASS exit0. Real database runtime NOT_RUN. Soren owns execution and exact disposable lifecycle cleanup. See [fixture instructions](ops/tests/be03/README.md).

R24 Nadia BE03 API isolated work is explicitly authorized by root while BE02 remains OPEN and integration/release gated. S1/S2 Rails API source and regression fixtures are committed; routes default disabled. Independent source/design reviews found two MEDIUM defects and one LOW test gap, repaired and re-reviewed. Capped fleet API fixtures PASS22runs193assertions, strict Steep and affected --lint PASS after preserved initial failures; exact own container cleanup verified. Integrated SQL/Auth runtime remains pending. See [Nadia API evidence](docs/completion/be03-nadia-r24-api.md). Historical R23 BE03-CLOSED wording below is superseded only for isolated implementation.

## Historical R23 checkpoint — sequencing superseded only for isolated R24
Demo visual copy corrected: ASCII separators, explicit paragraph line breaks; image `4ce7aefe738e` on private18141. Docker build/typecheck + three targeted tests pass; independent design review has zero remaining defects. Original18140 retained.

Synthetic demo checkpoint: separate `demo.html` on private fleet port 18141 now supplies a populated fictitious team inbox and drafts. Docker typecheck/build, lint and 632 tests pass; coordinator visual/adversarial gates pending. Superseded task-owned demo image/cache ancestry cleaned; both private previews retained. See `docs/completion/fe-preview-01.md`. Original 18140 fixture preview remains available.

Private synthetic frontend preview is running; Docker lint/typecheck/build and 629 tests passed. Root visually inspected it. Isolated BE03 work is authorized in parallel; integration/release still require BE02 acceptance. See [preview checkpoint](docs/completion/fe-preview-01.md).

Application IN PROGRESS — R23 documentation checkpoint (2026-10-14). BE02 OPEN/unaccepted; BE03 CLOSED until root accepts BE02. Application completion has priority; R&D remains separate. Invitation source is exact 51ca5d2eadd74b7ac4c1a2f5f82cd49323b15dc5; core/empty/revoked/logout evidence belongs to exact 86036e276df9c3294206e6bfa14d478c223c54dd. Observer remains OFF. Production, contracts, observer boundary and four Docker recipes are unchanged.

R19 core login/read/persisted-draft/search PASS stands with restoration, authenticated HTTP, worker drain and cleanup. Its sixteen screenshots do not establish complete visual acceptance: search was loading; settled-search evidence remains in R12. R12's 21 PNGs and R18 conflict/revocation PASS stand. R18 logout FAILED, cause UNKNOWN; F2 memory-only recovery limitation remains OPEN.

R21d build/TypeScript compile/privacy regression PASS. First empty visual partition failed setup with MODULE_NOT_FOUND ./quiet-reporter.ts: zero cases/zero PNGs; seven partitions not admitted. R21e CLI reporter override was insufficient because config resolves its reporter first: zero cases/zero PNGs, seven not admitted. Exact cleanup/independent absence PASS, lease FREE. R21f fresh runtime completed all eight F1/F2 partitions: four desktop PASS with six retained private PNGs; four mobile FAIL with zero PNGs, all attempt zero. Build, privacy regression, compile and runtime dependencies PASS. Launcher exit 101; original queue ledger stops at seven entries, but the eighth lifecycle has its own final receipt. All eight cleanup receipts and exact independent resource absence now PASS; task compile image removed and lease FREE. See [reconciled closure](docs/completion/jules-r21f-closure.md).

Remaining: diagnosis/fix of four mobile empty/revoked failures and root manual visual acceptance; R22 invitation affected unit/lint/type checks, frozen genuine SCN-AUTH-006-P and separate supplemental keyboard/visual evidence on exact51ca; corrected logout on exact86036. Root owns acceptance and actual vault; Jules supervises Soren fleet runtime; Cassian OFF401 / INT-403 owns this documentation integration. No new research gate or repeat of passed unchanged suites is implied.

Project obsidian.md and the remote pending record are NOT synchronized to the actual vault. Actual Obsidian remains 134117 bytes, SHA256 de210bf0205ae28125d2c6125ff18fdbac87f947b6e2f92fff89b4b09e54b372, unchanged because C: is full. Automatic approval review rejected deleting a verified duplicate as “blocked by policy”, with no detailed reason; no deletion or retry. Requested LOW/Fast is not verified effective billing. See the R23 journal for receipt hashes, process history and BE03 readiness; R18 seal and failed histories remain linked.

Evidence: [R23 journal](docs/completion/int403-r23-application-state.md), [R18 seal](docs/completion/int401-r18-handoff.md), [history](docs/completion/int401-status-history-20261014.md).

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

FE-PREVIEW-01 final checkpoint: corrected synthetic demo remains private on 18141/demo.html (image 4ce7aefe738e); original fixture 18140 retained. Root actual reader paragraphs and mobile 375px draft-save v4 visually passed. Bounded Docker Playwright inbox-to-reader click passed both with and without ?qa=345d0f9; no router defect reproduced and no source change made. Disposable readonly browser container removed via --rm; no build, database lease, mounts or unrelated cleanup. Ada independent copy review: 0 defects / 9 changed LOC (0 per 1000); dedicated design review: 0 defects / 195 reviewed LOC (0 per 1000). All mail and actions remain synthetic and memory-only.

Root actual visual receipt: desktop reader paragraphs PASS; Drafts navigation, edit and keyboard Save from v3 to v4 PASS; responsive 375x812 saved draft form PASS. Evidence files: C:/Users/Tanzeel/Code and projects/Elevateo Mail Delivery 2026-10-14/evidence/demo-draft-saved-v4.png and demo-mobile-draft-saved-v4.png. Initial Orca no-action with outer query was not reproduced in Docker; no application defect claimed. Active tunnel: Orca native terminal term_841bcb84-4b46-43ba-9df4-5577ed70b7b3 forwards both 18140 and 18141; old process tunnels are dead. Both preview containers remain retained.

R24 assembled SQL/API/UI plus isolated synthetic demo candidate `1429f1d` preserves exact owner ancestry. Narrow tracked runner repair adds privileged bootstrap-send before migration00007 and admits required test/sends suites. Runner regressions and independent functional/design review pending; integrated DB/Auth/HTTP/UI NOT_RUN. Four Docker recipes unchanged; BE02 OPEN and release gated. See docs/completion/be03-r24-contract-integration.md.

R24 source verification on37861fc: all baseline C/D operations/components and four existing Docker recipes structurally/byte unchanged; owner UI/demo/HTTP source seals preserved. Runner functional/design0defects; application runtime remains pending. Complete-history clone bundle published to root; BE02OPEN/releasegated.

R25 runner regressions exact37861fc: four cases PASS exit0 in pinned fleet Docker; initial task tmpfs EXEC omission produced two failures and is retained. Both exact containers independently absent; source unchanged, shared image/previews retained. Integrated1429f1d DB migration00007 FAILED permission denied for preserve_consumed_draft; DB suites/HTTP NOT_REACHED. Rowan owns narrow correction. Application IN PROGRESS; BE02 OPEN/release gated.
Rowan source hypothesis for integrated migration1429f1d exit1 (exact failing batch under reconciliation with Soren): send-owner blanket private-function revoke touches existing-owner bridges. Restrict revoke to current owner functions; bridges retain explicit original-owner revoke/grants. Added actual-role grant rerun/all-private-runtime-denial/bridge-owner/atomic-queue regression. Repair awaits bounded functional/design review and fleet runtime; original failure retained, no acceptance claim.

Reviewed repair7934218 assembled with owner bytes unchanged; functional/design32changedLOC0defects and affected fleet syntax/lintPASS belong to owner source. Integrated DB repair verification pending; original migration failure preserved.
Rowan source hypothesis for integrated migration1429f1d exit1 (exact failing batch under reconciliation with Soren): send-owner blanket private-function revoke touches existing-owner bridges. Restrict revoke to current owner functions; bridges retain explicit original-owner revoke/grants. Added actual-role grant rerun/all-private-runtime-denial/bridge-owner/atomic-queue regression. Repair awaits bounded functional/design review and fleet runtime; original failure retained, no acceptance claim.

Repair7934218 independent SPEC-SQL05 functional/SPEC-SQL06 dedicated design each32changedLOC0actionable/0KLOC (overlap nonadditive). Actual fleet Ruby syntax1+canonical RuboCop --lint1 PASS exit0; task containers independently absent/sharedimage retained. Initial accidental all-cops check exit1/66styleoffenses retained, corrected command required no source edits. Real migration/DB rerun pending; original1429 failure remains evidence. See be03-rowan-r25-lightweight-receipt.json and incoming rowan review manifest.

R25 checkpoint: grants repair resolved actual migration/second-version replay on7e253492; firstapprovalDB14cases133assertions1FAIL Unicode/control vector, laterSQL/HTTPNOT_REACHED. Exactcleanup/sourceunchangedPASS. Earlier draft_bridge attribution corrected to grants.sql from orderedlog. See docs/completion/be03-r25-delivery-report.md; no acceptance claim.
Mira scoped BE03 browser continuation: `tests/acceptance/be03-ui/` prepares actual desktop/mobile client interaction against an explicitly SIMULATED memory gateway. Awaiting Cassian ONE candidate SHA and fleet execution; runtime/visual NOT_RUN, BE02 OPEN. No product source change. See scoped harness README; central acceptance remains Cassian/root-owned.

Mira browser checkpoint: immutable integrated1429f1df with harness3d6cfb5 passed10actual Chromium headless-shell cases/22PNGs (desktop/mobile), TypeScript/lint0. Visual inspection found LOW synthetic-seed inconsistency (unsent canonical null recipient appeared in ready review); correction seeds only private memory valid recipient, leaving product/canonical fixtures unchanged. Corrected harness re-review/rerun pending; real SQL/HTTP and root visual acceptance separate, BE02 OPEN. Failed browser/container setup retained.

Mira scoped browser harness now also covers actual send-status loading, unavailable and unknown rendering; all remain SIMULATED/client-only. Final14case desktop/mobile run pending on integrated1429f1df; product sources untouched. Private recipient repair independently re-reviewed0new defects.

Mira final scoped browser evidence: exact integrated1429f1df + reviewedharness3bc68cb, TypeScript0/lint0/actual14browserPASS (zero failed/skipped/flaky),30desktop/mobilePNGs. SIMULATED client-only; no SQL/HTTP/worker/cancellation proof.2LOW harness findings repaired/re-reviewed, current177LOC0remaining. Completed/probecontainers independentlyabsent; soleprivate18142preview retained at root11:26:33request pending actualvisualinspection/cleanup. See docs/completion/be03-mira-r24-browser.md and sanitized runtime receipt; BE02 OPEN, no completion/release claim.
Actual7e migration9versions+secondnoopPASS; approval14/133/1FAIL exactUnicode. Soren diagnostic proves all13scalar canonicalbytes equal; code send_not_ready because PostgreSQL C-collated control class includes U0085/U009f. Replace class with explicit U0001..U001f/U007f ranges (PostgreSQL text cannot store U0000); unchanged exactUnicode success oracle plus64 subject/name forbidden-scalar probes. Repair awaits bounded review/actualfleet checks; original failures preserved.

Reviewed f7fc830 explicit C0/DEL correction is assembled; functional20changedLOC0/design74reviewedLOC0 and affected fleet syntax/lintPASS belong to owner source. Integrated correction verification pending; BE02OPEN/releasegated.
Repairf7fc830 functional SPEC-SQL05 zero/20changedLOC; dedicateddesign SPEC-SQL06 zero/74reviewedLOC (nonadditive overlap). Fleet syntax1/canonical --lint1 PASS exit0/exactcontainerabsencePASS, sharedimage retained. RealDB successor pending. Diagnostic7e yielded1run7assertions1FAIL while all13synthetic scalarbytes matched; actual code send_not_ready and C1 control-class booleans true established cause. No weakened assertion/claimed queue completion.

### R25 approval reload recovery candidate

Isolated on exact integrated base `42cfcffc1a97fbf8b3fd1a6caca5bbd6f62d839e`; not integrated or published. Root authorized bounded nonsecret operation metadata after Lyra checked FE-01 synthesis and binding standards. Only actor/org/mailbox/draft IDs plus original operation/version/digest/attestation are retained in tab-scoped sessionStorage. No mail content, recipient, subject, CSRF, session proof or approved receipt is persisted. A strict versioned 20-entry/16KiB boundary rejects corrupt, duplicate, unexpected or inconsistent metadata. Reload restores unresolved attempts as uncertain; fresh authorized review and explicit original retry are required. Persistence and exact readback precede POST; unavailable storage fails visibly before submission. Logout/principal changes clear metadata; failed cleanup blocks recovery until cleanup succeeds. Late outcomes never recreate cleared/unmounted bindings.

Regression source covers reload with a newer review/fresh proof, original metadata replay, blocked persistence before POST, owner separation, corrupt/oversized/extra-field input, entry bounds and write/remove readback failures. Docker tests, independent functional/design review and actual UI validation are pending. No backend, frozen wire contract, fixture or dispatch behavior changes.

R25 integrated125f939 actualSQL PASS47cases569assertions and realAuth/PostgreSQLHTTP PASS42assertions; migration/secondno-new-versionPASS, exactcleanup/allindependentabsence/source3914unchanged/leaseFREE. Root-source-GO Ada1651fdc metadata-only reload recovery is assembled with owner bytes unchanged, but genuine lint1 and unit/build setupfailures remain pending corrected owner checks; no recoveryruntime acceptance. Backend125f evidence does not verify this frontend successor. BE02OPEN/releasegated.

Settled125f939 S1/S2 SQL+HTTP receipt PASS:47cases569assertions across8SQLsuites +42genuineHTTPassertions, all exits0; cleanup/all7absence/source3914unchanged/leaseFREE. RecoveryUI successor8d2ca1b sourceGO but lintfinding pending; no acceptance beyond pinned evidence. Report docs/completion/be03-r25-delivery-report.md.
Actual Soren integrated125f9394716d2f933d32d6191f33d00fd353b025 DB+HTTP PASS: eight DB suites47runs569assertions0failures/errors/skips, all exits0; real HTTP/Auth/Postgres S1S2 fixture42assertions exit0. New send suites24runs335assertions; affected BE02 draft suites23runs234assertions. Migration9versions/secondinvocation no newversionPASS. Both runtime defects (mixed-owner blanket revoke; C1 control-class rejection) fixed and regression-tested. Exact taskcleanup + seven independent absence checks PASS,3914sourcefiles bytes/modes unchanged, leaseFREE. No S3-S5/workerdispatch/cancellation/release claim; BE02OPEN and root gates remain. Safe receipt: docs/completion/be03-rowan-r25-db-http-receipt.json; Soren originalreceipt SHA2561c5640bf1453db24727a16626087907e14766d263d6134d8a18fe0d94b273082. No credentials/payloads included.

Root reported actual isolated UI visual acceptance11:33UTC on exact1429f1df/harness3bc68cb: plaintext review->attest->queued desktop/375mobile readable. Mira14browserPASS/30PNGs/type0/lint0 remain client-only. Allcompletedcontainers/helperdependencies cleaned; own18142preview explicitlyretaineduntilfinaldelivery atroot11:33instruction. BE02OPEN and realserverclaims separate; Ada reloadrecovery successor not yetadmitted. See scoped browser receipt.

R25 approval recovery verification follow-up: fleet strict typecheck, corrected scoped runner (22 tests across three files), and production build passed. Fleet lint identified one effect-cleanup ref-capture defect; cleanup now captures this provider's original map, preserving its synchronous unmount/late-outcome guard. Mira owns Docker re-verification; no host tests or duplicate Docker execution. Independent functional and actual UI gates remain pending.

RootSOURCEGO reviewed7a7860e captured-ref lint repair assembled without owner source edits; functional83LOC0/design8changed62context0. Mira owns exactsuccessor lint/type/fullunit/build and reloadbrowser. Backend SQL/API identical tested125f939; recovery runtime stillpending. F2 unsaved-draft/content recovery remainsOPEN; this only restores nonsecretoriginalapprovalmetadata.

Cassian manifest reconciliation: contract-lock now seals actual generated client bytes and pinned fleet generation/125f939S1S2DB+HTTP evidence; README reflects proven scope. Canonical openapi/fixtures/C-D structures unchanged; no regeneration, added routes or capabilityactivation. Recovery successor3a709691 checks stillMira-owned/pending; BE02OPEN/releasegated.

SEC-802 candidate: migration 00008 and organization-role database fixtures authored. Owner enrollment, legacy mailbox mutation ceiling/consent patch, Soren Docker tests, bounded review and integration remain pending. See `docs/completion/sabine.md`.

SEC-802 continuation: legacy membership mutation now requires current role, classified mailbox, explicit ceiling and personal-owner consent; grants read routine and migrator-only unbound bootstrap source are drafted. Existing BE02 fixture adaptation, V2 role enum alignment, Docker security/race tests and independent review remain pending.

SEC-802 also includes migrator-only mailbox policy bootstrap source with no real UUID values; it remains uninvoked and unverified in Docker.

SEC-802 independent review found a personal-owner last-manager defect in the first patch; source repair and regressions are present, but fleet runtime and re-review remain pending. Outreach draft role check is source-only and does not authorize send.

SEC-802 role demotion now preserves the last effective team manager through mailbox revision locks; race execution remains pending.

SEC-802 adds an outreach content-read authority routine matching the protected draft-write role matrix; Dorian integration and fleet tests remain pending.

SEC-802 atomic organization role audit source is added: changed-role events only, fixed operation label, owner/admin paged metadata read. Runtime evidence and Theo/Cassian integration remain pending.

SEC-802 fleet `45be80b`: migration PASS; organization and legacy membership/draft Ruby cases failed. Fixture repair adds current organization role, mailbox classification, ceiling and capability rows for legacy mailbox tests, and scoped cleanup before memberships are removed. New source has not yet passed isolated or order-varied fleet Docker suites; production permission policy is unchanged.

SEC-802 draft concurrency fixtures now state the same explicit disposable authority and use scoped organization cleanup; Theo retains ownership of separate draft schema dependency probes. New draft race runtime remains NOT_RUN on this source.

SEC-802 follow-up to Rhea's 2 MEDIUM helper cleanup findings: membership and draft local cleanup now runs inside failure-safe inherited teardown after closed fixture logins are reopened and the advisory lease is reacquired. New tests check closed API/admin cleanup and preservation of an injected draft save error; no fleet result is yet claimed.

SEC-802 Felix REV874 found one further MEDIUM source defect: a failed rollback could replace the original cleanup failure. The fixture-only rescue now preserves the first exception and has a deterministic double-fault regression; Soren Docker and repair re-review remain pending.

OUT-804 actual-role policy assertions now cover API positive, denied app-read proof and cross-actor digest negative on the existing disposable database fixture; authored source is not fleet-executed.

ATT838 Rails configuration now accepts only the internal http://attachment-gateway:4708 endpoint paired with the dedicated 32-byte HMAC key; the gateway client/route and fleet checks remain pending.
FE807 `fa3082a` seam reviewed statically: manual consent adapter and detail GET match owner method signatures. Denied/409 replay UI assertions are authored, not fleet verified.

FE807 sequence source candidate adds `/outreach/campaigns/:campaignId/sequence` with inert draft/held editing under optional gateway methods. GET 404 is treated as no accessible draft, without asserting existence; a tentative create still requires authoritative backend access. Soren fleet type/unit/build and real V2 HTTP/browser checks are pending.
MAC-814 continuation: Orion shell d13c985 imported with lineage; macOS DMG overlay and preflight release script authored. No Mac runner, credential or native execution evidence; installed-app authentication remains fail closed.

MAC-814 sequence draft primitive is source-only and untested: timezone/DST resolution, occurrence identity and stop signals. Persistence, API contract, final consent/suppression checks and worker integration remain pending root/Cassian/Dorian agreement. No sending path was added.
# MAC-814 isolated sequence draft persistence

Migration 00016, DTO validation, transactional replay/version repository and inert occurrence schema are candidate source only. The SEC802 helper EXECUTE role seam and fleet Docker tests remain open; no sequence delivery path is enabled. See [candidate record](docs/completion/maeve-sequence-persistence.md).

PREF-822 candidate integration now registers session-derived GET/PUT `/v2/me/preferences` in canonical V2 draft.6 and connects the personal settings UI to the typed gateway. This is source-only: generated draft.6 DTO, bounded independent review, real PostgreSQL/API-role checks, HTTP and browser evidence remain pending Soren/root.
Exact 35273ba isolated fleet checks now pass input 5/8, repository 8/31, affected lint 9 files/0 offenses and full Steep. Controller cases, disposable DB/RLS and integrated HTTP have not been established by this receipt.

OUT-804 source now filters account pages and detail through `app.mailboxes` visibility in addition to tenant/account RLS. This prevents a sales outreach role alone from exposing a private mailbox account after its mailbox membership is revoked; focused regressions are authored, exact fleet execution pending.

OUT-804 review follow-up source includes consent-preservation flag in operation replay fingerprint; malformed attestation now correctly has no lead UPDATE oracle; caller-supplied actor is rejected. Migration 00009 binds consent event actor to the current DB user, requires mutation resource existence, and refuses populated rollback. Current lead actor changes remain controller-derived; real API-role forged-actor/phantom/rollback and role/private-mailbox probes are requested from Soren. Human attestation status display is being reconciled with Cassian/Celeste.

OUT-804 current lead consent fields now reference the append-only operation event. Repository inserts the current-user event before projection update within the protected transaction; lead RLS checks event email/status/source/time/actor for noninitial states. This is source-only until a real API-role DB/HTTP probe validates it. FE807 retained `granted` as a backend record label with manual attestation visibly unverified; no send eligibility follows.

OUT-804 Ada design follow-up adds lead version to each consent event and RLS match, plus a version-advance trigger. Unchanged same-address edit uses a locked read and mutation ledger without incrementing the lead version. A withdrawn-to-old-granted event replay should be denied by the version mismatch; real disposable DB and transaction rollback tests are requested.

OUT-804 Ada second review found a linked unknown lead could clear its link and that exact event-version RLS blocked metadata-only updates. The trigger now preserves existing links and requires an event for any consent/email/link change at the new version; RLS permits a matching older event when only unrelated metadata and version advance. Fleet DB proof remains pending.

OUT-804 Rowan ADV044 account review found same-org shared mailbox visibility did not prove the actor's mailbox membership. Account page/detail/create/update and migration account RLS now require current `app.mailbox_memberships` as well as mailbox visibility and outreach role. This source-only repair awaits valid-digest allowed/cross-actor denial/revocation fleet evidence and review; account routes remain gated.

OUT-804 Ada ADV071 test proof follow-up adds an authenticated API-role disposable DB fixture. It uses the existing session/tenant/protected-write harness to test metadata-only lead update and link-clear denial, cross-actor account denial with owner-member visibility, and a stale `Repository#replace` that must roll back its preinserted event. The earlier supabase_admin trigger checks remain supplemental. Exact fleet execution and integrated HTTP remain pending.

Soren exact integrated fa3082a migration 00009 failed with `PG::SyntaxError` at generated `ENDAND` between role and integrity predicates, before SQL/HTTP tests; cleanup passed. The template now inserts explicit whitespace and a generated policy test guards the token boundary. This source repair is NOT_RUN until Soren's exact rerun.

Exact fa3082a full RuboCop reported two OUT-804 controller test `Lint/AmbiguousBlockAssociation` offenses; source now parenthesizes the assertions. No owned Steep diagnostics were present in that lint receipt, and the new source still needs Soren's affected lint/full Steep rerun.

Coordinator OUT839 role audit found the campaign RLS policy applies to member role `elevateo_app_read` while SEC802 grants outreach proof execution to `elevateo_api`. The application fixture connects as `elevateo_api`; new disposable tests assert that current role on a positive write, fail-closed direct `elevateo_app_read` evaluation, and cross-actor digest denial. Actual role behavior awaits Soren fleet execution; no broad grant is introduced.

ADV093 narrow repair dependency: when execution switches to `elevateo_app_read`, 00009 RLS needs EXECUTE on `authorize_outreach_content_read` and 00016 sequence needs EXECUTE on `authorize_outreach_draft_write`. The isolated OUT-804 checkout lacks SEC802 access.sql, so Sabine/Cassian must integrate these two protected-helper grants. Authored role tests now require genuine marker success and copied-digest/no-marker rejection; no runtime PASS is claimed.

OUT839 integrated SEC802 grants allow only elevateo_api and restricted elevateo_app_read to execute two existing protected outreach helpers used by campaign/sequence RLS; PUBLIC and worker revokes remain. Dorian actual-role positive and copied-digest negative tests are source-only pending fleet PostgreSQL proof.

ATT838 Rails now has a pure fixed-field HMAC request builder for the private read gateway: exact ordered JSON, UUID/digest/hint checks and a 0–30 second expiry. It is unbound from any public route until Sabine gateway source and Soren fleet evidence are ready; no Storage token or live bytes were used.
