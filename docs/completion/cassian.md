# INT-801 Cassian implementation packet

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

Separate proposal alignment: Theo `81cb542` GET projects `{context_id,authorization_version,display_name,revision}` while PUT returns `{display_name,revision}`; the noncanonical PREF-822 schema now distinguishes those responses. Nadia ATT-823 review removed the provisional `message_id` and `downloadable` fields: the path already binds message ID, and clean status cannot guarantee byte access without a reviewed private gateway. The proposal now uses five metadata fields and UUID cursor pagination (limit 1..50). Neither proposal changes canonical V2 or registers a route.

Attachment contract preparation: `contracts/v2/proposals/inbox-attachments.openapi.json` is a noncanonical ATT-823 read draft with message-bound metadata list and clean-only bytes, no upload/send path, explicit 400/404/423 mapping and no storage key/public URL. Nadia’s isolated service lacks list/streaming adapter, scanner and private Storage integration; Corin’s inbound staging handoff, review and fleet RLS/HTTP proof are pending. Canonical V2 source and active Rails registry remain unchanged.

Parallel contract preparation: `contracts/v2/proposals/personal-preferences.openapi.json` is a noncanonical PREF-822 draft only. It defines session-derived display-name GET/PUT, strict body/revision/CSRF shape and generic missing/stale errors without adding canonical routes or touching the frozen core candidate. Theo source, security review and fleet runtime are pending; no generated declaration or active API is claimed.

## Latest integrated checkpoint — 2026-10-14 15:25 UTC

Soren exact fa3082a pinned Ruby static gate failed: Steep 89 problems in 12 files and RuboCop lint 11 offenses in 262 files, with task archive/container absent. Two lint findings were Cassian-owned `v2_route_registry_test.rb` ambiguous block associations; source assertions were parenthesized without changing test meaning, pending fleet rerun. The remaining nine lint findings and Steep families were routed to source owners via root; no acceptance claim.

Dorian `ebfe780` repaired the SQL predicate concatenation that produced the exact fa3082a `ENDAND` migration failure and added a migration policy regression. It is merged in the current isolated candidate; the corrected disposable database run has been requested from Soren and has not yet returned.

Soren exact fa3082a disposable PostgreSQL/Auth run failed during CreateCampaignFoundation migration at line 174 with `PG::SyntaxError` near `ENDAND`; backend Ruby, SQL/HTTP and worker gates did not run, and task resources were cleaned. Dorian owns the SQL interpolation repair. Fable `2ce4c54` stale consumed Outreach error policy/tests were cherry-picked as `d89b4cd`; this later frontend source has no full fleet pass. Root requested a maintained web Dockerfile V2 copy; Soren, its recipe owner, received the exact change request.

Celeste `a3b660e` explicit manual/unverified/no-send success state and `bf2b589` denied/conflicted consent UI regressions are merged. Dorian confirmed the POST summary and guarded GET detail source shapes; the browser and OpenAPI expected-version ceiling now match the server (2,147,483,646), and browser observation time rejects values over five minutes in the future. Soren exact f210b5b full web V1/V2 generation-check, lint, strict typecheck, 54 files/791 unit cases and production build PASS with task cleanup, but that source predates draft.5 and Celeste’s new UI. Its generated declaration SHA256 `55ab785f99a8686f8427bd641ef1be34c32cb95a88a86f7b14fec05c37e87faa` belongs to old OpenAPI `768df81c...` and is not adopted. Latest draft.5 regeneration and runtime remain pending.

Continuation: draft.5 adds one manual consent POST and redacted lead detail GET schema to close the source journey from a draft campaign and unknown lead to a recorded manual claim. Cassian’s browser adapter exports `getLead` and `recordConsent` to Celeste’s typed UI interface; the POST parses exact input before dispatch and uses Dorian’s existing guarded session/CSRF/transaction path. This is a manual attestation only, with no independently verified status or mail dispatch operation. Source tests are authored but not run; Soren must regenerate V2 declarations and run structural, web, SQL/HTTP and browser gates on the exact committed candidate. Dorian’s `8a433b3` actor mailbox-membership repair is merged, but account routes stay disabled until mixed private/shared/revocation proof and review.

