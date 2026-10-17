# FE-02 session repair: bounded adversarial review

Date: 2026-10-13 (Australia/Sydney). Reviewer: dispatched Codex worker, task `task_b1545e60d03b`, dispatch `ctx_71e9f430aa1a`, run `run_5cc7ae2ab900`.

**Result: no confirmed defects in the inspected repair. Tests: NOT_RUN.** This is static review, not integration, browser, or release acceptance.

<!-- AIDEV-NOTE: These findings cover only the ranges and source hashes below; runtime acceptance belongs to the validator. -->

## Scope and evidence

Target: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable FE01 R1`. Source context: that tree's `docs/completion/fe02-session-repairs.md`, applicable `AGENTS.md` and `.planning/STANDARDS.md`, and the coordinator's current project state. The full review rubric was supplied in the dispatch. Target HEAD was `284aa71d20015b2b9b6a2f00beec9fa3087efe91`; the reviewed repair includes modified/untracked working files, so HEAD alone does not identify it. Source hashes were checked again after inspection and were unchanged.

The assignment was limited to the two chunks below. Counts are actual physical lines inspected, including imports, comments, and blank lines; documentation and hashes are excluded. No other application code was inspected.

| Chunk | File relative to target | Inclusive range | Actual lines |
| --- | --- | --- | ---: |
| 1 | `apps/web/src/data/http/httpGateway.ts` | 1-113 | 113 |
| 1 | `apps/web/src/data/lifecycle-conformance.test.ts` | 103-150 | 48 |
| 2 | `apps/web/src/app/session.tsx` | 328-357 | 30 |
| 2 | `apps/web/src/app/session-lifecycle.test.tsx` | 40-75 | 36 |
| 2 | `apps/web/src/app/session-lifecycle.test.tsx` | 370-403 | 34 |
| 2 | `apps/web/src/data/signal-propagation.test.ts` | 40-67 | 28 |

`httpGateway.ts` ends at line 113, so the requested line 114 did not exist. Chunk 1: **161 LOC**. Chunk 2: **128 LOC**. Total: **289 unique LOC**, below 200 per chunk and 400 overall. Production code: 143 LOC; tests: 146 LOC.

## Defects and density

Confirmed remaining defects: **0** (P0: 0, P1: 0, P2: 0, P3: 0). Defect density: **0 / 289 x 1,000 = 0.00 defects per 1,000 reviewed LOC**. No reproducible remaining defect was established, so there is no P-level defect entry. This count does not mean the code was tested or that uninspected code is defect-free.

## Checklist and static conclusions

- [x] **Promise-return guarantee:** `httpGateway.ts:81-110` makes all five validating operations asynchronous. A throw from `validated()` is consequently a rejected Promise. Validation still precedes request dispatch, and the same response schemas, size bounds, headers, bodies, and signals are passed through. No new logging or extra request is introduced.
- [x] **Malformed-input regressions:** `lifecycle-conformance.test.ts:113-124` covers malformed email, empty password, oversized recovery email, short acceptance password, invalid logout scope, and non-UUID organization. Each calls the operation directly, expects the canonical rejection, and asserts zero requests. The original synchronous throw would fail these tests before the rejection assertion. Lines 128-140 additionally check absence of a synchronous throw and presence of a Promise for the switch operation. Its isolation to switch is supplemented by the table covering all five changed methods.
- [x] **404 switch versus login:** `session.tsx:347-352` enters `no_organization` only for login. A current switch failure returns `failed` without the login-only scope invalidation or state replacement. The strengthened switch test at `session-lifecycle.test.tsx:377-390` checks failure code, ready status, organization A, and the original context ID. These assertions reject the documented old behavior.
- [x] **Superseded responses:** success at `session.tsx:333` and failure at line 342 compare the same claimed token with the current token before clearing it or mutating session/scope state. A stale 404 therefore cannot take either the login state-transition path or the current switch-failure path. This conclusion is local to `runEntry`; token creation and cancellation implementation are outside this slice.
- [x] **Counting-wrapper ordering:** `session-lifecycle.test.tsx:46-72` merges overrides into `base` before constructing wrappers, then spreads `base` before the wrappers. The inspected session/challenge/refresh/login/logout/switch wrappers each increment once and delegate to the overridden base operation with the original arguments. An override can no longer replace those wrappers. The recovery counter increment at line 75 is visible; its delegate is outside the assigned range and is not claimed reviewed.
- [x] **Signal-test repair:** `signal-propagation.test.ts:55-58` explicitly scripts successful refresh for the live-signal table, consistent with the documented default refresh 401. The pre-aborted fixture table still checks canonical aborted errors. The live assertion remains a truthy resolution assertion: useful for the stated false failure, but not proof of payload correctness, mid-flight cancellation, or actual network propagation.
- [x] **Scope, comments, and maintainability:** the repair uses existing methods and the existing entry-kind discriminator, with no new abstraction, dependency, persistence mechanism, loop, or query. Comments explain Promise semantics, the different meanings of 404, override ordering, and fixture outcome selection. No unrelated preexisting diff was reviewed as a repair defect. Formatting remains the linter's responsibility.
- [x] **Boundary/security check within scope:** input validation remains before fetch; CSRF and context headers remain on the appropriate operations. These edits do not introduce secrets, logging, HTML, or an authorization bypass. Server authorization and transport behavior are outside the inspected ranges and remain unverified.
- [x] **Documentation:** the repair note distinguishes two product fixes from two test-harness fixes, maps them to regressions, and explicitly says the Docker gate is NOT_RUN. The expected next-run total is an expectation, not evidence.

## Analytical cases checked, not executed

| Case | Expected result supported by the inspected code |
| --- | --- |
| Call `switchOrganization` with `organization_id: 'org-a'` and valid proof/context | Returns a Promise; local validation rejects it; no request is issued. The explicit regression checks all three properties. |
| Ready organization A; attempted switch throws canonical `not_available`/404 | Returns `failed/no_organization`; the current session remains ready with context A. The strengthened regression checks these outcomes. |
| A login receives canonical 404 while still current | Invalidates the scope, enters `no_organization`, and returns `ok`, preserving the prior login behavior. Its complete regression is outside the assigned slices. |
| An older entry succeeds or rejects after a newer token becomes current | Returns `superseded` before clearing the newer token or applying state changes. No runtime race test was run or fully inspected here. |
| Override `getSession`, `refreshSession`, or `logout`, then call its counting gateway wrapper | Increments that operation's counter and delegates once to the override; the override no longer bypasses counting. |

## Limitations and remaining acceptance

- **Tests, lint, typecheck, build, integration, and visual checks: NOT_RUN in this review.** No host application execution, SSH, Docker, new agent, paid session, ultrareview, commit, push, or live mail action occurred.
- The supplied frozen pre-repair evidence was 329 unit passes / 14 failures and 237 browser passes / 0 failures / 72 skips. Those results were not reproduced here and do not validate this repair. The independent validator must run a newly frozen source set and report its own results.
- Schema definitions, transport, fixtures, complete controller methods, Shell behavior, and complete test suites were outside the line budget. Null-object validation and exact maximum boundaries cannot be established from the inspected schema call sites alone. Empty-list handling is not changed by this repair. Partial adjacent test blocks were not treated as complete test evidence.
- The switch regression does not directly assert unchanged user identity, scope generation, or object identity on failure; the inspected branch avoids changing them locally. Full controller/browser evidence remains necessary to establish those broader invariants. The new Promise test directly exercises switch; the existing rejection table covers the remaining validating methods.
- This worker made no deep architecture recommendation or design-tradeoff decision and performed no Obsidian simulation; no dedicated design-review acceptance is claimed.
- Only this report was written, as authorized. The coordinator owns aggregation into `code-reviews.md`, project state documentation, independent design coverage, and the next Docker/actual-UI acceptance gates.

## Reviewed source identifiers

| File | SHA256 |
| --- | --- |
| `apps/web/src/data/http/httpGateway.ts` | `91037CA7045F03777581A2F27E4AECEF941531F1AB8DC28CA7159BBD29B158A8` |
| `apps/web/src/data/lifecycle-conformance.test.ts` | `91092BC1770952854F9188F06E459A05ABB84938BD0E11AB898BBB98E37DBB2E` |
| `apps/web/src/app/session.tsx` | `28DDDE7B0E01858011FFDA49B703E40142FC8541B35294E700E7B65B2F2094ED` |
| `apps/web/src/app/session-lifecycle.test.tsx` | `A4487E1F256023ADE530E0B1A47CFE228AE841CD95A049BFCA9BC3732F0A5B9F` |
| `apps/web/src/data/signal-propagation.test.ts` | `8226028A83B9F6B164E2DC6B0C64802323B975DB514F1E520C484E8E94735A35` |
| `docs/completion/fe02-session-repairs.md` (context only) | `A985572A3E188FE450BE4633F3D2967E90820835F096CADB72076E1BAE89BCB4` |
