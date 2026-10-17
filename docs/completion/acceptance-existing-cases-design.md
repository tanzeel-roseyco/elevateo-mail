# Existing-contract acceptance cases — frozen implementation brief R1

Date: 2026-10-14 Australia/Sydney. Task `task_d1da752a40c7`, dispatch `ctx_6a0cdf9e4b2f`, run `run_5cc7ae2ab900`. Coordinator: `term_21979c47-a755-49ff-b1ae-034920820a08`. Design worker: `term_9987a7b6-7c4d-4cdd-a467-0cd46b334075`.

**Design and three exact-model consultations complete. No application code or tests were implemented or run by this worker.** Freeze four candidate browser cases using existing real APIs and actors, plus two accurate unavailable reasons. Live membership revocation remains deferred. Root owns runtime integration, review, execution and evidence sealing; Fable owns frontend fixes.

<!-- AIDEV-NOTE: Preserve the 26 scenario IDs and existing evidence sets; named alternatives are evidence text, not extra cases. -->

The decision follows the first bounded task in [acceptance-controls-design.md](acceptance-controls-design.md) and [test-expansion-plan.md](test-expansion-plan.md). It expressly excludes the former plan's stale-version case until independent no-overwrite evidence exists. The frozen consultation packet, opinions, per-recommendation decisions, review ledger and execution metadata are under [.planning/consultations/results/acceptance-existing-cases-r1](../../.planning/consultations/results/acceptance-existing-cases-r1/synthesis.md).

## 1. Current evidence and consultation gate

The assigned runtime baseline was a failed full auth/mailbox/draft R3 integration at drafts-schema creation, with root repairing that separately. Reported prior checks were 51 JavaScript acceptance, 12 evidence and 14 Python unit passes; frontend had 611 unit and 270 browser fixture/mock passes, 72 skipped. These are historical, separately labelled checks, not a real browser acceptance pass. During consultation, root additionally reported Auth/RLS concurrency PASS in downloaded R3 log018: three schedules, 7.48 seconds, exact catalog restoration and no owned sessions (`msg_93d8a941229b`). That report was not independently inspected here and proves neither application migrations nor integrated acceptance.

Actual synthesis identity: Codex GPT-6 Astra MAX, verified by root's launch/effective-model message and Orca terminal metadata. Fresh independent CLI opinions returned exact `claude-fable-5`, `claude-opus-5-5` and `claude-fable-5-1` model/canonical identities, distinct sessions, exit 0, success and is_error false. Tools were disabled; no other opinion was supplied to any reviewer. Current CLI help/version 2.1.296 and supported safe-mode/empty-tools/no-session-persistence options were verified before launch. All completed within their 900-second bounds. [Metadata](../../.planning/consultations/results/acceptance-existing-cases-r1/metadata.json) records sessions, timings, input/output hashes, actual returned usage and identity limits. [Synthesis](../../.planning/consultations/results/acceptance-existing-cases-r1/synthesis.md) accepts, adapts or rejects every recommendation and preserves dissent.

Section review: sufficient consultation for this narrow existing-contract slice; no approval is inferred for new controls, new fixture contracts, production or activation.

## 2. Source freeze and inspection limits

Coordinator HEAD: `d2de43b438ad9fb5f003d3e808a6181dbd827632`; backend HEAD: `5785eba47f3709debb2815c8d86608f7e62d02f3`; frontend HEAD: `284aa71d20015b2b9b6a2f00beec9fa3087efe91`. Working trees were dirty. The [source manifest](../../.planning/consultations/results/acceptance-existing-cases-r1/source-manifest.json), not HEAD alone, identifies exact supplied bytes. Common packet SHA-256: `05f3699cae0e6b54e5b75d3913b88ec0c5e2b6893a90610a7336b2cddbfb040e`.

