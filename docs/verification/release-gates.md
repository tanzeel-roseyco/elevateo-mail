# Release gates — local completion

**Current decision: not ready for full local acceptance or live deployment.** The latest frozen C/D frontend passed API generation/lint/typecheck/build, then recorded 581 unit passes/4 failures and 260 mock-browser passes/4 failures/72 skips; BE run4 failed before Rails tests. Repairs and new Auth/D05 tests require real reruns. This is a gate definition, not approval to publish or enable provider credentials.

[Scenario matrix](scenario-matrix.json) supplies stable IDs and expected paths; [authoring plan](../completion/test-expansion-plan.md) supplies disjoint tasks and artifact requirements. Root alone owns integration, fleet-02 execution and scoped cleanup. A gate closes only against a specific immutable frontend/backend/contract/harness freeze.

## Gate ledger

| Gate | Acceptance evidence required | Current disposition | Owner / dependency |
| --- | --- | --- | --- |
| G00 Scope and contract authority | Freeze current vs later acceptance subset against documentation R01–R17, contracts/v1, accepted BE02/BE03 briefs and current local-completion plan; ratify proposed performance/recovery thresholds. | Replacement authority confirmed by root; legacy missing paths are reconciled. Proposed thresholds remain unratified and bounded run scope must be named. | Root; no new blanket standards-approval gate. |
| G01 Source/build preflight | Exact archive/manifests/hashes; dependency locks; Docker build; contract generation check, lint, strict typecheck and existing unit tests all pass on same freeze. A changed repair invalidates only affected evidence and requires a fresh run. | Latest C/D preflight PASS, unit 581 PASS/4 FAIL; browser 260 PASS/4 FAIL/72 SKIP (mock only). First C/D preflight failure is historical. BE4 SQL CASE fixture failed before Rails. | Root + existing repair owners. |
| G02 Real private topology | Pinned DB/Auth/Rails/storage/proxy; no published ports or live egress; exact Origin/Host/cookie/Auth callback policy; deterministic synthetic seed; real login and schema-valid protected response. | Root supplied same-origin api:3000/Auth:9999 configuration and explicit local HTTP cookie exception; combined production-dist/proxy topology NOT_IMPLEMENTED/NOT_RUN. Existing browser config starts fixtures; TLS security remains separate. | Root topology task T0. |
| G03 API, Auth and DB correctness | Current SCN-AUTH/READ/DRAFT/COLLAB/INPUT/NET P0/P1 partitions mapped to actual assertion IDs; runtime role/RLS checks; real Auth logout/revocation/expiry; DB barriers; durable state checked. | Unverified: metadata references do not establish assertions or passes; latest BE run not an application pass. | Existing BE workers + root. |
| G04 D05 uncertainty, locks and pool recovery | SCN-DB-001..005 native SQLSTATE controls, real one-slot pool waiter/recovery, serializer barrier, before/after COMMIT faults and early guard validation; adopted D05 expectations. | Authored/unrun; adopted D05 SHA 0874d5ae89f66bd4fc1972276fe1205678a8b0e1ac6adb8d866e2f72ff293953 has an open checkin-publication race repair. Write-only budget leaves read timing gap; no hard ten-second rollback/no-COMMIT claim. | Existing deadline/Auth-concurrency workers; no duplicate ownership. |
| G05 Real app E2E and GUI | Production build, real Auth/API, current critical paths plus empty/loading/error/keyboard/focus/390px/desktop/zoom/reduced-motion where implemented; screenshots from actual app inspected, with coverage index and reviewer. Chromium broad suite and relevant Firefox/WebKit smoke. | Blocked on G01–G03 and real harness; latest 260 mock passes and 509 PNG artifacts do not close it. Wrong-route narrow capture and recovery controls outside captured viewport need corrected captures; seven reported recovery defects remain under repair. | T1 + root visual review. |
| G06 Independent browser evidence | Pinned Puppeteer/CDP memory/navigation reports and pinned Selenium W3C login/read/draft/logout critical journeys; explicit waits and app assertions; no lane substitution. | Proposed test gaps; complete Selenium image/browser/driver tuple and CDP sandbox launch still need freeze. | T2/T3; same T0 topology. |
| G07 Performance and retained resources | Ratified thresholds plus reproducible workload/hardware profile, p50/p95/error rate, cgroup peak, heap slope and detached-node retaining paths; bounded artifacts and repeated batches. | Unmeasured; proposed read p95<500ms at10 users/inbound<60s/UI<=200ms/motion16.7ms/no>50ms tasks are not results. Heap/RSS tolerances need baseline and owner decision. | Root + T2; G00 thresholds. |
| G08 Review and documentation | User-rubric adversarial review assignments <=200 lines/pass and <=400 total/agent, dedicated design reviewer, STANDARDS conformance; coverage checklist/defects/density in code-reviews.md; relevant README/state/docs synchronized by implementation owner. | This task is metadata planning only and supplies no code-review clearance. | Root; source-specific required named workflow. |
| G09 BE03 and BE04 simulation | SCN-SEND and SCN-FAKE implementation/contract completion; approval atomicity, no connector send, lease fences/cancel/accepted precedence; independent fake-provider durable ledger and unknown-outcome/restore evidence. | Implementation/evidence gap; BE03 local driver cannot close BE04 external acceptance-ledger gate. | Feature owners after BE02 prerequisites. |
| G10 Inbound, private storage and restoration | SCN-INBOUND/OPS-001: bounded MIME, dedup/routing/quarantine/private attachments, backup consistency and measured isolated restore; dispatch hold/epoch remains outside restored DB. | Future contract/implementation and execution gates. RPO24h/RTO4h pilot vs primary-mailbox RPO15min/RTO4h require selected profile, not silent choice. | Feature/ops owners. |
| G11 Product connectors and actual clients | SCN-CLIENT: separate product mailbox MCP and in-app CLI adapters; Mac/Windows/Android/iOS actual install/auth/secure-storage/callback/lifecycle evidence. Native callback/signing production checks recorded separately. | Planned/runtime-blocked. Desktop browser or viewport emulation cannot close a native gate. | Assigned native/connector owners; C++/motion to Opus 5.5. |
| G12 Evidence sealing and resource cleanup | Valid run manifest/case results/hash inventory, retained failures, manual UI index, no secret-bearing output; root verifies exact task containers/images/cache cleanup and host+Docker usage; preserve shared/persistent data. | Latest C/D task cleanup independently PASS; shared Node24.21.0/Playwright1.64.0 images retained. Required again for each new run; host free-space delta is not attributed task reclamation. | Root execution owner. |
| G13 Final activation | All applicable full-product gates pass; nine-address/one-to-two-domain inventory and alias/mailbox policy reconciled; provider/host/DNS/AI/signing credentials supplied only at final activation with explicit authorization. | Deferred; no live-readiness claim or permission for test sends, forwarding, warmup or campaigns. | User/root final activation workflow. |

