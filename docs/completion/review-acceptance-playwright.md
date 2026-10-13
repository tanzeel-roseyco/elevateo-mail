# Bounded acceptance Playwright adversarial review

Scope: accepted BE02/FE02 completion repair; static review only, 2026-10-14. Task task_f7eb05c1d694, dispatch ctx_5e5712496d57. Reviewer: Codex (GPT-6 family per session identity); exact dispatched model/effort requested from coordinator, not independently exposed by this session.

## Coverage and integrity

All ten supplied SHA256 pins matched before source inspection and again after inspection. Directory total: 406 physical lines. Excluded unavailable.e2e.ts (22 lines), as explicitly permitted because its scenario mapping is separately reviewed. Unique implementation/test coverage: 384 physical lines, including comments and blanks. Read passes: 176 lines (auth, boundaries, boundary tests, cases, config), 156 lines (draft, read, support), 52 lines (reporter); each <=200. No other implementation or test source inspected.

| File under tests/acceptance/playwright | Inspected range / LOC | SHA256 |
|---|---:|---|
| auth.e2e.ts | 1-54 / 54 | 44d14d32bdd2aab2371be4c2f61b48cf5e39a4c0bd4feff0d8b4320b1eedcc7c |
| boundaries.ts | 1-43 / 43 | 9ed6af050c697b3083c23d4df3239d81bbe6a2c37c3247e6efb34b35f5747766 |
| boundaries.unit.spec.ts | 1-35 / 35 | cf00b1d8f3367c90291c951e60c03dc9e8c98164a69d85b14731ac4b4f72d0bf |
| cases.ts | 1-23 / 23 | e588cec7c78380d039dc94d0d79e41b46e815cf932f6391ebfb4a427faea5298 |
| draft.e2e.ts | 1-46 / 46 | 45f62ba8a546331949cb3edef8e23517ceb5267c45478f335d9e47606daa3d59 |
| playwright.config.ts | 1-21 / 21 | 933205fea4a2d50f97643de3db6853f71eddf9df6affadd75e21515a8edf9914 |
| quiet-reporter.ts | 1-52 / 52 | c89d93bf78170ac286d6d6c83c59ccdc2d47e3f284010e24f4aad596709ef5e3 |
| read.e2e.ts | 1-51 / 51 | 771ed994d91926ed3e64d745cee58a07d99f54b70f9d380e641da3c28d8dff54 |
| support.ts | 1-59 / 59 | dbcb23f1dcd6a0ea587ab4f0f8a31bf8701a98722c4f18710b10bfb38acfb3c4 |
| unavailable.e2e.ts | Excluded / 0 | 7a9e882e53d03e4c24b951ae615a6809aaab6b0b119670d7de21609ccd7c8852 |

## Provenance and supplied contracts

Coordinator reply msg_9b46ed6f8651 attests actual launch receipt and visible TUI: **gpt-6-astra, low effort**. This is coordinator-attested execution identity, replacing the less specific session identity above.

Applied root AGENTS.md and .planning/STANDARDS.md with this assignment's narrower read-only limits. Supplied contracts accepted without inspecting dependencies: nine runtime actors; private http://app.test production frontend proxy to Rails/Auth/Postgres; fresh browser contexts; real password login; T0 immutable validated records with assertions required for passed status; ten active paths and sixteen separately mapped unavailable paths. Nonroot runner/seccomp are external obligations. Coordinator confirms artifactBytes is a per-lane/run aggregate budget (250 MiB), recordCase does not sum artifact bytes, and host quota is not implemented.

## Numbered defects

1. **MEDIUM — Aggregate screenshot budget resets with the browser worker.** Evidence: support.ts:12 initializes screenshotBytes in process memory; support.ts:50-57 increments/checks only that instance before writing persistent artifacts. playwright.config.ts:14 sets one worker and zero retries, which does not preserve worker module state when a failed test causes Playwright to replace the worker for subsequent tests. A screenshot written before a later assertion/teardown failure remains on disk while the next worker starts from zero; subsequent screenshots may collectively exceed artifactBytes without triggering this check. The coordinator confirms no downstream aggregate enforcement. Minimal repair: enforce the budget against previously written lane/run artifacts through a runner-owned quota or shared serialized accounting, retaining exclusive writes and bounded failure behavior; add a regression that preserves an artifact across worker replacement and rejects an aggregate overrun. Do not add a distributed service for this serial runner. Current ten active cases contain only three screenshot call sites, so this is a missing hard guarantee, not evidence that the present 250 MiB run actually overflows.

