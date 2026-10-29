# BE02/FE02 dark recovery repair: bounded adversarial review

## Result

The document-reset repair is statically consistent with the supplied fixture lifecycle. No reset-specific implementation defect was established within the assigned source. One medium-severity test-coverage defect remains: the note-retry test does not substantiate the attempt-identity and single-note guarantees in its title.

This is a completed source review, not a test pass, visual acceptance, production-bundle verification, or BE02/FE02 completion approval. Runtime status: **NOT_RUN**.

## Identity, authority, and coverage

- Reviewer: Codex in Orca, actual model **GPT-6 Astra (`gpt-6-astra`)**, reasoning effort **MAX**. Orca `worker-show` reported matching requested/effective identities, and the terminal projection displayed GPT-6-Astra max.
- Task: `task_f496884875ad`; dispatch: `ctx_c9cb7e79e6e7`.
- Reviewed against the supplied full adversarial rubric, applicable global/project AGENTS instructions, and `.planning/STANDARDS.md`. Current-state and orchestration documentation supplied context only; it was not treated as execution evidence.
- Immutable source root: `ops/local/fe02-dark-repair-20261014-stage/payload/apps/web` under the Local Completion project.
- Both supplied hashes were verified before implementation inspection, verified before the second pass, and checked again before this report. No source drift was observed.
- Only this report was written. No source changes, application tests, Docker operations, servers, SSH, dependency installation, commits, ultrareviews, or subagents were used. No task-owned Docker resources were created or removed.

| File relative to immutable source root | Exact inspected ranges | Unique physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| `e2e/collaboration.spec.ts` | 1-180; 181-254 | 254 | `ce3dfc681eb04fcee6fc4886ead61156db90bedd27745023f940491d1c6c5a7d` |
| `src/dev/fixtureMain.tsx` | 1-34, whole file | 34 | `9800ad02c91f8d5fe1b5b073d11cce1dbdd223526a6a8fc7f05421bc4700053d` |

Pass 1 covered 180 physical lines. Pass 2 covered 74 + 34 = 108 physical lines. Total unique implementation/test coverage was **288 physical LOC**, including comments and blank lines: all assigned lines, within both the 200-line pass limit and the 400-line assignment limit. No other implementation or test source was inspected.

## Repair assessment

`fixtureMain.tsx:10-23` explicitly captures the script from the initial document fragment and creates one gateway at module initialization. `collaboration.spec.ts:25-34` now leaves the document through `about:blank`, loads the requested script fragment into a fresh document, then navigates to the route. This construction addresses the stated failure mode: changing only the fragment of the existing fixture document cannot recreate its gateway.

The repaired dark recovery test at `collaboration.spec.ts:230-254` performs a separate scripted document load for each outcome. The conflict case requires the conflict alert, retained version 2, absent version 3, and both resolution controls. The uncertain-save case requires its different alert, absent version 3, and retry/reconciliation controls. These assertions are designed to distinguish the requested refusal/uncertainty states from an ordinary successful save. A screenshot alone is not the assertion of the state.

The script is consumed at document load, not route navigation; the comments in both files explain this cross-file coupling. The shared helper keeps this requirement in one place. No unnecessary framework, additional domain backend, unbounded hot-path loop, or new persistence mechanism appears in the inspected code.

The file-level test comments restrict the evidence to client policy over a fixture. `fixtureMain.tsx:27-31` renders a synthetic-data disclosure. There is no observed claim in these files that the tests exercise Rails, real accounts, production authorization, or live mail. The comment that production excludes the entry is not independently verified because the build configuration is outside coverage.

## Numbered defects

### 1. Medium - note retry test does not verify its stated identity or deduplication guarantee

**Evidence:** `e2e/collaboration.spec.ts:166-178` is titled `an unconfirmed note is retried under the same id and appears once`. It checks pending-input preservation, retry controls, the repeated error text, and dismissal. It does not observe or compare an attempt ID, compare the two submitted payloads, or assert a resulting note count. The comment at line 173 explicitly says the scripted outage repeats; this scenario never establishes an acknowledged note insertion.

**Consequence:** The assertions can remain satisfied if a retry uses a different attempt ID, and they cannot establish that a resulting note appears exactly once. This is an evidence defect in the authored test, not proof that the uninspected implementation violates idempotency. No baseline diff was reviewed, so this report does not attribute introduction of this defect to the reset repair.

**Minimal repair:** Name this existing scenario for what it establishes: persistent uncertainty preserves the pending note and allows abandoning it. To retain the stronger identity/deduplication claim, add a separately scoped test with an observable gateway boundary and an uncertainty-to-success sequence; compare attempt IDs and payloads across the retry, then assert exactly one resulting note. Keep the persistent-outage case because it covers a different failure path. Any fixture/gateway change needed for that test requires an additional bounded assignment; its existing capabilities were not inspected here.