| Repository / source | Physical lines | Review pass | SHA-256 |
| --- | ---: | --- | --- |
| Coordinator `tests/acceptance/playwright/unavailable.e2e.ts` |22| A | `7a9e882e53d03e4c24b951ae615a6809aaab6b0b119670d7de21609ccd7c8852` |
| Coordinator `tests/acceptance/playwright/cases.ts` |23| A | `e588cec7c78380d039dc94d0d79e41b46e815cf932f6391ebfb4a427faea5298` |
| Coordinator `tests/acceptance/playwright/draft.e2e.ts` |46| A | `45f62ba8a546331949cb3edef8e23517ceb5267c45478f335d9e47606daa3d59` |
| Coordinator `tests/acceptance/playwright/support.ts` |53| A | `57e6cbdd67e479f3003b926e089d605118b3e88189a35c8a349599b579a96beb` |
| Coordinator `tests/acceptance/shared/seed-contract.json` |22| A | `221d49259f52f2dcc9944a3af7744327cc2cbc1a3030fa4d13ae85b292e6a952` |
| Backend `ops/tests/be02/acceptance_seed.rb` |181| B | `d11cc2e713ad7f3bdc60722198606645139419a22d7a2c88ec574bed59a774a3` |

Pass A 166 lines and pass B 181 lines satisfy the≤200-per-pass and≤400-total instruction: **347 unique physical source lines**. No additional application source was inspected. Required documents were supplied as actual contents; historical omissions were identical across opinions and recorded in the manifest. Prior opinion outputs were excluded. The matrix's five relevant complete scenario objects, partition policy, budgets and status definitions were included as documentation. Matrix SHA-256 is `92daafdec8660e3b779f9a209622516cda5d29fa30680b13a3bab9aff47edaf4`.

Uninspected dependencies: actual frontend/session/gateway sources and selectors beyond observed test references; Rails routes/controllers/services; runtime seed support/Auth setup; migrations/RLS; shared config/schema/report implementation; reporter/status mapping; existing boundaries/credential/screenshot helpers; Playwright configuration and package implementation. They are implementation-writer verification tasks below, not implicit findings from this review.

Final [integrity notes](../../.planning/consultations/results/acceptance-existing-cases-r1/integrity-notes.md) preserve late README/state/documentation mount-status drift and distinguish the prompt argument's LF hash from its private CRLF copy. All six source pins and all three HEADs still match. Five task-local launcher lines were additionally inspected for provenance, taking total source/control reads to 352; no application dependency or opinion input was added.

Section review: the pins support bounded design, not whole-application review. Do not expand this worker's source budget. Give later changed modules their own≤200-line review assignments.

## 3. Frozen scope and allowed implementation paths

This design does not assign an invented owner/branch. Root assigns the acceptance author and coordinates source freeze with the schema and mount owners. Application code, frontend changes, backend API additions, seed changes and fleet operations remain outside that author's slice.

| Path in coordinator | Allowed change |
| --- | --- |
| `tests/acceptance/playwright/unavailable.e2e.ts` | Remove only each of the four candidate IDs when its corresponding real scenario is authored; correct READ-001-F2 and DRAFT-003-F2 reasons as below. Preserve every other ID and reason. Update affected AIDEV intent/comments atomically. |
| NEW `tests/acceptance/playwright/auth-duplicate.e2e.ts` | AUTH-001-F2 only. |
| NEW `tests/acceptance/playwright/auth-delayed.e2e.ts` | AUTH-003-F2 only. |
| NEW `tests/acceptance/playwright/read-empty.e2e.ts` | READ-001-F1 only. |
| NEW `tests/acceptance/playwright/draft-privacy.e2e.ts` | DRAFT-008-F1 only. |
| NEW `tests/acceptance/playwright/real-transport-gate.ts` | One small, task-local, one-shot authentic-traffic hold/counter/cleanup helper if needed by both AUTH cases; no global mutable state or generic fault framework. |
| NEW `tests/acceptance/playwright/real-transport-gate.unit.spec.ts` | Meaningful success/failure/cleanup regressions for that helper; fake transport objects only in this unit lane, never fake business JSON in real acceptance. |

Do not overwrite an unexpectedly existing proposed new file. Existing `auth.e2e.ts` and `read.e2e.ts` already exist and were not inspected; they are not new-file targets. Reuse established helpers unchanged when compatible. Do not edit `support.ts`, `cases.ts`, existing `boundaries.ts`, shared schemas/config/reporters, expected-ID sets, matrix, package/lock, runners, proxy, seed or backend/FE repositories. If an existing guard cannot represent a genuine current response, pause that case for a narrow contract decision; do not use a cast, weaken validation or silently expand this allowlist.

Root alone updates README Current state, state.md, documentation, task tracking and global code-reviews.md with the implementation commit. This design worker does not touch those shared files. No commits or PRs were made here.