The isolated candidate includes Dorian `2d191f7` monotonic consent-history binding and `df75e47` linked-consent preservation, Sabine `fa3bb60` fixture cleanup, Corin `3880e9d` bounded IMAP UID repair, Fable/Celeste/Mira source repairs, and Cassian's closed active-operation allowlist. `contracts/v2/openapi.json` SHA-256 is `768df81caeb402d3186b7d8fe94e3515927ff76319c38e075a50aefe0e6c566b`; frozen V1 OpenAPI still has no diff from `bbf2353`. `getWorkerJob` and account routes remain disabled. The independent Rowan ADV044 review found four findings in the earlier Dorian foundation, including a private-mailbox account policy bypass; the account routes stay excluded while the owner proves actor-scoped visibility. Nadia's bounded OUT804 review found two controller test-coverage gaps, not a demonstrated bypass. Dorian's later fixes need review and fleet SQL/HTTP checks before acceptance.

Soren's last exact structural PASS is ba6151b (V2 contract 3/18, route registry 5/13, fake ingress 6/32). The current allowlist, consent-history source and generated V2 declaration have no exact fleet result yet. The last integrated web gate on 8eb840d passed API check, lint and strict typecheck but failed 10 of 789 Vitest cases; Fable and Celeste repair commits are merged without an exact rerun. The last disposable DB gate on 45be80b completed migrations through inbound 00011 but full Ruby suites failed fixture dependencies, so SQL/HTTP and browser remain unverified. Soren received exact current source and bounded web, contract, DTO, migration, SQL and HTTP requests. No application tests or Docker ran in this worktree.

Baseline: `bbf2353b254a05d48c2da7a508c143e6fba78691`; branch `completion-cassian-int801`. Scope: additive draft in `contracts/v2/openapi.json`, fail-closed `apps/server/config/v2_route_registry.rb`, generator command, strict TypeScript V2 boundary DTOs, a bounded browser gateway port, shared transport path admission, and structural tests. Candidate commit SHA is recorded in the control outbox after commit. The frozen V1 schema and generated V1 DTO are unchanged. The Rails route file now registers the guarded V2 active allowlist in the isolated candidate; this supersedes the earlier disabled-scaffold state documented below.

The organization grant interface uses an expected revision and cannot assign owner, so owner transfer needs a separately verified workflow. This follows the Vera access advisor's recommendation for distinct redacted admin metadata and a narrow grant mutation. Outreach permits only `mode: simulation`, and the worker endpoint declares a distinct principal. The worker identity mechanism, backend policy, persistence, and UI gateway remain owner dependencies. No upstream code was copied; this packet adapts only first-party interface patterns. Generated V2 OpenAPI declaration DTOs are requested via `contracts/tooling/generate-v2.sh` in a pinned fleet container; none are represented as generated yet.

Requested Docker checks through Soren: `ruby contracts/v2/contract_test.rb`; `ruby apps/server/test/v2_route_registry_test.rb`; generate V2 DTO in the pinned contract tooling container, then run affected TypeScript checks after owner adoption. Executed here: no application tests, builds, Docker or runtime. Source tests cover registration success, disabled and unready failures, V1 path noncollision, simulation-only mode, and worker/browser authority separation. Integrated authorization, real SQL, worker mTLS, client UI and end-to-end behavior are unverified.

Design tradeoff for root: a separate V2 document keeps frozen V1 hashes intact and lets owners agree operation IDs before route activation. The cost is another generator artifact and explicit gateway version selection. A monolithic V1 extension would reuse the existing generator but would disturb the frozen contract lock and risk accidental publication of unimplemented operations.

## Integrated continuation