Latest C/D source archive: `16de18ba1cf2d6f50bcd143d9bb2db5ef5aa145fcb67368e267d82d087598fc5`; source manifest: `7b129dbf14d3b8dccef9c7f28739b43d54b3ed643680249ec8e4d40a96885db8`. See [runtime evidence](fe02-cd-runtime-20261013.md); later repairs invalidate affected evidence only. Matrix paths remain unrun until individually mapped to sealed results.

## Bounded acceptance versus full completion

A repaired BE02 or frontend checkpoint may be accepted only with a clearly named subset, source freeze and unresolved full-product gates. Planned BE03/BE04 or unavailable native runtimes need not stop independent BE02 authoring/execution, but remain blockers to a claim that the entire accepted app is complete. No “all tests passed” statement may omit failed preflight, missing lanes, skips or future required features.

Current integrated collaboration acceptance requires G00's bounded scope definition and G01–G08/G12, with scope-specific performance/native exclusions written explicitly. Full local completion additionally requires all accepted features in G09–G11 and approved performance/recovery measures. Live activation remains separate under G13 even after all local simulation checks pass.

## Result semantics

| Status | Meaning | Acceptance credit |
| --- | --- | --- |
| passed | Assertions actually executed and passed on recorded freeze/lane; required artifacts intact. | Only that case/lane/freeze. |
| failed | Assertion, build, runtime, resource or infrastructure failure after attempt. | None; preserve first failure and diagnostics. |
| not_run | Never started, including downstream work prevented by lint/typecheck/build/setup failure. | None. |
| blocked | Required feature/runtime/contract/dependency unavailable. | None; record exact dependency and independent work completed. |
| skipped | Framework/user-filtered or unsupported execution, with reason and owner. | None; do not add to passed count. |
| historical_pass | Passed on a previous, explicitly identified snapshot. | Historical context only until source-aware revalidation. |
| authored_unrun | Test or harness exists without verified execution. | None. |