Confirmed defects: **1 over 384 unique reviewed physical LOC = 2.60 defects/KLOC**. No code changed and no repair verified.

## Review checklist

- [x] Integrity, physical LOC and <=200-line read passes verified; no source drift found.
- [x] Null/empty/extra-field/boundary handling reviewed: strict credential and receipt schemas, bounded secret-file reads, fixed parse errors, browser enum. Unit source covers several happy and rejection paths. Filesystem loader failure/symlink/growth paths have no direct tests in this inspected slice; other test coverage is unknown.
- [x] Ten active scenario registrations counted: four auth, two draft registrations, four read/GUI. Sixteen unavailable mappings accepted only as supplied/separately reviewed context.
- [x] No route mocking, cookie injection or credential logging found in reviewed code. Login uses actual UI and checks response status; logout additionally checks session endpoint denial. Forbidden thread checks status, unavailable UI and removal of prior plaintext.
- [x] Assertion strength reviewed: draft save validates JSON receipt ID/version/state and exact reopened fields; reload checks body only. Reader checks a marker in a pre element, not complete HTML/tracker safety. GUI checks focus/history at two widths, not visual quality/overflow/contrast. Production fixture test correctly declares its narrow absence-only coverage.
- [x] Reporting reviewed: framework teardown status participates in pass classification; missing/malformed metadata cannot produce passed record; publication failures fail onEnd; fixed errors suppress browser diagnostics. Shared schema/recordCase guarantees are supplied, not independently verified.
- [x] Identity/isolation reviewed within scope: page fixture contexts and unique draft creation avoid shared browser session/order dependencies. Real server identity, seed authorization and backend behavior remain external contracts.
- [x] Resource limits reviewed; aggregate artifact counter defect recorded above. No hot database loops or unnecessary architecture found in this slice.
- [x] Browser selection supports exact Chromium/Firefox/WebKit names; selectors generally use roles/labels. Chromium sandbox is explicitly enabled. Actual browser launch, cross-engine response timing/history/focus, filesystem secret flags and container seccomp remain unexecuted.
- [x] Comments generally explain privacy, isolation and non-obvious coupling; no style/formatting review performed (linters own that).
- [x] Documentation: this durable report records exact scope, defects and limits. Broad repository documentation synchronization is not certified by this bounded source review; coordinator owns central code-reviews.md accounting.

## Design limits and unchecked dependencies

Static tradeoff analysis only: fail-closed fixed diagnostics protect secrets but reduce local failure diagnosis; server response checks plus exact UI values provide stronger evidence than UI text alone, but do not prove persistence across server restart or another authenticated context. Draft body at draft.e2e.ts:14 uses escaped literal backslash-n sequences, so its exact-value assertions do not establish real newline preservation. Two scenario IDs execute the same draft workflow; this review does not infer distinct capabilities from those IDs. The process-local budget is simple but lacks lifetime alignment with a run-wide quota; one serialized durable/runner accounting mechanism is sufficient. No Obsidian simulation was performed; external connections and implementation expansion are outside this assignment.

Unchecked: shared/config.js, shared/schema.js, shared/report.js, acceptance matrix/handoff contents, unavailable.e2e.ts implementation, dependency lock/version compatibility, actual FE selectors/behavior, Rails/Auth/Postgres seed and access rules, container runner seccomp/nonroot setup, artifact directory creation/permissions, global evidence reconciliation and quota. No assurance about those dependencies is implied. Post-review source hashes remained identical.

## Runtime verdict

**NOT_RUN.** No host tests, Docker, SSH, server, browser, installs, commits, subagents or ultrareviews were executed. The coordinator-supplied 29 boundary-test Docker passes are prior external evidence, not this review's runtime result and not real-browser proof. Actual UI screenshots/manual validation, ten active browser paths, each selected browser engine, adversarial quota regression and full integration remain coordinator-owned checks. This static review does not certify application completion or publication readiness.