All named owner candidate branches were merged into this isolated worktree through `696549b`; central document conflicts retained prior text and this note summarizes integration state. Theo V2 grant PUT exists but remains disabled pending Sabine's legacy-mutation ceiling and consent patch; GET needs Sabine's protected read and an effective-role page. Dorian's inert repository supports a bounded campaign list; Cassian added a tenant-protected V2 GET list route. V2 OpenAPI was corrected after Soren's exact intermediate fleet probe failed with JSON::ParserError (3 runs, 0 assertions). That failure is preserved, not treated as a test pass. Contract generated declarations, affected web/backend type and lint, SQL authorization and browser evidence remain pending Soren.

The next independent review packets are the V2 spec, Rails outreach controller/route/tests, and browser V2 runtime boundary/gateway. Simulated design case: a revoked organization actor whose campaign list request waits on the tenant snapshot must receive current authorization denial rather than a stale campaign page. This is analysis only; no race test has executed.

### Dorian controller merge and route candidate

Merged Dorian `d0b7a9a` and Celeste/Fable feature candidates. V2 route registry now points campaign list/detail/create/update, lead list/detail/add/email-update and per-campaign analytics to Dorian's guarded controllers. Account routes remain excluded while campaign-scoped path checks are resolved. The original interim campaign list controller was removed. These are active routes in an isolated source candidate, not tested or accepted behavior; no send operation exists in the V2 spec. The V2 schema includes server-owned status, per-row optimistic versions and bounded cursor pages. Grant and worker routes remain disabled pending Sabine authority and worker identity.

### Sabine authority merge

Merged Sabine `fc0b542`: protected redacted grant page, verified enrollment/provisioning hooks that do not seed real people, and a legacy mailbox-membership ceiling/consent patch. Theo GET grants, GET unbound roster and PUT subordinate role controller paths are now source-registered as isolated candidates. Effective roles are seven closed values; owner transfer is excluded. No real identities were enrolled and no SQL/HTTP fleet pass is claimed. Sabine's branch requires migration/protected-function and bypass-path adversarial tests before root acceptance.

Native broker and synthetic inbound interface proposals are documented in `contracts/v2/proposals.md`; neither is a released or active route.

### Browser Outreach adapter candidate

`apps/web/src/data/v2OutreachGateway.ts` now binds campaign, lead and analytics operations to Dorian's versioned endpoints through the existing bounded, same-origin JSON transport. It validates UUID paths, page bounds, CSRF-protected writes and strict server responses. Account methods deliberately return `temporarily_unavailable` without network dispatch while campaign scope and mailbox metadata policy are unresolved. Consent attestation is not exposed by this adapter; the server action remains unregistered. Celeste's UI supplies operation IDs and optimistic versions. Fable owns production `main.tsx` wiring after fleet type/lint/HTTP validation.

### Fleet receipts observed during continuation

Soren's `ruby-batch-next-20261014.txt` records exact bbed59c V2 contract 3 runs/10 assertions and route registry 3 runs/9 assertions, both PASS exit0 in the pinned Ruby image with task container absent. This proves those two structural checks on bbed59c only. The earlier 696549b JSON parse failure remains in history. Soren's integrated DB b071c93 receipt reports migration FAILED before business tests and cleanup PASS; exact migration error was requested. Dorian 21536e5 repository unit failed with missing ActiveRecord constant, and Celeste a460c5a lint failed two control-regex rules; owners received exact findings. No later integrated exact-candidate PASS has been reported.

Safety correction: Sabine added `app.authorize_outreach_draft_write`, but Dorian's current controller source had not invoked it. Cassian removed campaign/lead write registrations from the active isolated route list and marked their V2 operations disabled until the current-role helper and denied/stale tests are integrated. Read-only campaign/lead/analytics routes remain candidate-active. No prior runtime acceptance is inferred.

Sabine's later protected grant page and Theo controller now return a separately authenticated actor grant on every page. Canonical V2 `OrganizationGrantPage.actor` is required and strict. Lyra must verify actor ID/organization and stable role/revision across pages and use this server proof for UI hints; list position must not decide actor authority. The server remains final authority for every mutation.

### Later integrated candidate and fleet blockers

