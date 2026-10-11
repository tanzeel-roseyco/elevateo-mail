# FE-01-R1 bounded repair dispatch

Status: **ready for root coordinator dispatch after actual Astra MAX synthesis**. No implementation worker has been launched by this design task.

<!-- AIDEV-NOTE: Serialize LOW data repair and Fable UI repair; coordinator alone owns execution, lockfiles and shared docs. -->

## Task and immutable inputs

- Issue: [FE-01-R1 #8](https://github.com/tanzeel-roseyco/elevateo-mail/issues/8). Related unaccepted [draft PR #7](https://github.com/tanzeel-roseyco/elevateo-mail/pull/7); full [FE-01 #4](https://github.com/tanzeel-roseyco/elevateo-mail/issues/4) remains open.
- Application base: `d7eac0791fd6483e47677fe8faa26c70a6522485`, `frontend/fable/fe-01`, in `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable FE01`.
- Required reading: project AGENTS, README/state/documentation/standards, [frozen brief](brief.md), [synthesis](synthesis.md), [accepted decisions](decisions.md), and initial review/runtime evidence at that commit. Read existing `AIDEV-*` anchors before editing and update affected comments/features together.
- Brief SHA-256: `37be48f9a7f4d746a7219118308b6bdd6a17483b12dcbe19c305d345d01d4828`; common input SHA-256: `672442e890ac3fe4d92b05bdf9f5f541ef9141f73d90f95ff52d1c0cde0ab5f6`.
- Accepted original pins and contract remain binding. Canonical OpenAPI SHA-256: `94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca`.

Root creates a clean, separately named checkout under `Code and projects` for each implementation writer and records its absolute path, branch and exact parent commit in the launch envelope. Each writer receives this complete dispatch and relevant source bodies/context. First checkpoint is due within 30 minutes: changed paths, findings addressed, regression status, unresolved questions and exact revision. This deadline is a progress checkpoint, not permission to stop unfinished work or silently accept a partial repair.

## A. Actual Astra LOW: data and test foundation

Route a fresh actual `gpt-6-astra` with effort `low`; record native requested/executed identity and task ID. Start from the immutable app base plus any coordinator configuration-only preparation, whose exact diff/hash must be supplied. One application writer. No fallback model without explicit routing evidence.

Writable paths, relative to `apps/web`, are **only**:

| Path | Responsibility |
|---|---|
| `src/data/http/transport.ts` | FE-R01/R02/R03: pre-abort, full-lifecycle classified failures/cleanup and exact JSON type. |
| `src/data/http/transport.test.ts` (new) | Focused transport regressions, including abort/deadline after headers and stream limits. |
| `src/data/fixtures/fixtureGateway.ts` | FE-R12: concrete schema-preserving resolver typing. |
| `src/data/fixtures/fixtureGateway.test.ts` (new) | Operation-specific fixture validation/type regression through actual adapter operations. |
| `src/data/conformance.test.ts`, `src/data/contract.test.ts` | Applicable existing adapter/schema regressions and contract boundary cases; no schema changes. |
| `src/test/setup.ts` (new) | FE-R17 explicit imported shared DOM cleanup; no global API switch. |

All other source, generated types, error vocabulary, config/dependencies/lock, Git and documentation are read-only for LOW. Do not modify session tests; they belong to Fable. If a necessary edit is outside this list, provide its exact reason/path to root for explicit reassignment before editing.

Reproduce first. Existing Docker compiler/unit logs already establish FE-R12/R17; obtain failing transport regressions through coordinator-run Docker before claiming the transport fixes reproduced. Writer authors the regression, coordinator executes it on exact pre-fix bytes, then writer applies the narrow repair and coordinator repeats affected checks. A statically obvious issue is not falsely labelled a newly executed reproduction. If Docker headroom delays the run, mark the relevant reproduction and acceptance pending and report the specific limit.

Return a complete patch and finding-to-test mapping. Do not change API semantics, add error codes or broaden MIME acceptance. Root executes commands, reviews the diff, integrates the data/setup stage into a committed handoff and supplies that exact SHA to Fable. The original app base remains in provenance; Fable's actual parent is the integrated handoff, never a guessed SHA.

## B. Exact Fable 5: frontend lifecycle and interactions

After A's serialized handoff, launch a fresh exact `claude-fable-5` frontend worker with file read/edit capabilities only. Coordinator records requested and actual runtime model/session, current supported runner flags, input/base hash, bounded process/time/spend configuration and stop controls. Reuse the original frontend implementation safety restrictions: no worker subprocess, package installation, network, Git, Docker, browser execution, credentials or provider access. Do not reuse the tools-disabled opinion session as an implementation session.

Writable paths, relative to `apps/web`, are **only**:

| Path | Responsibility |
|---|---|
| `src/app/session.tsx`, `src/app/session.test.tsx` | FE-R04/R13/R16 and V3: explicit transitions, canonical fixtures, stable read ownership and real-request lifecycle regressions. |
| `src/app/Shell.tsx`, `src/app/Shell.test.tsx` (new), `src/app/App.tsx`, `src/app/Sidebar.tsx` | FE-R05/R06/R07: correctly keyed state-owning protected Shell, mailbox reset and mobile dialog. |
| `src/app/scope.ts`, `src/app/scope.test.ts` | Only changes needed by the accepted ownership mechanism and accurate coupled comments; no broad scope abstraction. |
| `src/lib/readPage.ts`, `src/lib/readPage.test.ts` (new) | Small shared reset/outcome policy with caller-owned one-reset traversal budget and stale-work checks. |
| `src/features/inbox/InboxPage.tsx`, `src/features/inbox/InboxPage.test.tsx` (new) | FE-R08/R09/R11: replace after reset, empty continuation and URL filter. |
| `src/features/thread/ThreadPage.tsx`, `src/features/thread/ThreadPage.test.tsx` | FE-R10/R11: message replacement and preserved return filter; coupled reader cases. |
| `src/styles/index.css` | FE-R14 measured contrast plus directly required drawer/focus styling. |
| `src/ui/Drawer.tsx` (new), `src/ui/Async.tsx`, `src/ui/Button.tsx` | Only the imported approved dialog wrapper and directly coupled accessible focus/retry primitives. |
| `src/dev/fixtureMain.tsx`, `dev-fixtures.html` | Existing separate fixture entry wiring required for the repaired states; no production import or fallback. |
| `e2e/read.spec.ts`, `e2e/production.spec.ts` (new) | Real keyboard/visual scenarios, hostile plaintext network checks and actual production-artifact API-failure proof. |

No data-layer, contract, generated file, package/configuration/lock or shared documentation writes. Only create the named optional files if used; avoid unused abstractions. Session and protected Shell remain one writer's cohesive responsibility. Implement accepted D2-D4 exactly: automatic events never renew retry allowance; unchanged identity preserves context/reads; the key covers mailbox state; every reset replaces; each entire traversal has one reset; current and stale outcomes are distinct.

The worker supplies executable meaningful regressions and actual requested coordinator checks. Root supplies run results; the writer must label anything not executed. Fable reviews integration with LOW's error/schema/setup changes without editing those files. Return a complete first checkpoint plus every remaining requirement; no TODO stands in for a finished required repair.

## C. Coordinator-only integration and execution

The coordinator owns `apps/web/package.json`, `package-lock.json`, `tsconfig.json`, narrowly added `tsconfig.node.json`, `vite.config.ts`, `playwright.config.ts`, minimal `eslint.config.*`, `docker/test.Dockerfile`, app README/PROVENANCE, root README Current state/state/documentation/planning records, test/evidence manifests and GitHub issue/PR records. Maintain one named writer for these files too. Resolve exact supporting Node-type/lint pins, licenses/audit and transitive dialog lock entries; document a reason for each dependency. No silent changes to core pins. Wire explicit setup and separate browser/tooling types, and ensure the Docker target actually invokes required lint/type/unit/build checks.

Use pinned Node build image `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20` with observed Node 24.21.0/npm 11.19.0, and browser image `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`. Match `@playwright/test` 1.64.0; do not assume browser-image Node equals build-image Node. Use the accepted isolated local HTTP-cookie exception explicitly; browser and server communicate through task-owned Docker networking. No host application tests/builds or localhost fallback are authorized here.

Do not delete unrelated data to meet the observed ~1.68 GB headroom limitation. Sequential Node checks followed by retained Playwright may reduce simultaneous storage but must be proven feasible. Remove exact task-owned disposable containers/images/cache immediately after their required tests/preview, including failure paths; inspect mounts and preserve persistent volumes and unrelated workloads. Report Docker usage, actual host free space, removed/retained resources and compaction limits. Do not leave a task image solely for hypothetical later use.

## Required evidence and acceptance

The complete [brief V1-V10 matrix](brief.md#7-required-verification-matrix) remains binding; this table assigns the particularly easy-to-miss proving cases.

| Gate / finding | Concrete evidence |
|---|---|
| V1 / R12/R15/G01 | Docker API regeneration unchanged, strict browser/tooling typechecks, lint, full unit suite and production build pass; actual versions, resolved lock/audit and exits recorded. |
| V2 / R01-R03 | Pre-abort sends zero fetches; caller abort, deadline and rejection after headers settle as the expected typed errors; reader/timer/listener cleanup; byte limits with Unicode, missing/lying lengths and oversized errors; MIME/redirect/schema/request/header/rate-limit boundary cases. |
| V3 / R04/R05/R13/R16 | Drive errors through rendered real read requests. Timer/focus/visibility burst coalesces; first 409 recovers once, second blocks, even after successful reads or changed identity; automatic events remain inert while blocked. Current 401 aborts/clears and stale 401 does not clear B. First committed A-to-B render contains no A content. Unchanged refresh preserves a deferred read and accumulated pages; changed refresh rejects old outcomes. |
| V4 / R07-R11 | Mailbox loop, summaries and messages each reset once and replace; a second invalid cursor after a successful reset is not automatically retried. Empty page with cursor remains usable; unread is preserved into and back from reader; null/zero and duplicate summary cases; late previous-owner results ignored. |
| V5-V6 / R12/R13/R17 | Concrete per-operation schema returns; canonical statuses; shared applicable adapter/schema conformance; failing session tests pass individually and in full suite; no retained DOM. Assert owned timers/listeners are gone before restoring fake timers/mocks. |
| V7 / D01 | Inspect actual production imports/output, serve that artifact in Docker, force API failures and verify no fixture fallback/fixture entry. Hostile plaintext remains inert; inspect unexpected remote/subresource requests. Adapter-only tests cannot stand in for production proof. |
| V8 / R06/R14 | Inspect desktop and 390 px in both themes, populated/loading/empty/error/unavailable/retry/long/null/truncated states. Real Enter/Tab/Shift+Tab/Escape, skip link, modal background exclusion, close/route/identity focus, resize and overflow. Measure computed contrast and 50-row interaction/long-task baseline with method/environment; capture screenshots/traces and manually inspect the actual UI. |
| V9 | Fresh independent adversarial review covers every changed non-generated source/test/config file and affected coupling in assignments of at most 200 lines, plus a dedicated design reviewer. Use the full user rubric below, no author self-acceptance. Re-review fixes, log deduplicated defects, unique LOC/density and final source hash. |
| V10 / D01/D02 | Same implementation commit synchronizes root/app README and state/documentation with actual commands, pins and evidence. Update provenance and issue/PR finding dispositions. Keep unexecuted gates, full FE-01 and real Rails integration visibly open. |

Use a commit-phase/layout-effect observer or equivalent first-commit evidence for privacy; eventual DOM assertions alone are insufficient. Session tests must not only invoke `handleError` directly. Browser focus proof uses real key navigation, not only programmatic `.focus()`. A passing diagnostic bundle does not cancel type failures. Source evidence includes a changed-file manifest with base/final Git SHA, path, byte count and SHA-256; every log/screenshot/review records its tested bytes. Coordinator documentation-only commits may follow with explicit linkage; do not claim a run covered changed application bytes without rerunning affected checks.

Initial ledger is 20 findings over 2,133 unique authored LOC (17 code/test: 7.97/KLOC; all: 9.38/KLOC). Preserve historical counts, record newly reviewed unique lines separately, and close each finding only with passing evidence. Additional acceptance gaps are not automatically additional confirmed defects.

## Reviewer prompt and stop rules

Every adversarial review assignment includes this exact user rubric plus the <=200-line path/range, context, accepted standards and tested commit:

> Does this code work? Verify that the code actually fulfills the purpose of the feature or bug fix. Check if the author considered null inputs, empty lists, and max limits. Ensure that changes to state or data structures don't inadvertently break other parts of the entire system. Ensure the developer isn't over-engineering or building things they might need in the future but don't actually know they need now. Check that new classes or functions aren't trying to do too much. Look out for duplicated logic that should be extracted into a shared utility or service. Ensure variable, function, and class names communicate their intent clearly. Check that comments explain why something exists, not just what the code does. Look for deeply nested loops or convoluted conditionals that could be simplified to help future developers read it easily. Confirm that unit and/or integration tests are included and directly cover the changed logic or new feature. Ensure the tests cover both the happy path and failure scenarios. Check if the author has updated relevant documentation. Make sure external inputs are sanitised and permission/authorisation checks are properly enforced. Watch out for unnecessary loops, repeated database queries in hot paths, or operations that could cause bottlenecks.

Route style/format checks to lint. Dedicated design review repeats the seven analytic scenarios and distinguishes theoretical assumptions from empirical evidence; Obsidian is unavailable and must not be claimed used. Maximum native agent concurrency remains four including root; the three external opinions have completed and this design slot should be released for review/repair work.

Stop only the affected work for missing required model identity, conflicting contract, need for an unassigned file, changed architecture/scope, unreproduced unsafe repair, unexpected credentials/production access, or inability to run a required gate. Report a concrete blocker and continue independent authorized work. No new Devin spend is needed; retain its separate existing $10-only limit. No provider activation, live sending, public deployment, main-branch merge or acceptance is granted by this dispatch. Root owns draft fix PR creation/linkage and may accept this bounded repair only when its checks and independent review are complete.
