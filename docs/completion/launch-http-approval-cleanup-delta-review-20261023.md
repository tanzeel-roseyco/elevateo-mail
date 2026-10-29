# HTTP approval cleanup delta adversarial review

Task task_72baafbe5712; dispatch ctx_1cf745d679c3. Final bounded static delta correctness/security/failure-path review. The supplied review rubric was applied verbatim as the assessment criteria; formatting is delegated to linters. No tests, builds, SSH, locks, deployments, source changes or subworkers were performed. Runtime belongs to ctx_4be80c8bfe6d; dedicated design review was already completed separately. No Obsidian connection or vault simulation is claimed.

## Scope and provenance

Current checkpoints in README.md, state.md and documentation.md, .planning/STANDARDS.md, launch-http-approval-final-cleanup-design-review-20261023.md and launch-http-approval-mailflow-20261023.md were consulted. Historical documents were not exhaustively reviewed; the initial combined context display was truncated and the standards, checkpoints and dedicated design receipt were separately displayed afterward.

Only the following source packets were displayed/reviewed. Counts are inclusive physical lines, including blanks, comments and adjacent context inside the authorized ranges. No dependency source was read. AIDEV anchors were read only within these ranges and remain unchanged.

| Packet | Path under apps/server/test/support/launch_mailflows/ | Lines | LOC | New actionable defects | Defects/KLOC |
| --- | --- | --- | ---: | ---: | ---: |
| A | fleet_protocol.py | 78-128 | 51 | 0 | 0 |
| B | fleet_protocol.py | 280-310 | 31 | 0 | 0 |
| C | fixture_presence_test.py | 1-64 (entire file) | 64 | 0 | 0 |
| Total | | | 146 | 0 | 0 |

Each packet is below 200 LOC and total unique source coverage is 146 LOC, below 400. Whole-file SHA256 was computed without displaying excluded source. Before/after hashes matched the dispatch pins exactly:

- fleet_protocol.py: `1d35e647cf69db9d2f88a24f6545268518af539e36c82df7fefb267c0b9afe06`.
- fixture_presence_test.py: `c9e6bee24568462a2e17914cc4c3d309c7ccc133f3ef0fb1b231fae1a522146f`.

## Findings and disposition

No new actionable delta defect found: 0 / 146 LOC = 0 defects/KLOC. The prior confirmed MEDIUM ignored-removal/no-postcondition issue is repaired statically at lines 107-109. After attempted stop/remove, an exact-name Docker presence query is now required. Nonempty output returns an explicit retained-fixture diagnostic before the cleanup container or host directory removal, preserving private fixture data. A query exception likewise prevents reaching private deletion; its caller-level treatment depends on excluded code, except for the visible guarded outer backstop. Ignored command exit results therefore no longer alone establish successful removal. Intermediate command exceptions can still be reported even when subsequent removal succeeds, conservatively failing cleanup rather than hiding an error.

Absent fixtures skip inspect and stop/remove commands. The independent absence query still precedes private deletion. Present fixtures retain the existing exact name/image/project, published-port and bind-source guards; a wrong owner returns before removal or private cleanup. Missing/null inspection fields may raise rather than return a structured diagnostic, but do not reach deletion through this path. Empty lists and empty Docker output have explicit branches. Ownership validation and Task command/output contracts are not expanded into a whole-system security certification; concurrent replacement races and malformed helper responses are outside this review's evidence boundary.

The prior conditional expired-budget backstop concern is addressed by lines 288-292: cleanup_mode and a fresh monotonic 240-second deadline are installed before the first outer presence query. The helper also resets its own cleanup budget before its first query. This establishes local source ordering, not independently verified enforcement of aggregate deadlines or subprocess termination by the excluded Task implementation. No broad refactor, unnecessary abstraction, database hot path or unbounded new loop was introduced. Existing AIDEV notes explain failure preservation and cleanup ordering; the bounded change fits the existing ownership model.

## Regression coverage and limits

The five reviewed tests call the actual clean_fixture helper with a mocked Task:

- Absent fixture: asserts inspect is skipped and host private-directory cleanup is called.
- Present owned fixture: asserts exact inspection and a removal command is attempted; absence is supplied by the mock.
- Wrong project owner: asserts explicit retention, no removal command and no host private deletion.
- Retained-container postcondition: supplies nonempty initial and final presence, asserts explicit absence-failure reporting and no host private deletion. This models the important non-raising removal failure outcome; it does not simulate a real Docker exit code or daemon.
- Expired helper deadline: begins at zero and asserts cleanup_mode and a future deadline during mocked Docker calls.

These are happy-path plus relevant failure-path regressions for the helper. The retained test directly reaches the new branch, although it does not separately assert that the private cleanup-container command was never issued; source ordering establishes that point. Wrong-name/image/port/bind variants, Docker query exceptions, private-cleanup failures, interrupts, malformed inspection responses and real Docker behavior are not directly exercised by this test file. Test helper methods remain untyped, consistent with the previously documented strict-typing conformance debt rather than a newly introduced runtime defect.

Crucially, the expired-budget regression exercises clean_fixture, not main's outer finally/backstop. The backstop deadline installation is verified by inspection only; none of these five tests executes packet B or proves generic finalization behavior. Do not describe the suite as runtime coverage of the outer branch. No new architecture or whole-application rerun is requested for this bounded harness delta.

## Acceptance boundary

Static acceptance of both targeted cleanup corrections: PASS, with zero new actionable defects in these packets. Focused fleet Docker regression execution on the exact pinned hashes remains the runtime owner's responsibility; this reviewer did not execute tests or inspect remote receipts. Attempt e's documented coherent HTTP approval/mailflow result (88 assertions), its cleanup and independent absence receipts are historical evidence for that frozen attempt, not runtime proof of this latest cleanup delta. Imported helpers, whole-run primary-exception preservation, concurrent OIDC changes, browser/TLS/UI, production deliverability and activation are outside scope. No release authority or whole-project approval is implied. Coordinator owns code-reviews.md, implementation and final acceptance.