Dorian b3438e4 now invokes Sabine current-role proof for every Outreach read and draft write inside the guarded transaction. Cassian source-registered four inert draft write operations and marked their V2 OpenAPI statuses active in the isolated candidate. The earlier safety correction remains historically accurate for its SHA; these routes still require SQL/HTTP denied, stale-role, CSRF and replay checks before acceptance. No send route was added.

Soren exact f787bbc web lint failed on Fable Shell.test.tsx parser line 430 and six unused mock parameters in Cassian v2OutreachGateway.test.ts. Cassian repaired the six own lint errors at d9b94de; Fable repair is owner-pending. Exact f787bbc DB migration failed in Nadia AddSendCancellation#up because elevateo_send_owner lacked CREATE on schema app, before application tests. No integrated runtime PASS is claimed. Requested Soren rerun: pinned fleet Docker `ruby contracts/v2/contract_test.rb`, `ruby apps/server/test/v2_route_registry_test.rb`, full web lint/type/unit/build and backend DB migration/SQL/HTTP after owner repairs; generate V2 declarations from exact spec, then compare source hash. Executed here: no app tests/builds/Docker.

The V2 generator wrapper now delegates to the existing web package script from its actual package directory; a matching `check:api:v2` command is available after Soren generates the declaration. The declaration remains absent until fleet Docker emits and validates it. Nadia 08ee821 migration privilege repair and Dorian 2e0e87d digest-backed Outreach RLS are merged in the current candidate but untested here.

Fable 77dbd86 production Outreach binding merged as c966427. Static review still identifies Shell.test.tsx line 431 quote parse, six unused bridge-test mock parameters and likely TypeScript account-method arity mismatch; owner was notified through root. Binding is candidate source only, not a web PASS.

Soren exact ea92754 integrated DB receipt failed at Corin CreateIsolatedInbound#up line 45: PostgreSQL syntax error at end of SQL input after `CASE WHEN jsonb_typeof(p_attachments) = 'array' THEN`. Earlier Nadia migration was passed on that run, but overall migration/SQL/HTTP remain FAILED/NOT_REACHED. Soren cleanup passed; Corin owner repair requested with receipt path in the shared outbox.

Soren exact 93f7b14 fleet web run passed frozen V1 `check:api`, then lint FAILED with six Fable `outreachGatewayBridge.test.ts` unused mock parameters (lines 16/23/31); type/unit/build NOT_REACHED. Cleanup reported zero remaining task containers/image. Fable owner repair requested; no web PASS.

Cassian aligned the inert account adapter signatures to Celeste's campaign-scoped port while preserving zero dispatch. Fable may remove the now-unneeded bridge or forward all four arguments exactly; Fable owns production binding. A focused no-dispatch test covers both account methods, requested for Soren fleet Docker.

Corin e94631f repairs the PL/pgSQL attachment CASE parser issue from the ea92754 fleet failure; merged as 45be80b. Soren exact migration/SQL/HTTP rerun is requested, not yet executed or passed on this source.

Fable 40fe941 removes the temporary bridge, binds `createV2OutreachGateway()` directly under the typed Celeste `OutreachGateway` port and removes the bridge tests that failed lint on 93f7b14. Merged in a0d308e; fleet web rerun requested, not yet observed.

Latest owner-followup integration `1829ef4` includes Sabine/ Theo/ Dorian/ Lyra/ Celeste/ Rowan/ Nadia/ Elara/ Orion/ Astrid/ Tessa/ Felix/ Leonie latest source as itemized in `control/cassian-outbox.md`. Lyra now derives grant controls from protected actor projection; Celeste hides Outreach content after revoked writes. Orion fleet Cargo.lock/compile fixture is source only; no native release evidence. All exact-candidate web/backend checks remain pending Soren.

Corin f6a3a3c protected direct-message reader is merged. Cassian adds `getDirectMessage` to the V2 registry and canonical spec, returning the existing plaintext Message fields in a current session envelope. The isolated route is source-registered; absent and inaccessible collapse to the same 404, and malformed UUID/query to 400 in owner tests. Mira UI adoption and exact fleet HTTP/DB/Steep checks remain pending; V1 read contract is unchanged.

