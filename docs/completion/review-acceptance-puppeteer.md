# Bounded Puppeteer acceptance review

Date: 2026-10-14. Task task_3af54044e243; dispatch ctx_4294b21df29d.
Reviewer: Codex (GPT-6 family as identified by session instructions); exact serving model ID and reasoning-effort setting are not exposed to this worker, so neither is asserted. No substitute named-model consultation is claimed.

## Verdict and coverage

Static review complete with **1 MEDIUM defect across 314 unique physical lines: 3.18 defects/KLOC**. Runtime **NOT_RUN** by this reviewer, including compiler/linter, unit tests, browser, sandbox, filesystem integration and visual QA. Coordinator reports boundary tests passed in Docker; that report is not independently verified here. No application acceptance or test pass is inferred from source.

All source hashes matched before inspection and again after inspection. Paths below are relative to `tests/acceptance/puppeteer/`.

| File | Inspected range | LOC | SHA-256 |
| --- | --- | ---: | --- |
| boundaries.ts | 1-36 | 36 | 93b110863540e245333489964938f7e5b68380fe0b2fa497ebae72e372d829c9 |
| boundaries.unit.spec.ts | 1-41 | 41 | c314f53db4f34e565293d1251d31472bb029550fb7357d9dc2a17c2f8c5604a4 |
| files.ts | 1-36 | 36 | 9e16ee10f3121a1952ad3e24dc52e12cd1ff73395807a522856f40c996b159f8 |
| journeys.ts | 1-80 | 80 | 3386f61113006bf6b0126164cb8176b0ec8a627fdebf8e1fc4e4e7e39c192ca2 |
| run.ts | 1-68 | 68 | cef56562b0f1699197c33024d9913e2fa19f8a61f31e0f5bd85984a1f6aae5a7 |
| ui.ts | 1-53 | 53 | 9ae049032b7fc829e80ff485993793ba8433e7abdac366e07bf8da6fc05330d7 |

Inspection passes: 113 LOC (boundaries, boundary tests, files); 148 LOC (journeys, run); 53 LOC (UI). No pass exceeded 200 lines; whole assignment inspected 314 unique implementation/test lines. Root AGENTS.md, supplied user rubric, STANDARDS.md, acceptance-t2-handoff.md and scenario-matrix narrative supplied review context. README/state/documentation current-state excerpts were consulted; historical bulk documents were not audited. No off-budget FE or T0 implementation inspected. Source remained unchanged; this report is the sole write. Formatting is delegated to linters.

## Numbered defects

1. **MEDIUM — Hidden plaintext can satisfy the read-journey assertion.** `ui.ts:42-47` searches every matching conversation `pre` and accepts textContent plus zero element children without checking visibility. `journeys.ts:34-36` uses this as its only message-content assertion before and after reload. A DOM containing a hidden conversation/pre with the seed marker and a visible empty/error conversation satisfies both calls, allowing the read case to report passed despite no visible seeded message. This is a static counterexample, not an observed application failure. Minimal repair: require the same matching child-free pre to be visibly rendered before accepting its marker; do not merely check a different pre for visibility. Add focused browser regressions for visible matching text (pass), matching text under a hidden ancestor (fail), and absent/wrong marker or nested markup (fail). Root owns Docker execution and new bounded review of the repair.

## Review checklist

- [x] Outcome honesty: status starts not_run; GUI-entry failures become failed; later cases stop; cleanup rejection converts a pending pass to failed; nonpassed records set exit code 1. Record/config failures terminate with fixed sanitized stderr. Missing records on fatal setup/report failure must be reconciled externally, as documented.
- [x] Assertion strength: login checks exact seeded thread and account after reload; draft checks UUID, saved version, exact subject/recipient/multiline body following reload; logout checks sign-in and absence of account/thread controls. Plaintext visibility gap is defect 1. These are sampled GUI assertions, not complete scenario proof.
- [x] State isolation: fresh browser plus explicit new context per journey, sequential execution, context close followed by browser close before publication. Close hangs and rejected-launch orphans require the supplied external watchdog; no cancellation guarantee inferred.
- [x] Secret and URL logging: caught diagnostics are fixed messages; no inspected code exports credentials, tokens, browser URLs, body text, console logs or network payloads. dumpio is false. Native/debug output privacy still depends on runtime configuration.
- [x] Endpoint/identity boundaries: exact configured origin, positive integer UID, absolute bounded executable syntax, exact version comparison, scoped draft origin/path/hash/UUID checks. Credentials use strict alias schema and bounded passwords; malformed/missing/extra inputs covered by authored pure cases.
- [x] Filesystem boundaries: credentials use canonical path, NOFOLLOW/NONBLOCK, regular-file fstat, actual bounded read and close; executable requires canonical resolution, regular file and executable mode bits. Read-only immutable mounts remain prerequisites against replacement races. Runtime access, sandbox and binary provenance are not proven by these checks.
- [x] Tests and limits: four authored boundary tests contain success and rejection cases including null, absent values, malformed origins/versions, oversized password and foreign draft scope. Exact maximum acceptance, filesystem behavior, UI predicates, close/report failures and stop propagation do not have direct regression tests in this six-file slice. This is a coverage limitation, not evidence that those paths work.
- [x] Simplicity/security: small boundary/file/UI modules, no unneeded backend, no mock/cookie injection, no action retry, bounded readiness/protocol timeouts. Seed strings used in selectors rely on the supplied strict runtime seed contract. Button/field labels are internal constants. No inspected hot-path database work exists.
- [x] Documentation: handoff honestly scopes GUI persistence and excludes SQL/heap/latency/TLS claims. Its authored-only boundary-test status and pending mapping note are older than coordinator-supplied approval/test status; root should reconcile those status records when integrating evidence.

## Design limits and unchecked dependencies

Accepted root contract: strict nine-actor runtime seed with scoped UUID identities, immutable sanitized recordCase requiring nonempty assertions for pass, approved AUTH001P/READ002P/DRAFT001P/AUTH003P mapping, isolated private app.test topology, nonroot seccomp sandbox, immutable mounts and external task deadline. These were supplied assumptions, not implementation findings.

Fresh browser per journey trades startup cost for session isolation; full-document reload rules out React-memory-only persistence but does not independently establish SQL persistence. Retaining the created draft is reasonable only in the disposable seeded database. Fixed generic failure reasons reduce leak risk but intentionally require private root diagnostics to investigate failures. External watchdog ownership is necessary because awaiting close is not itself bounded cancellation. These are analytical tradeoffs, not measured simulations; no Obsidian connection or dedicated design-agent execution was used or claimed in this bounded assignment.

Unchecked: shared schema/config/report implementation and source pins; FE selectors/readiness and loading transitions; Rails/Auth/database contracts; package/API compatibility and transitive dependencies; production dist provenance; first-page seed placement and actor compose permissions; actual browser binary/ZIP verification; Docker network egress isolation, debug settings, filesystem mounts, seccomp/sandbox, watchdog and orphan cleanup; evidence sealing and case reconciliation. Root supplied CFT 155.0.8059.39, Puppeteer 25.13.0, `/opt/cft/chrome-linux64/chrome`, ZIP SHA-256 55672d1f392fd3e7b7a08621b6e804e6bcb39d40cf155504abb74b3a021ea8ea; none was downloaded or executed here.

No claims about server-side logout revocation, absence of logout races, exactly one Auth exchange/draft row, tenant isolation, malicious-message network isolation, manual visual quality, heap, latency, native clients or TLS/Secure cookies follow from these four journeys. Root retains review aggregation in code-reviews.md and all fleet execution/cleanup ownership.