Do not label a test “covered” from a declaration/file alone. A proposed partition becomes an authored assertion only after the responsible author supplies file/test name and verifies its expectation. A retried pass retains the initial failure and is reported as flaky until cause/resolution is documented; retries do not erase failed attempts. If an artifact is missing or unsealed, the case cannot satisfy a gate that requires it.

## Non-negotiable assertions

- Missing/expired/inaccessible operation detail cannot establish noncommit; uncertain saves preserve operation identity, frozen submission and newer local text.
- Current Auth/session/generation and tenant/resource authority apply before mutation; older UI responses cannot restore revoked capability. Snapshot-authorized reads can legally finish after later revocation without proving mixed authority.
- D05 observes a monotonic deadline and suppresses success after observed expiry. Actual DB commit and response timing are separate evidence; no asynchronous cross-thread native cancellation shortcut.
- Same-origin real Auth integration must be proven against the built production app. Record fixture, internal HTTP real integration and TLS real integration separately; local HTTP cookie configuration cannot prove TLS security. Fixture runs, mocked Auth, HTTP200 readiness or an API filename are insufficient.
- BE03 `accepted` is provider-acceptance knowledge, never delivery. Cancellation after possible call is uncertain; restoration cannot reopen old approvals or manufacture acceptance.
- Real sends include provider test messages, warmup, forwarding and campaigns; all remain disabled throughout these gates.

## Visual and resource acceptance

The GUI evidence index must enumerate route/state/viewport/browser, relevant SCN path IDs, screenshot artifact SHA-256 and manual verdict. Capture and inspect empty, loading, validation/error, uncertain-save, conflict, revoked/self-loss and normal views; a handful of normal-state PNGs cannot close all visual states. Record keyboard/focus assertions and any actual assistive-technology checks separately from automated accessibility scanning.

Containers and browsers run only inside root's fleet-02 task namespace with no public port exposure. Do not test the app on the host. Use bounded private shared memory and one browser lane at a time unless the fleet reservation explicitly permits more. On failure, root exports evidence, stops disposable services, inspects mounts and removes only task-owned disposable containers/images/cache/volumes by exact ownership. Preserve source, credentials, databases/uploads and other persistent/shared workloads. Record actual host free space and Docker usage; report any safe trim/compaction constraint rather than touching unrelated storage. Project-completion deletion remains governed by the user's separate explicit cleanup protocol.

## Framework evidence basis

Playwright's Docker image supplies browsers/system dependencies, while the matching test package must still be installed; pin package/image versions together and resolve image digests. [Playwright Docker](https://playwright.dev/docs/docker)

Selenium explicit waits should target real application conditions; navigation readiness does not establish SPA readiness, and mixing implicit/explicit waits can produce unpredictable timing. [Selenium waits](https://www.selenium.dev/documentation/webdriver/waits/)

Puppeteer page metrics expose heap, DOM and listener counters, but those counters alone cannot establish detached-node retention or its owner. Keep heap diagnostics distinct from basic counters and bind CDP capability to the pinned browser. [Puppeteer metrics](https://pptr.dev/api/puppeteer.page.metrics)