Soren exact 45be80b integrated DB run migrated through Corin `00011` with `027-migrate.log` exit0, then `028-ruby-suites.log` FAILED on test fixture dependencies: DraftBootstrapTest cannot drop `app.drafts` while send private intents references it; DraftSchemaContractTest cannot drop send private types while newer reconciliation checks depend on them. Later tests report closed connection and fixture already owned/not empty. Result marks tests FAILED and cleanup PASSED. SQL/HTTP and full backend acceptance NOT_REACHED; root/Soren received exact findings for isolated fixture repair.

Cassian exported a browser `getDirectMessage(ctx, mailboxId, threadId, messageId, signal)` adapter over the bounded transport. Its strict response schema composes frozen V1 Message validation with V2 scoped envelope validation; tests cover valid plaintext, malformed path/no dispatch and generic denied 404. Soren fleet test request remains pending; Mira owns UI adoption.

Soren exact c4fa27c fleet web run passed frozen V1 `check:api` and lint, then typecheck FAILED: Cassian v2OutreachGateway.test.ts annotated the gateway as Celeste's intentionally `unknown` return port before reading `page.items`; Lyra adminModel.test.ts fixture widened department to `string|null`. Cassian removed the own overly broad annotation so the tested implementation result remains inferred; Lyra owner repair requested. Unit/build NOT_REACHED; cleanup reported zero task container/image.

The direct-message browser response bound now matches `ReadResponse::MESSAGE_BYTES` at 2 MiB; the first 64 KiB browser draft could reject contract-legal messages with up to 100 bounded recipient addresses and a 16,384 code-point body. The JSON schema still validates each field and the transport enforces the byte ceiling before parse. This is source reasoning, not an executed boundary test.

The canonical OpenAPI version was advanced to `2.0.0-draft.4` for the direct-message addition; Soren must regenerate/check V2 declarations from this exact source. No generated artifact is committed yet.

Lyra 3039bcd fleet type-fixture repair and Mira 1923c16 later-page direct-message UI were merged. Mira's ThreadPage accepts Cassian's exact gateway method signature, but Fable App.tsx still renders the page without that optional prop; root/Fable were asked to bind it. Thus the direct message UI remains inactive in production source until that owner seam lands.

Fable 10a64a1 central Outreach session-loss policy merged into 09cd4ef. It is source-only pending Soren fleet web checks; direct-message ThreadPage prop is still unbound in Fable App.tsx. The latest integrated web candidate includes both fixes for the c4fa typecheck failures, but no full web rerun result has been observed.

Soren exact 2184127 fleet web run passed frozen V1 `check:api` and lint, then typecheck FAILED only in Mira direct-message ThreadPage: two `exactOptionalPropertyTypes` optional-prop `undefined` assignments (source line 60, test line 39) and missing `MB2` constant (test line 210). Unit/build NOT_REACHED; task cleanup zero. Mira owner repair requested.

Soren exact ba6151b fleet `v2-integrated-ba6151b386e9-permissions-rerun.txt` passed V2 contract 3 runs/18 assertions, route registry 5 runs/13 assertions and Corin fake ingress unit 6 runs/32 assertions, all zero failures/errors, exit0 and archive_absent=yes. Two preceding same-source runner attempts exited10 on permissions and remain separate failed setup receipts. This proves these structural/unit checks only; DB/HTTP, web, generated declarations and browser acceptance remain unverified on ba6151b.

Mira 0cdfc0d repaired the 2184127 exactOptionalPropertyTypes/MB2 type failures; Fable 8762f8c bound the V2 direct-message reader through production main/FeatureGateways/App ThreadRoute. Merged into 90433fb with Mira-owned ThreadPage sources retained. The permalink path is now connected in source, but web type/unit/build, authenticated V2 HTTP and browser behavior are NOT_RUN on this exact SHA.