All 26 IDs remain present exactly once per declared Playwright lane/attempt. Moving an ID from `unavailable` into `scenario` changes the authored partition, not its evidence identity. Never keep a second unavailable registration for the unexercised alternative of the same ID. Put that alternative's limitation in existing partition/evidence text and the coverage ledger. Expected Selenium/CDP and other evidence sets remain exactly unchanged. Four authored candidates would reduce static unavailable registrations from 16 to 12; this arithmetic is not a promise of 14 runtime passes.

Section review: four cases plus one narrow transport helper is the ceiling, not a demand to add every optional abstraction. No fixture observer, Rails barrier, evidence field, negative proxy control or public product behavior changes.

## 4. Writer preflight before edits

Run these as read-only source/document verification under the writer's own bounded assignments. Record exact file/hash/line evidence and the answers in the implementation handoff before coding; do not guess routes, selectors, timeouts or statuses from opinion prose. Search existing AIDEV anchors in every file to be edited. Current consultation pins must match, or root classifies the drift; material contract changes return to consultation.

| Verify | Required result |
| --- | --- |
| Config/report/discovery | Real lane uses existing validated baseURL (`http://app.test` in the current private topology), root-owned production app, one worker and real Auth/Rails. New `.e2e.ts` discovery is confirmed. Existing reporter maps unavailable cases honestly and emits one record per ID. Trace/HAR/video and automatic failure attachments cannot capture credentials/session bodies. |
| Login/challenge | Actual `GET /v1/auth/login-challenge`, `POST /v1/auth/login`, request deadline, challenge refresh/consumption behavior, pending/error/retry UI and accessible control names. `Sign in` heading and `Account and sign-out` are inspected helper references, not proof of the complete runtime flow. |
| Logout/protected response | Actual logout control and `POST /v1/auth/logout` response contract; a protected GET that the SPA really issues while logout remains possible; its exact request/session-header behavior, success guard and deadline. Prefer a read-only endpoint, never a held write. Verify the subsequent protected-denial endpoint/status/code. |
| Empty bootstrap | `/v1/session` and `/v1/mailboxes` response shapes/guards, legitimate bootstrap request count, accessible empty state, actual primary mailbox URL and denial behavior. Inspect query/cursor behavior; do not assume an array named `items`. |
| Draft privacy | Actual list query/cursor schema, detail path and non-enumerating denial contract; current response limits and guards; role/capability bootstrap; draft-creation/save/list/detail selectors and URL format. Inspected tests use New draft, Draft, Subject, To, Message, Save draft, Saved version 1 and Back to drafts; verify those against frozen FE. |
| Actor contexts | Real `revoked` actor has org membership/no mailbox and login 200; composer and approver both have read/compose in the same runtime primary mailbox. Runtime seed is `kind: runtime`, with real generated identities, not the example JSON. Distinct browser contexts get the existing non-secret baseURL/options and no copied cookie/storage state. |

No application tests run on the host. Root alone runs all application checks inside Docker after its schema/readiness prerequisites pass. If the frontend lacks an expected accessible state or suppresses every eligible response, report that concrete limitation to root/Fable; the acceptance author cannot patch FE or replace a real response with fixture JSON. Endpoint/status ambiguity is not resolved by accepting any non-2xx result.

Section review: these verifications complete existing-contract details, not a new approval question. Any required new API, actor or fixture contract is a separate task.

## 5. Shared gate and evidence rules

