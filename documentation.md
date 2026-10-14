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

V2 draft.5 adds `recordOutreachLeadConsent` with strict source/time/attestation input and a redacted lead detail response. The route reuses Dorian’s guarded controller and the browser gateway binds Celeste’s typed manual-evidence UI interface. This remains unverified source pending fleet HTTP, SQL, web and browser checks; no live sending is enabled.

Latest INT-801 source retains the frozen V1 OpenAPI bytes and activates only the reviewed V2 source allowlist. Dorian's monotonic consent-history source is merged; account and worker operations are still disabled. The latest candidate awaits Soren's exact fleet web/backend/contract checks and V2 declaration generation; see `docs/completion/cassian.md` for prior failures and limits.

Cassian merged the Foundation, Frontend, Delivery, Native, QA and Mail owner candidates in the isolated `completion-cassian-int801` worktree. A validated active-operation registry source-registers guarded V2 organization grants/roster, inert Outreach reads and draft writes, and a scoped direct-message read; no V2 route can dispatch mail or expose the disabled worker proposal. Canonical V2 operation statuses and the Rails allowlist are checked for exact agreement in source tests. Fable binds the production Outreach adapter and Mira’s direct-message UI through the typed App route capability. Account, worker status, native authentication and inbound ingestion routes remain gated. Soren’s fleet V2 contract/route and fake-ingress unit checks passed on ba6151b (3/18, 5/13, 6/32); the earlier 696549b JSON failure remains recorded. Exact 45be80b DB migration passed through inbound, then full Ruby suites failed on cross-migration fixture dependencies; cleanup passed and SQL/HTTP acceptance was not reached. Exact 8eb840d web check:api, lint and typecheck passed, then Vitest recorded 779 passed/10 failed across Fable and Celeste suites; build was not reached and cleanup passed. Owner repairs and a later integrated web rerun remain pending. Canonical V2 draft.4 declarations, browser acceptance and latest integrated web/HTTP checks remain pending. No integrated acceptance, live sending or production release is claimed. See `docs/completion/cassian.md` and owner records.

### INT-801 additive V2 interface candidate (2026-10-14)

Cassian prepared disabled organization grant, simulation-only outreach and internal worker-status V2 interfaces over `bbf2353`. Frozen V1 contracts and Rails routes remain unchanged. The V2 route registry fails closed until owning controllers and authorization gates are ready. Source and tests are committed for fleet Docker validation; runtime acceptance and generated web DTO adoption remain pending. See `docs/completion/cassian.md`.

The scoped ADM-803 static repair for Soren `fa3082af` narrows roster and cursor values without changing role authority; see docs/completion/theo-core-static-repair.md. Current fleet Steep/RuboCop PASS is not claimed.
ADM-803 provisional administration roster and PREF-822 display-name preference candidate: docs/completion/theo.md. Configuration identities are unbound and grant no effective access; candidate guarded V2 grants/roster, role audit and per-user preference controllers need Cassian route/DTO integration and fleet runtime evidence. Integrated legacy draft migration probes assert protected FK dependency failures separately from the default-privilege assertion; full reapply must run on a disposable BE02-only database.

# Product requirements and decision record

QA-815 owns serialized fleet Docker checks under the shared Soren lock. The exact Mira FE-806 candidate passed focused frontend checks; the immutable-source scheduler, receipt and cleanup limits are recorded in `docs/completion/soren.md`. This is not integrated or browser acceptance.

### Mira BE03 UI isolated R24 implementation (2026-10-14)