Mira ff7fa0f synchronous direct-read abort cleanup merged as 15bcfee after ADV059. Soren web 8eb840d run began before this merge and therefore cannot verify that cleanup; an exact 15bc rerun was requested. Canonical V2 contract bytes remain unchanged from the ba6151b structural PASS, but generated declarations remain absent.

Soren exact 8eb840d fleet web run completed: frozen V1 `check:api`, lint and TypeScript PASS; Vitest 779 passed/10 failed across 54 files, build NOT_REACHED, cleanup zero task container/image. Seven Fable shell/navigation/feature-registry tests and three Celeste Outreach pause/consent tests failed, itemized in the shared owner outboxes and exact `web-8eb840d51eaa.log`. Mira ThreadPage 34 and Fable App 3 passed on 8eb; later Mira ADV059 cleanup was merged after this source and remains untested. Root/Fable/Celeste notified; no integrated web PASS.

Celeste c49063e label clarification and 27049a6 canonical consent observation timestamp correction are merged as 7d921cd after exact 8eb web unit failures. Soren targeted OutreachPages/contract rerun was requested; these commits have no PASS claim yet. Fable seven exact older-source failures remain pending owner repair.

Dorian 4da862d current-authority proof for consent replay/audit writes merged as 5b11285. It arrived after the ba615 structural PASS and the 45be full-suite fixture failure; SQL/HTTP authorization and replay checks remain NOT_RUN on this source. Account read routes remain gated on separate mailbox visibility policy.

Latest owner-source merge `995bc86` includes Rowan 6cbd19e versioned internal Mailpit test receipt authority migration 00013, Dorian current-authority consent, and later native/QA safeguards. This receipt authority is internal test transport only; no V2 browser route, live SMTP or provider activation was added. Soren disposable migration through 00013 and targeted receipt DB tests are requested, NOT_RUN on this SHA.

Fable ec85441 seven-failure repair merged as 0f37471 after exact 8eb web 779/10 receipt. Soren full web rerun requested; no repaired-source PASS claimed. Latest Celeste consent and Mira abort follow-ups are in the same integration candidate.

Dorian 4d1d384 append-only lead consent audit link and Mira 17482af direct lookup commit-abort/settled-revocation regressions merged in c5baec1. These additions postdate Soren 8eb web failure and ba615 V2 structural pass; targeted SQL/HTTP and web checks are requested, not yet observed on c5baec1. Frozen V1 OpenAPI remains byte-unchanged versus bbf2353 by read-only `git diff --quiet` exit0.

Registry hardening: the active V2 operation allowlist now lives only in `V2RouteRegistry::ACTIVE_OPERATIONS`; `routes.rb` no longer duplicates names. Non-boolean `enabled`/`controllers_ready` values and an explicit `getWorkerJob` proposal override fail before any route registration. Source tests added; Soren exact fleet Ruby route test requested, NOT_RUN on this hardening SHA.

The three protected organization/roster operations were aligned from `candidate` to `active` in OpenAPI because their isolated source routes were already registered. A structural test now requires all OpenAPI active operation IDs to match the Rails active allowlist exactly; `active` is source registration only, not acceptance. Soren structural rerun requested; no PASS on this status-alignment SHA.

## ATT838 internal URL boundary

Config and RBS accept only the exact internal gateway URL paired with the dedicated HMAC key. Test cases cover valid, missing-key and three alternate-host/scheme/path failures. This is source-only, NOT_RUN; no network call, public route, storage token or release claim.

## PREF822 candidate activation

Exact integrated Theo 81cb542 and Lyra a54be31/748e53b/7550afb source is wired through canonical V2 draft.6, registry and the existing production personal settings route. The browser gateway argument order is reconciled with Lyra’s port. OpenAPI V1 remains unchanged by source diff; generated V2 declaration and fleet database/HTTP/browser tests are requested, NOT_RUN here. No credential fields or actor identifier enter the preference write.

## OUT839 restricted-role helper seam