**Verification needed:** Root-owned execution must demonstrate that the new identity assertion rejects changed-ID retries and that the count assertion rejects duplicate visible notes. This review did not execute either verification.

## Rubric and standards checklist

| Area | Static assessment and limit |
| --- | --- |
| Intended repair and state lifetime | Checked the fresh-document helper against module-scoped fixture construction and both dark recovery branches; runtime NOT_RUN. |
| Happy paths | Authored scenarios cover draft creation, reader mutations, member addition, and search. Assertions were inspected; no execution pass is claimed. |
| Failure paths | Authored scenarios cover draft conflict, uncertain save, pending note retry, removal of the last manager, and whitespace search. Defect 1 limits the note-idempotency claim. |
| Null, empty, and maximum inputs | Missing root is deliberately rejected; empty/non-fixture hashes yield an empty script; viewport absence has a fallback; whitespace search is exercised. Maximum recipient/body/query sizes, empty domain collections, and malformed domain responses are outside the inspected contracts and are not established by these tests. |
| Boundary validation | The fixture parser accepts URL query pairs as script entries without validating operation/example names in this file. Actual script validation and unknown-key behavior depend on the uninspected gateway; no production boundary guarantee is inferred. |
| Security and permissions | Literal script/image-like text and JavaScript-link material have authored DOM assertions. These are fixture checks, not evidence of server sanitization, RLS, authorization, or comprehensive XSS protection. The manager-removal test similarly cannot prove backend enforcement. |
| State integrity | Draft conflict keeps version 2 and blocks version 3 in the dark scenario; the general conflict scenario preserves edited subject text after rebase. No database persistence, race, or real idempotency behavior was inspected. |
| Typing and deliberate errors | The inspected helper parameters and script object are typed, and missing root throws explicitly. Imported type contracts, TypeScript diagnostics, lint, and production error handling remain unchecked. |
| Scope, cohesion, naming, duplication | The navigation repair is confined to a shared helper and callers. Helpers have bounded responsibilities. The unsupported test title is recorded as defect 1. |
| Comments and documentation | Comments explain why a full reload matters and restrict fixture evidence. No stale comment about hash-only rescripting was observed. This report records coverage and limits; broad product documentation conformance is not asserted. |
| Complexity and performance | No database query or materially expensive loop is present in this slice. Gateway/app performance and maximum-input behavior are unchecked. |
| Accessibility and visual behavior | Tests use accessible roles/labels, readiness assertions, narrow/dark viewports, overflow checks, and screenshots. These do not establish computed theme correctness, all nested-container overflow, full keyboard behavior, or visual acceptance without execution and image review. |
| Styling and formatting | Delegated to root-owned linters; not reviewed as defects here. |

## Design tradeoffs and limits

The bounded design question is whether to reset only a fragment or the whole document when selecting a new fixture script. Under the supplied once-per-document contract, fragment-only navigation retains the previous gateway, while a full document departure permits script selection to run again. Subsequent fragment routing retains the newly initialized fixture state. This is an analytical comparison of the supplied lifecycle, not a browser simulation or a broad architecture recommendation.

The configured tools expose no callable Obsidian connection, consistent with the project state documentation. No Obsidian simulation is claimed. A dedicated system-level design review, real backend consistency, and broader tradeoffs remain outside this assignment.

## Execution and unchecked dependencies

**NOT_RUN:** lint, typecheck, unit tests, integration tests, Playwright/browser projects, production build inspection, screenshot review, and manual application verification. Authored expectations were not counted as passing checks. No screenshots or prior fleet results were used as proof in this review.

Unchecked implementation dependencies include `./support`, the fixture gateway and `FixtureScript` contract, `App`, `AuthCompletePage`, draft/note/member/search features, CSS and dark-theme definitions, Playwright configuration and browser matrix, `dev-fixtures.html`, Vite production entry/exclusion, and all Rails/database/auth/storage/mail adapters. The assigned script names and downstream error outcomes cannot be independently validated without those contracts. No additional inspection was undertaken, and no broader compatibility conclusion depends on assuming they are correct.

## Defect accounting and coordinator handoff

- Confirmed review defects: **1** - medium: 1; high/critical: 0; low: 0.
- Reviewed denominator: **288 unique physical LOC = 0.288 KLOC**.
- Defect density: **1 / 0.288 = 3.47 defects/KLOC**. This is the density of findings in this assigned slice, not an estimate of application defect density.
- Root follow-up: address or explicitly disposition defect 1; run the required browser matrix and inspect resulting dark/narrow screenshots; keep real backend and production-boundary evidence separate from fixture evidence.

The bounded review is complete. Runtime acceptance and the remaining product gates belong to the coordinator.