Root authorizes isolated BE03 implementation over `03ae770` while BE02 remains OPEN/unaccepted and integration/release gated. Mira owns the send gateway, generated web artifacts after canonical contract, and review/approval/status UI. The S1/S2 UI renders full saved plaintext content, explicit correspondence approval, original-binding uncertain retry, and server-owned simulated status. Paired corrected exact canonical contract `aa35c3d`; source607fcb2c passed Docker generator/check/lint/type and8files/260affectedtests; independent functional/data/design reviews found0confirmeddefects. Exact generated artifact and strengthened tests are present, follow-up sourcee037cb9b passed Docker APIcheck/lint/type/full37files660tests/build/fixture-isolation checks; bounded follow-up reviews found0confirmeddefects. Final fixture-only pre-abort repair8f6f5bf8 passed lint/type/9files174affectedtests and independent40LOC repair review0newdefects; seven exact owned containers independently absent, shared image/Lyra18140 preserved; actual visual/integrated validation remains pending; no completion or delivery claim. Canonical source is `contracts/v1/openapi.json`. See [Mira scoped evidence](docs/completion/be03-mira-r24.md).

Demo visual copy corrected: ASCII separators, explicit paragraph line breaks; image `4ce7aefe738e` on private18141. Docker build/typecheck + three targeted tests pass; independent design review has zero remaining defects. Original18140 retained.

Synthetic demo checkpoint: separate `demo.html` on private fleet port 18141 now supplies a populated fictitious team inbox and drafts. Docker typecheck/build, lint and 632 tests pass; coordinator visual/adversarial gates pending. Superseded task-owned demo image/cache ancestry cleaned; both private previews retained. See `docs/completion/fe-preview-01.md`. Original 18140 fixture preview remains available.

Private synthetic frontend preview is running; Docker lint/typecheck/build and 629 tests passed. Root visually inspected it. Isolated BE03 work is authorized in parallel; integration/release still require BE02 acceptance. See [preview checkpoint](docs/completion/fe-preview-01.md).

## Current execution status

**Latest integrated candidate:** `3c781f27246eced3a8c218c2b333ab080cd35530` registers PREF-822 session-scoped GET/PUT in canonical V2 draft.6 and includes Theo/Lyra settings, Maeve/Celeste inert sequence, Nadia/Mira held attachment UI/backend, Rowan/Elara/Dorian source repairs, and Cassian OUT839 grants plus ATT838 pure signer. Sequence and attachment public routes remain inactive; the V2 generated declaration, current SQL/HTTP/web/browser fleet gates, seeded screenshots and independent review are pending. No live send, live credentials or release is enabled. Earlier dated paragraphs below record historical source/evidence states and do not supersede this checkpoint.

SEND809 exact integrated `7aa61be4649ca251c3faff368ba61dfa7e313708` passed real PostgreSQL migrations but the affected send database suites had eight cancellation guard setup errors, two fixture lock timeouts, three mismatched Mailpit snapshot approval errors, and one binary/UTF-8 oracle failure. Rowan committed bounded test fixture repairs `49aaad8`, `f9f13a0`, `3fe86b7`, `bf2748f`; Soren fleet rerun is pending. Production write guard, lease, approval and Mailpit authority were not loosened.

### Fable FE-805 shell/sidebar/brand candidate (2026-10-15)