Dorian b487019 supplies actual-role tests. SEC802 access.sql grants app_read EXECUTE on the existing draft-write and content-read helper functions because RLS evaluates under that role. The helper bodies retain protected marker/session digest, tenant and current-role gates, and PUBLIC/worker are still revoked. This candidate needs disposable PostgreSQL positive and copied-digest negative execution on the exact integrated SHA; NOT_RUN here.

## ATT838 signed request candidate

`apps/server/lib/elevateo/attachment_gateway_request.rb` constructs only the fixed internal POST body and HMAC header value from the ADV085/Sabine frozen wire. It rejects extra keys, invalid IDs/digest/hints, expiry outside now..now+30 and oversized body. Tests cover exact ordering/signature, extra/wrong operation and expired/long-lived/malformed authority. Source-only, NOT_RUN; transport, repeated authorization and binary response are pending gateway and controller integration.

Sabine ADV095 corrected the wire after cb1ec5b: context_id is UUID and exactly equals context_uuid. Cassian signer source/test corrected accordingly; the previous generic hint validation is superseded. Integrated sequence migration 00016 requires Sabine/Leonie to use 00017 or later for attachment gateway helper.

## ATT838 private transport candidate

`attachment_gateway_client.rb` uses only the exact internal host, dedicated HMAC key and one POST. It refuses an open Rails transaction, missing config, redirects/unexpected statuses, wrong headers/length and >10 MiB. It returns private bytes to a future caller only; no controller or public route is connected, and the required post-fetch session/read recheck is not yet implemented. Source tests cover valid, 404/invalid response and transaction/missing key; Docker/interop NOT_RUN.

## Web lint repair after cb1ec5b fleet receipt

Root reported no-control-regex offenses at v2Contract.ts 68/87 and v2PreferencesGateway.ts 11. Replaced those patterns with code-point predicates for C0/DEL/C1, added C1 source/display-name regressions, and corrected two old preference gateway tests to the current input-first method order. Exact Docker lint/type/unit/build NOT_RUN on this repair; no broader PASS claimed.

ATT838 follow-up: Sabine specified the signed authorization_version shape as exact 43-character SessionCrypto URL-safe token. The signer and client test fixtures now enforce that size; earlier 16..256 wording is superseded. Root reserved migration 00018 for the helper after Maeve00016/Corin00017. Fleet tests/interoperability pending.

## ATT823 inert metadata controller

`V2::InboxAttachmentsController#index` is an unregistered adapter. It validates UUID path/query input, uses the current authenticated read-only snapshot and `ThreadReads#direct_message` for exact mailbox/thread/message access, then calls Nadia’s bounded metadata service/repository without returning storage keys. It has no active route or browser production port. Source-only, NOT_RUN; Ruby Steep/HTTP/RLS, private byte proxy and post-fetch recheck are pending.

## Fleet SEND809 affected-suite receipt

Rowan relayed Soren exact `backend-cb1ec5be4546/028-ruby-suites.txt`: six named send DB suites (5/37, 4/40, 8/72, 3/24, 6/82, 9/89) show zero failures/errors on cb1ec5be. Overall Ruby still FAILED from other suites and Steep; cleanup PASS. No HTTP, worker drain, browser or later integrated-SHA PASS follows from this bounded receipt.

## Gateway bootstrap and ingest import

Imported Leonie OPS820 3fd0dcb bootstrap/scanner scripts and Corin MAIL819 5dc075d/cfe1b72/664b4a9 held IMAP attachment ingest. Migration order is Nadia 00015, Corin 00017, Sabine 00018; Maeve sequence has earlier-dated 00016. These are source candidates only, Docker/role/scan runtime NOT_RUN on current Cassian SHA. No public gateway route or live source activation.

## ADV101 private transport repair

Vera independently reviewed exact 7b41521 plus signer, 238 LOC, one P2 aggregate timeout defect (4.20/KLOC): per-read/write Net::HTTP timeouts reset for a trickled body. Cassian now wraps only the private HTTP exchange (or injected transport), outside DB work, with one <=5s Timeout and an explicit monotonic deadline check; slow-trickle test authored. Independent repair re-review and Soren Docker execution are pending; this does not activate the route.