- Match exact validated origin, method and pathname; correlate the selected request object and page/context. Register request/failure/response listeners before the triggering action. Never count unrelated bootstrap traffic as the selected request. Observe duplicate matching requests; fail rather than quietly letting extra submits pass.
- Read only routing metadata and bounded, validated response data needed for assertions. Never inspect login postData, request cookies/authorization/CSRF headers, tokens or storageState. Do not attach full URLs, raw responses, errors or logs. Use existing credential fill/origin checks unchanged.
- A held login request is not forwarded. Abort that genuine request once. A delayed-response gate must fetch a genuine protected success **before** logout and forward the original response object unchanged afterward; do not deserialize/rebuild JSON or supply invented status/body/headers. Label it browser transport re-delivery, not a backend failure injection or the original socket.
- Use event handshakes, not sleep-based races. Freeze a hard hold ceiling≤5 seconds and below the verified relevant client abort deadline with at least 2 seconds margin. If that margin cannot be established, leave the gate case unavailable; the matrix's ten-second write deadline does not establish an Auth/read deadline. Each explicit event/UI wait≤10 seconds; the full case stays inside the existing test timeout. Observe no automatic retry/resurrection for a full 2-second bounded window after the decisive event. An immediate successful `toHaveCount(0)` is insufficient to establish that window.
- Model one terminal gate outcome: aborted, delivered, timed out, failed or cancelled. Abort events use `requestfailed`; never leave `responseAt` waiting for a response from an intentionally aborted request. Require successful delivery completion for the delayed-response partition, not merely a response event or a fulfilled helper promise.
- Every path removes its exact route and listeners, settles/rejects holds, disposes held response resources and closes extra contexts in bounded `finally`. Preserve both the primary failure and cleanup failure as fixed safe stage facts within the existing reporting mechanism; any cleanup failure fails the attempt. Do not swallow an unexpected rejection or leave orphan promises. If the existing wrapper only emits a generic failure, accept that limitation rather than changing the shared schema.
- Unit regressions use fake transport handles to prove helper mechanics; they do not count as real acceptance. Application observations are recorded only after their corresponding expectations execute. Existing assertion/evidence arrays are enough; no new metadata fields or alternate evidence IDs.

Section review: arbitrary exception names and constructor names can be attacker-controlled; use fixed stage vocabulary, not a supposedly safe exception-name export. Keep timing controls local and small.

## 6. Exact case contracts

### SCN-AUTH-001-F2 — duplicate submit, genuine abort, real retry

1. In a fresh signed-out context, install the gate/counter and obtain the application's normal challenge/form. Fill credentials through the existing protected helper, without logging values.
2. Submit normally. Wait until the genuine login POST is held before forwarding. Attempt one further ordinary submit through the existing UI: for example, Enter in the form if the button is disabled. Do not force-click a disabled button, dispatch a synthetic submit handler or bypass the application guard. Confirm a usable pending state and exactly one matching browser POST, with zero upstream forwards.
3. Abort the held request before any upstream fetch/continue. Observe its specific requestfailed outcome; assert bounded accessible error/retry UI, no authenticated controls/mailbox and no automatic additional login POST throughout the 2-second window. This is a transport abort, not a 503 from Auth.
4. Remove the hold, then use the normal retry UI once. Let the application decide whether to refresh its challenge. Observe any real challenge fetch without inventing one or assuming that an aborted-before-forwarding challenge was consumed. Require exactly one additional login POST, its genuine validated 200 and the authorized account/mailbox UI. A broken retry fails; the test cannot refresh the page or repair state solely to make it pass unless the documented retry UI itself does so.
5. Record exactly two browser login POSTs: one aborted without forwarding, one genuine successful retry; no uncontrolled submit/retry. Browser counts do not establish a hidden Auth exchange count inside Rails. The service 503/outage alternative remains unexercised and is named as such in the existing evidence text.

Failure acceptance: duplicate POST, missing bounded error, automatic retry, rejected/failed real retry or cleanup failure produces a failed attempt. Do not weaken the request count or mark this as an Auth-service resilience pass.

### SCN-AUTH-003-F2 — genuine stale response delivered after logout

1. Sign in normally and establish a positive control: the chosen protected view actually loads authorized data. Trigger a subsequent real SPA protected GET that can be held while the same session's logout UI remains usable; a standalone API call that never feeds the UI is insufficient.
2. Fetch the authentic response through the one-shot gate using the original request context/headers and verify its genuine pre-logout success. Hold that exact response. Reject pre-logout 401, unexpected redirect, malformed/oversize payload or an unavailable hold mechanism as an invalid stimulus.
3. Use the logout UI in the **same browser context/page**. Observe its documented real success and signed-out UI before release. Start the bounded resurrection watcher before releasing bytes.
4. Release the original response unchanged, observe delivery completion without request failure, then confirm throughout the 2-second window that authenticated account controls, protected region and target data never reappear. A positive control from step 1 prevents an always-empty page from passing.
5. From this same post-logout browser context, make the documented genuine protected request and require its exact denial contract and absence of protected data. Label this post-logout access behavior. Cookie clearing alone does not prove a captured pre-logout cookie would be rejected, so **do not claim original-cookie invalidation**; that is separate session/backend evidence. Do not create an unrelated anonymous context as the probe or capture/re-add authentication cookies for this case.