Isolated on fleet baseline `bbf2353`, branch `completion/fable-fe805`; not integrated. Adds the authentic Elevateo mark under `apps/web/public/brand` (hashes match root's provenance), a `BrandMark` primitive on a fixed dark tile, a pure validated feature registry with an Outreach seam for Celeste, and a rail split into independent Personal and Outreach landmarks with no global switcher. Existing routes, session gate, drawer names and frozen contracts are unchanged. Registry, sidebar and shell tests are added but **not executed**; Docker lint/type/unit/build and visual evidence are requested from Soren/Tessa. See [Fable record](docs/completion/fable.md).

Application IN PROGRESS — R24 isolated BE03 candidate (2026-10-14). Root authorizes implementation on baseline `03ae770c56271cd8236726bfd8fe63248e81283d` in parallel with BE02 acceptance. BE02 remains OPEN/unaccepted; integration/release gated. S1+S2 priority: saved draft -> consistent review -> human approval -> durable queued intent. Canonical additive `contracts/v1/openapi.json` version `1.0.0-send.1` is prepared; every baseline C/D operation/component and original fixture is preserved.

Contract source `013fe663563165a986f866ca9119b8b49c4332bf` passed fleet pinned-bundle Docker regressions (8 runs/78 assertions/zero failures/errors/skips, exit0) and affected lint (1 file/zero offenses, exit0). Four independent review findings and one lint-derived warning were repaired and re-reviewed; dedicated design review found no additional defects. Initial setup failures and lint history remain recorded. All task containers independently absent; shared images/persistent resources/Lyra18140 preserved. Reviewed SQL persistence source is assembled in the isolated candidate; reviewed API source and fail-closed control dependency are also assembled; real SQL/Auth/API runtime, UI intake, generation and S3-S5 lifecycle remain pending. Root R21f closure and six-worker deployment registry are integrated as documentation-only lineage; actual vault remains untouched. No BE03 completion, live activation or vault synchronization claim. Requested Fast billing remains unverified. See [R24 record](docs/completion/be03-r24-contract-integration.md) and [Docker receipt](docs/completion/be03-r24-contract-docker.json).

R24 Elara worker branch: root explicitly authorizes isolated BE03 implementation in parallel with BE02 acceptance; BE02 remains OPEN and integration/release gated. Offline control/driver seams are source-reviewed; standalone fleet Docker units passed14runs/125assertions on exactfc912d7 with bundled Minitest5.25.4. Final exact3d7b61f pinned bundle units14/125, strict Steep and affected lint6files passed in fleet Docker; initial tuple-inference failure and repaired review defects remain recorded. Real SQL integration remains NOT_RUN; no integrated runtime acceptance. See [worker record](docs/completion/be03-elara-r24-worker.md). This branch note supersedes the historical BE03-closed sequencing below.
R24 continuation: prepared a bounded real HTTP/Auth/PostgreSQL S1/S2 fixture under `ops/tests/be03`; source/design review repaired one MEDIUM oracle gap and one LOW typed-interface defect; fleet boundary3/19, strict two-file typing and affected lint PASS exit0. Real database runtime NOT_RUN. Soren owns execution and exact disposable lifecycle cleanup. See [fixture instructions](ops/tests/be03/README.md).

R24 Nadia BE03 API isolated work is explicitly authorized by root while BE02 remains OPEN and integration/release gated. S1/S2 Rails API source and regression fixtures are committed; routes default disabled. Independent source/design reviews found two MEDIUM defects and one LOW test gap, repaired and re-reviewed. Capped fleet API fixtures PASS22runs193assertions, strict Steep and affected --lint PASS after preserved initial failures; exact own container cleanup verified. Integrated SQL/Auth runtime remains pending. See [Nadia API evidence](docs/completion/be03-nadia-r24-api.md). Historical R23 BE03-CLOSED wording below is superseded only for isolated implementation.

## Historical R23 checkpoint — sequencing superseded only for isolated R24

Application IN PROGRESS — R23 documentation checkpoint (2026-10-14). BE02 OPEN/unaccepted; BE03 CLOSED until root accepts BE02. Application completion has priority; R&D remains separate. Invitation source is exact 51ca5d2eadd74b7ac4c1a2f5f82cd49323b15dc5; core/empty/revoked/logout evidence belongs to exact 86036e276df9c3294206e6bfa14d478c223c54dd. Observer remains OFF. Production, contracts, observer boundary and four Docker recipes are unchanged.

R19 core login/read/persisted-draft/search PASS stands with restoration, authenticated HTTP, worker drain and cleanup. Its sixteen screenshots do not establish complete visual acceptance: search was loading; settled-search evidence remains in R12. R12's 21 PNGs and R18 conflict/revocation PASS stand. R18 logout FAILED, cause UNKNOWN; F2 memory-only recovery limitation remains OPEN.

R21d build/TypeScript compile/privacy regression PASS. First empty visual partition failed setup with MODULE_NOT_FOUND ./quiet-reporter.ts: zero cases/zero PNGs; seven partitions not admitted. R21e CLI reporter override was insufficient because config resolves its reporter first: zero cases/zero PNGs, seven not admitted. Exact cleanup/independent absence PASS, lease FREE. R21f fresh runtime completed all eight F1/F2 partitions: four desktop PASS with six retained private PNGs; four mobile FAIL with zero PNGs, all attempt zero. Build, privacy regression, compile and runtime dependencies PASS. Launcher exit 101; original queue ledger stops at seven entries, but the eighth lifecycle has its own final receipt. All eight cleanup receipts and exact independent resource absence now PASS; task compile image removed and lease FREE. See [reconciled closure](docs/completion/jules-r21f-closure.md).

Remaining: diagnosis/fix of four mobile empty/revoked failures and root manual visual acceptance; R22 invitation affected unit/lint/type checks, frozen genuine SCN-AUTH-006-P and separate supplemental keyboard/visual evidence on exact51ca; corrected logout on exact86036. Root owns acceptance and actual vault; Jules supervises Soren fleet runtime; Cassian OFF401 / INT-403 owns this documentation integration. No new research gate or repeat of passed unchanged suites is implied.

Project obsidian.md and the remote pending record are NOT synchronized to the actual vault. Actual Obsidian remains 134117 bytes, SHA256 de210bf0205ae28125d2c6125ff18fdbac87f947b6e2f92fff89b4b09e54b372, unchanged because C: is full. Automatic approval review rejected deleting a verified duplicate as “blocked by policy”, with no detailed reason; no deletion or retry. Requested LOW/Fast is not verified effective billing. See the R23 journal for receipt hashes, process history and BE03 readiness; R18 seal and failed histories remain linked.

Evidence: [R23 journal](docs/completion/int403-r23-application-state.md), [R18 seal](docs/completion/int401-r18-handoff.md), [history](docs/completion/int401-status-history-20261014.md).

Design date: 2026-10-11; expanded planning revision: 2026-10-12. Current scoped decisions override older planning assumptions; consent-based sending remains required.

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

The current source-intake request explicitly authorizes collecting all six codebases in this repository. See [source inventory](third_party/README.md), [independent dossiers](docs/reference-repositories/README.md) and [goals](docs/goals-and-traceability.md). Archival source import is complete; integrated application source now exists, with runtime acceptance pending as recorded above.

## Product boundary

Inbox attachment backend candidate stores scoped private metadata and holds objects in quarantine. A restricted Storage adapter and bounded ClamAV scan worker exist, but no scanner container is configured or proven; Sabine private gateway, Cassian route, Corin import wiring and Soren fleet validation remain pending. See `docs/completion/nadia-attachments.md`.


The first release is a company mailroom: named addresses, shared conversations, assignment, team status, per-user read state, composer, drafts, search, attachments and audit history. Individual mailbox permissions allow private addresses where required. Ten users do not imply ten paid email accounts or ten servers; people, addresses, mailboxes and provider identities are separate concepts.

FE806 attachment reader candidate displays private metadata only after an explicit request and offers download only for a clean scan state through an authorized byte proxy. A fresh request can still be denied after a clean listing. Pending, malware and failed scans never expose a download action. The additive V2 route, real scanner, private storage adapter and outbound draft/send binding are separate unfinished work; no current attachment download or upload is claimed.

ATT843 keeps overlapping attachment downloads independently busy and suppresses duplicate requests for the same attachment until that attempt settles. It does not change server authorization or enable a download route.

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

SEC-802 access design: organization roles have revisioned protected mutation and no implicit mailbox-content access. Legacy mailboxes remain unclassified until verified owner enrollment. Private visibility is required for a scoped sales inbox; frozen shared visibility admits all organization members. See `docs/completion/sabine.md`.

SEC-802 security seam: migration 00008 installs the legacy mailbox mutation guard after policy tables, with no wire DTO change. Personal delegation requires the owner to act; all delegation requires current mailbox capabilities and an explicit grant ceiling. The redacted grants page derives tenant from the authenticated session, and historical mailboxes fail closed until classified by a verified operator workflow.

SEC-802 database fixture note: the legacy membership test harness must create disposable organization role, team mailbox classification and grant ceiling rows before exercising the patched mutation. Its teardown removes those task-owned classifications before deleting member identities and releases the parent database connection even if cleanup fails. These fixture grants are test-only and do not enroll an organization or classify production mailboxes.

The draft concurrency test harness also supplies an explicit task-owned team classification for its private draft mailbox, an owner role and a bounded ceiling before its protected self-revocation scenario. Schema dependency drift fixtures remain a separate Theo-owned change.

Fixture teardown recovery is limited to the disposable test database: when its admin login was closed, it reconnects with database/login verification and must reacquire the advisory fixture lock before changing rows. Failed local cleanup does not skip inherited teardown, and draft save/read ensure blocks preserve the initiating exception if rollback cannot run. This is test harness behavior, not runtime recovery behavior.

If scoped organization fixture deletion fails and rollback also fails after connection loss, teardown reports the initial SQL error and emits only the secondary error class to the test log. This keeps the first failure diagnosable without exposing SQL values.

The protected grants page also returns current actor role/revision independently of pagination; audit metadata remains unavailable until a separately reviewed authority endpoint exists.

Personal mailbox owners cannot lose manager access through the legacy mutation, and non-owners cannot receive personal manager authority. Team last-manager checks count only managers whose current organization role and explicit ceiling permit administration. Outreach draft mutation has a separate protected current-role check for owner/admin/sales_manager/sales; sending remains separately gated.

Outreach content reads have a separate digest-verified role check for owner/admin/sales_manager/sales. Dorian's domain RLS must enforce the same policy; these checks do not confer mailbox or send rights.

Organization role changes append a redacted audit event in the same database transaction only on a real change. The owner/admin audit page is digest-verified, tenant-scoped and newest-first; its UUID cursor resolves to an immutable sequence within the tenant. No message content, addresses or secrets enter this audit.

Security auditors may read metadata-only organization role audit pages; they cannot list effective grants or mutate roles. Audit timestamps use six-digit UTC wire formatting.

OUT-804 actual-role policy assertions now cover API positive, denied app-read proof and cross-actor digest negative on the existing disposable database fixture; authored source is not fleet-executed.

ATT838 Rails configuration now accepts only the internal http://attachment-gateway:4708 endpoint paired with the dedicated 32-byte HMAC key; the gateway client/route and fleet checks remain pending.
FE807 consent failure behavior: an access-denied evidence write hides loaded lead content and never shows the manual-attestation success message. A definitive operation mismatch returns an error without automatic replay; only a validated successful receipt can show success.

FE807 sequence route seam: `createOutreachFeatureModule` exports `/outreach/campaigns/:campaignId/sequence` and campaign detail links to it. `sequenceContract.ts` validates the proposed V2 sequence/step shape and PUT body, including campaign id, operation id and nullable expected version. `SequencePage.tsx` uses optional `getOutreachSequenceDraft` and `saveOutreachSequenceDraft`, a single atomic Save, explicit draft/held labels, a locked conflict/uncertain state and no send control. Cassian must publish and bind the canonical gateway; Fable registers the route.
MAC-814 native integration: the actual `apps/native` Tauri shell now has a macOS-specific DMG override, empty entitlements and a preflight-only release entrypoint. The shared shell CSP and empty capability remain fail closed; no native callback is registered. See `docs/completion/maeve.md` for Docker static test request and target-Mac acceptance blockers.

MAC-814 sequence planning: `apps/server/lib/elevateo/outreach_sequence/schedule.rb` provides pure candidate scheduling helpers only. Migration 00016 and versioned sequence DTOs are not created; the existing BE03 send-intent/worker remains sole delivery authority. See `docs/completion/maeve-sequence-draft.md` for proposed persistence, DST, idempotency and final consent gates.
# Sequence draft candidate (MAC-814)

One campaign owns one draft/held sequence with 1–20 steps. Replacement requires an expected version and stable operation ID; prior occurrence history remains frozen, and timezone change with history requires explicit reschedule. Occurrences have no API write/claim grant, so this source cannot send. SEC802 authorization grant review and integrated fleet Docker checks remain pending. See [implementation and limits](docs/completion/maeve-sequence-persistence.md).
FE808 roster test data is parsed with `RosterPersonSchema` so fixture typing matches the versioned DTO's closed department enum. This does not alter the production roster reference or gateway boundary.
# FE808 Personal Settings candidate

The personal settings route `/settings/personal` reads the signed-in actor's display name and revision under the current session context. Saving sends the expected revision once with the session CSRF proof; a conflict requires an explicit reload. Denied or revoked access hides the editor, and an actor/context change does not show the previous actor's value. Theo's PREF822 endpoint and Cassian's typed V2 gateway adapter are pending integration, so this is source-only candidate behavior. Timezone, credentials and notification settings have no persisted contract here.
The isolated ADV089 follow-up tests use the actual protected-request hook and session scope with keyed remounts: an old read or write is held pending, its signal aborts on context change, and a late reply cannot replace the new actor's value or revision. Fleet execution remains pending.

PREF-822 candidate integration now registers session-derived GET/PUT `/v2/me/preferences` in canonical V2 draft.6 and connects the personal settings UI to the typed gateway. This is source-only: generated draft.6 DTO, bounded independent review, real PostgreSQL/API-role checks, HTTP and browser evidence remain pending Soren/root.
Account `page` and `detail` SQL include an `EXISTS` query against `app.mailboxes` under its existing `visible_mailbox` RLS policy and a separate current-actor `app.mailbox_memberships` existence check. Frozen shared mailbox browsing remains organization-visible, but campaign account configuration requires membership for shared and private mailboxes independently of outreach role. A hidden row is omitted from lists and resolves as `not_available` in detail. Migration 00009 account policy rechecks both conditions; real cross-actor, revocation and mixed-list behavior need fleet PostgreSQL/HTTP proof.

The idempotent update fingerprint includes `preserve_consent` so the same operation UUID cannot switch between preserve and reset paths. Consent event insert RLS requires `actor_id` equal the authenticated database user; mutation ledger insert RLS requires a visible campaign/lead/account row for its declared resource kind. Rollback of migration 00009 first disables silent RLS filtering for its read and refuses to drop any populated foundation table. Controller requests cannot name the consent actor. These are source guards, pending actual API-role/RLS and rollback execution.

Migration 00009 links noninitial `campaign_leads.consent_operation_id` to an immutable event for the same tenant, campaign, lead, email, status, source, observed time and granted actor through RLS `WITH CHECK`. `Repository#replace` inserts the event first, then updates the lead projection, then appends the mutation result inside the existing protected transaction; stale or denied changes roll back the event. Initial unknown leads have a null link and no consent fields. This closes direct SQL projection changes that lack a matching event, subject to exact fleet PostgreSQL/RLS verification.

Each consent event also stores `lead_version`; lead RLS requires it to be no later than the current projection version, and a database trigger permits only one-step version advance on updates. The trigger requires a fresh event at the new version when email, consent fields or the event link changes, so an older granted event cannot replace a later withdrawal. Same-address edits perform `SELECT ... FOR UPDATE` and store a replay result without changing the row/version or its evidence link. This source design needs a real withdrawn-to-old-granted negative probe and event/projection atomic rollback proof in disposable fleet PostgreSQL.

Ada's next review narrowed the rule: RLS accepts a matching event whose `lead_version` is at most the current version, allowing unrelated metadata changes. The BEFORE UPDATE trigger rejects clearing any existing consent link and requires an event at exactly the new version whenever the email, consent fields or event link changes. The trigger also enforces one-step version advance. This combination is intended to deny historical-event replay while allowing metadata-only updates; fleet PostgreSQL proof is pending.

`test/campaigns/authorized_database_test.rb` reuses the existing BE02 real-session fixture in Soren's named disposable fleet database. It enters an authenticated API-role tenant transaction, calls Sabine's current outreach read/write authority, sets the transaction-local digest, and checks metadata-only lead update/link-clear denial, shared mailbox account denial for a same-org sales actor without mailbox membership, authorized owner-member visibility, and transactional rollback of a real `Repository#replace` preinserted event after a stale version. This is authored test source, not executed evidence; run it separately under the fleet Docker lock with BE02 disposable database variables.

The migration 00009 role and per-table integrity policy fragments are joined with explicit SQL whitespace. `test/campaigns/migration_policy_test.rb` captures the six generated policies and rejects `ENDAND` or a missing `END AND` boundary on the three integrity policies. This addresses Soren's fa3082a PostgreSQL parser failure before HTTP tests; only a real disposable migration rerun can establish SQL acceptance.

The fa3082a full RuboCop source receipt found two owned test-only ambiguous block associations in `accounts_controller_test.rb` and `leads_controller_test.rb`; explicit parentheses now bind the Minitest arguments. This does not change product behavior and is unverified until the fleet rerun.

Campaign policy `TO elevateo_app_read` accepts statements from the API role through membership; the existing backend fixture uses `BE02_API_DATABASE_URL`. SEC802 exposes `app.authorize_outreach_content_read(text)` only to `elevateo_api`, so direct `SET LOCAL ROLE elevateo_app_read` policy evaluation should fail closed. The authorized database test now asserts positive API role execution, direct read-role denial, and cross-actor digest denial without altering privileges. Fleet SQL execution must confirm the exact role behavior.

ADV093 distinguishes policy membership from function invocation rights: a query executed after `SET ROLE elevateo_app_read` needs explicit EXECUTE on its protected SEC802 helper. OUT-804 policy calls `authorize_outreach_content_read`, while sequence 00016 calls `authorize_outreach_draft_write`; both grants are API-only in the current integration. The revised disposable fixture enters a real protected write as API, changes to the restricted role, asserts draft-write proof plus campaign table RLS, and separately checks that a copied digest without the DB-private marker raises an error. SEC802 access.sql is absent in this isolated branch, so the narrow grants require Sabine/Cassian integration before this new fixture can pass.

OUT839 integrated SEC802 grants allow only elevateo_api and restricted elevateo_app_read to execute two existing protected outreach helpers used by campaign/sequence RLS; PUBLIC and worker revokes remain. Dorian actual-role positive and copied-digest negative tests are source-only pending fleet PostgreSQL proof.

ATT838 Rails now has a pure fixed-field HMAC request builder for the private read gateway: exact ordered JSON, UUID/digest/hint checks and a 0–30 second expiry. It is unbound from any public route until Sabine gateway source and Soren fleet evidence are ready; no Storage token or live bytes were used.

ATT838 wire correction: signed context_id must be the same lowercase UUID as context_uuid; authorization_version remains an opaque signed hint. Sequence migration already occupies 00016, so attachment gateway helper must use 00017 or later.

ATT838 Rails private transport candidate now sends one signed internal POST without redirects or retries, rejects transactions and missing signing config, caps bytes at 10 MiB, and requires exact binary/no-store/nosniff/disposition/length headers. It is not called by a public route; gateway interop and fresh post-fetch authorization remain pending.

INT801 repaired the fleet web lint failure by replacing three no-control-regex patterns with explicit Unicode code point validation and added C1-control regressions. The same pass corrected two remaining preference tests to the UI-aligned gateway argument order. Exact repaired-source Docker lint/type/unit/build is pending Soren.