Cancellation is not delivery. If logout cancels the selected request or fulfillment fails because the page closed/navigated, record a fixed cancelled/delivery-unproven reason; never pass this selected partition merely because the UI stayed signed out. During runtime an attempted but undeliverable stimulus fails honestly; if source/preflight establishes the stimulus cannot be delivered, retain the static NOT_RUN reason before freeze. Do not silently switch to the matrix's repeat-logout alternative. Root may separately scope that alternative if needed.

This proves client response handling against authentic upstream bytes. It does not prove lock ordering, a racing write's durable outcome, provider behavior or Auth-service fault tolerance.

### SCN-READ-001-F1 — active organization with zero accessible mailboxes

1. Use the existing `revoked` alias in a fresh context. This actor retains organization membership and real unbanned Auth identity while mailbox grants are empty. `no_membership` is a different login 404 partition and is unsuitable.
2. Observe genuine login 200, valid active session and 200 mailbox response whose validated collection is empty. Register bootstrap response/counter observers before sign-in so a fast response cannot be missed. A status/content-type check alone does not prove emptiness.
3. Assert the verified accessible empty state, no invalid selection, no thread content and no mailbox link for the seeded primary mailbox. Freeze the legitimate bootstrap request allowance from the actual FE flow; after settlement there must be no further unsolicited mailbox fetch during the 2-second window.
4. Navigate to the actual seeded primary mailbox route. Require the documented denial/empty behavior and no protected seeded thread/body. Permit only the explicit fetch triggered by that navigation; it cannot be misclassified as a background loop.

This is read-only and engine-safe. It covers the static zero-mailbox partition, not live revocation, generation changes or malformed-response validation. An absent/broken empty UI is a real product finding for Fable, not a fixture blocker.

### SCN-DRAFT-008-F1 — privacy between compose-capable members of one mailbox

1. In separate isolated contexts, sign in composer and approver. Validate their genuine current session/mailbox capabilities and common primary mailbox identity; seed aliases alone are not an authorization assertion. Treat a missing browser/context capability as a fixed setup failure rather than using a non-null assertion.
2. Through the existing UI/API save path, composer creates a case-owned draft with a fresh UUID/nonce and unique bounded synthetic subject/body. Use a private sentinel specific to this draft; the shared seed marker alone is not unique. Verify actual save receipt and author-visible exact detail. Do not mutate the shared seeded draft.
3. Approver creates a separate small own draft as a positive control and verifies it appears in a successful authorized list/UI. This establishes compose rights and a functioning list, so a403/empty failure cannot masquerade as privacy. Keep its sentinel distinct from the composer's private sentinel.
4. As approver, inspect genuine successful draft-list responses using the documented query shape and validated bounded JSON. Walk cursors to termination, including every page, checking the composer's draft ID and private sentinel are absent. Freeze≤50 items/page,≤2048 cursor characters and≤10 pages/500 rows, consistent with current matrix limits; reject repeated cursor, schema violation, over-budget body or unfinished pagination at the cap. If the actual contract has no pagination, verify complete-list semantics instead. Never pass an incomplete scan or assert absence only because the target was pushed off page 1.
5. Probe the composer's exact draft ID using the real detail GET and the guessed-detail UI route. Require the documented non-enumerating denial, no author-private ID/subject/body/recipient values in the response or rendered fields, and no leaked draft in the list UI. Compare the denial's documented status/code/shape with a valid nonexistent UUID under the same approver context; do not require equality of incidental request IDs. A500, network failure, malformed response or generic non-2xx is not proof of authorization.
6. Re-read the same draft as composer and verify its genuine version and exact saved fields remain intact. This is API/UI observable continuity, not an independent DB no-write assertion. No PUT/DELETE/membership mutation probe is added.
7. Close the additional context in bounded finally. Leave only task-created synthetic drafts in the disposable run dataset; there is no inspected delete API. Root discards that owned dataset at the normal cleanup boundary. Fresh nonces and bounded pagination prevent cross-case name collisions; do not re-seed an in-use database.

Same-mailbox and same compose capability are essential. An `other_org` probe proves a different boundary and cannot substitute. This F1 case does not claim consumed-state, sort ordering, 256-code-point truncation or uncertain-reload recovery.

Section review: all four cases require both a real positive control and the selected negative behavior. Any status upgrade comes from root's actual run, not from this design or the consultation votes.

## 7. Deferred cases and corrected blocker text

**READ-001-F2 remains NOT_RUN.** Recommended unavailable reason: `No isolated real membership-revocation fixture with verified accepted mutation/restore API, or genuine malformed/over-budget response control, supplied.` The matrix permits revoked membership **or** malformed/over-budget responses. Preserve all existing global malformed/null/oversize boundary tests and their real evidence labels; choosing another alternative never erases them or claims they have run here.

A later revocation task needs: a verified existing accepted manager endpoint/payload/preconditions; a genuinely reserved actor or separate disposable engine/attempt dataset; exclusive ownership; captured non-secret initial grants; a real revocation acknowledgment; observed newer authority context; bounded real-API restoration in finally; verification of restored grants at the **new** generation; and quarantine/discard if restore fails. Never rewind generations or reuse a stale seed authorization version. The current nine aliases do not establish a spare isolated reader, and no restoration contract was inspected. Adding an actor or fixture field requires separate opinions before implementation.

**DRAFT-003-F2 remains NOT_RUN.** Recommended reason: `No controlled recorded-conflict or unrelated-operation lookup response with independent outcome/recovery evidence supplied.` The matrix stimulus is recorded conflict/unrelated operation, not expiry. Do not implement expiry, uncertain save, stale-version no-overwrite or a ledger probe under this ID in this slice. Its independent DB-observer/recovery task remains outstanding.

The corrected prior seed blockers for READ-001-F1 and DRAFT-008-F1 disappear only when each has a real authored scenario; if authoring is blocked by a verified UI/API limitation, replace the false seed explanation with that precise limitation and keep NOT_RUN. No fake pass or duplicated ID.

Section review: reserve-and-restore is a separate fixture design, not an assumed API in a finally block. Restoration failure cannot be hidden and cannot contaminate later cases/engines.

## 8. Analytical tradeoffs and adversarial traces

Opus 5.5 was the dedicated deep-design reviewer. The following are reasoned traces, **not executed simulations**. Obsidian was unavailable; no connected or measured tradeoff simulation is claimed.

| Choice / analytical trace | Decision and limit |
| --- | --- |
| First POST is held; user submits again; second POST appears | Counter fails before retry. A response-only waiter could miss the extra request. Count the exact request stream, not merely successful replies. |
| Abort occurs before upstream; app keeps or refreshes challenge | Observe its real retry. Requiring a new challenge regardless of contract rejects a valid implementation; artificially refreshing masks a broken one. |
| Protected success is captured; logout completes; old body arrives | Delivery plus sustained signed-out UI establishes this browser boundary. If cancellation prevents delivery, the harder boundary remains untested. |
| Cookie is cleared; same-context protected request is denied | Demonstrates post-logout access behavior. Re-injecting a cookie adds secret-handling/state mutation and tests another boundary; keep it outside this slice. |
| Shared reader revoked; test throws; restore fails | Later engines inherit a poisoned fixture. Defer until reserved lifecycle/exclusive dataset and real restore are designed; no generation rollback. |
| Approver list unexpectedly fails or target lies beyond the first 50 items | An absence assertion alone passes vacuously. Require own-draft positive control, valid 200 responses, complete bounded cursor walk and detail probe. |
| Gate handler throws while the test is also failing | Cleanup must settle outstanding holds and fail visibly. Generic swallowed errors can leave a hung context or misleading later failure. |
| Browser gate versus server/proxy barrier | Browser gate is the smallest authorized mechanism for duplicate submit/stale UI. It cannot establish Auth outage, server lock schedules or DB outcomes. Server/proxy controls remain separate tasks. |

All three opinions offered a simpler alternative: implement only empty mailbox, draft privacy and blocker corrections, leaving AUTH cases unavailable until backend/proxy controls exist. The chosen design permits the two narrow browser gates with strict delivery/count labels; it retains that simpler fallback if actual client behavior cannot support the selected stimulus. It does not make an unsupported scenario pass merely to reduce the NOT_RUN count.

## 9. Regression, runtime and output acceptance

The writer/root must meet these gates in order. **All are NOT_RUN for the proposed changes.** No host application tests or local services were used here.

1. **Static boundary:** exact allowlist diff, source pins, AIDEV comments, strict TypeScript without unjustified any, no new dependency and no unused helper; all 26 IDs exactly once and every existing expected lane/attempt set unchanged. New statements must correspond to real expectations executed before evidence summaries. Verify configured lint/typecheck/build commands from the actual package/config; do not invent a linter or claim a missing one passed.
2. **Helper regressions inside root-owned Docker:** successful single hold/release; expected abort with no pending response waiter; duplicate matching request rejected; upstream/handler failure propagated; unreleased hold deadline fails; cleanup after assertion failure settles and removes exact listeners/routes; cancelled delivery never produces success. Exercise the two most likely failures for each added mechanism. These unit doubles remain unit evidence, not real Auth/Rails acceptance.
3. **Output safety:** run existing evidence/report contract checks without changing expected sets. Use synthetic canaries in a controlled unit output check to reject raw credential/request bodies, cookies/tokens, arbitrary exception messages and unsafe paths; no raw browser traces/HAR/storage state. Validate bounded fixed failure/stage text through the existing wrapper. No app credentials are requested by this task.
4. **Root readiness:** schema/migration repair, real seed and full private topology must pass their own root-owned readiness; freeze FE/BE/harness bytes, package/image/browser identities and runtime seed. An Auth/RLS-only pass does not satisfy this prerequisite. No live sending, account linking or public network endpoint is enabled.
5. **Real execution:** run the unchanged full 26-case Playwright inventory for each currently declared engine/run evidence set, with one worker. Every attempted candidate must meet all steps in section 6 using genuine Rails/Auth. Preserve first failures on retry; if setup fails, emit honest NOT_RUN/blocked records for expected cases rather than omitting them. Existing Selenium/CDP exact sets remain unchanged and separately labelled.
6. **Negative observation and persistence limits:** AUTH001 counts 1 before abort and 2 after the single real retry; AUTH003 has genuine pre-logout success, real logout, delivered unchanged response and no resurrection for the full window; READ001 has valid empty collection and no fetch loop; DRAFT008 has functioning approver-positive list, full bounded exclusion, non-enumerating detail/UI and exact author reread. Do not turn missing delivery, a 500 or an incomplete list walk into a pass.
7. **Isolation/repeatability:** root repeats the new cases against the already used disposable dataset within one engine to expose draft accumulation and leaked listeners; ordinary engine/whole-run attempts retain root's separately named fresh datasets where configured. Never rerun the seed on used Auth state. Compare the retained first/repeat outcomes and unchanged later-case authority; no shared membership changes are allowed.
8. **Actual visual QA:** root observes real pending/error/retry, post-logout, empty-mailbox and forbidden-draft views in the built app, including keyboard/focus and accessible names. Retain only bounded sanitized screenshots of synthetic safe views under existing artifact rules; exclude credential/session-bearing phases. Browser assertions or mock counts alone are not manual visual verification.
9. **Review and handoff:** fresh adversarial reviews cover all changed source in≤200-line assignments with a dedicated design reviewer, using the full user rubric and STANDARDS. Root records confirmed defects/density in code-reviews.md and synchronizes README/state/documentation in the implementation commit. Root seals hashes/statuses/artifact paths after all checks, then cleans only task-owned disposable Docker resources under the existing protocol. No publishing/deployment follows from this brief.

Section review: runtime acceptance is deliberately stricter than a green helper test. A case whose genuine stimulus cannot be established remains an exact blocker, and other independent cases can still proceed.

## 10. Review result and remaining work

This 347-line design review reconfirms **three prior blocker/coverage findings**: wrong DRAFT-003-F2 expiry description; READ-001-F2's malformed-only description; and one grouped seed-inventory finding affecting READ-001-F1 and DRAFT-008-F1. Defect density: **3/347×1,000 = 8.65 reconfirmed defects/KLOC**. Newly demonstrated production defects: 0; new-production-defect density 0/347. Conditional risks and uninspected dependencies are not inflated into defect counts. Detailed rubric coverage and opinion-finding dispositions are in [review-ledger.md](../../.planning/consultations/results/acceptance-existing-cases-r1/review-ledger.md). This does not replace root's existing global code-reviews.md or claim full-system review.

Remaining: writer preflight and implementation, schema/readiness completion by their owners, Docker checks, actual browser/visual evidence, bounded post-change review and root consolidation. Live membership revocation and DB-dependent recovery remain separate tasks. No source implementation, Docker resources, commits, credentials or deployments were created by this design assignment.
