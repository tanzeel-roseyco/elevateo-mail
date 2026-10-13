# BE02 BusyBox timeout repair: bounded independent review

Verdict: no confirmed defects in the inspected repair. Source-only review is complete; runtime acceptance remains **NOT_RUN** by this reviewer and belongs to root.

Reviewer identity: Codex (GPT-6 family per session instructions). Exact deployed model variant and reasoning-effort setting are not exposed to this worker; neither is inferred from the requested workflow. Task `task_70aea268c536`, dispatch `ctx_3af501f5ac1f`.

## Coverage and pins

All paths below are under `ops/tests/be02-guards/`. Counts and whole-file SHA256 were collected before source inspection; all three supplied pins matched. Optional helper pins were recorded locally before inspection (no coordinator-supplied expected pins). All five hashes were rechecked unchanged after inspection.

| File | Whole-file physical lines | Inspected inclusive range | Reviewed LOC | Whole-file SHA256 |
| --- | ---: | --- | ---: | --- |
| auth-rls-concurrency-harness-regression.sh | 43 | 1-43 | 43 | `028fcd7736b019b90febf252e4b69f093eab52f2beb46deb9317521dff822d52` |
| auth-rls-concurrency-processes.sh | 198 | 1-46 | 46 | `9c08211610cde922df845367139596a789b4a8c07ebfe07c5683203c19ddb508` |
| auth-rls-concurrency.sh | 127 | 1-40 | 40 | `45607d692294380623575d7fef7ba0579172b0c4138a319ad34ca0985092d68e` |
| auth-rls-concurrency-harness-regression-errors.sh | 41 | 1-41 | 41 | `36cead291153bd45dde8f5b791c53385bc5e9d36981308dc8c64a6b3f88b8bbd` |
| auth-rls-concurrency-harness-regression-cleanup.sh | 102 | 1-102 | 102 | `996ea7fb45cc23c634b499f8ac868d24210dd727e8c89496728c4eedec605327` |

Source pass 1: 129 physical lines. Source pass 2: 143 physical lines. Total: **272 unique implementation/test LOC**, including blank/comment lines; neither pass exceeds 200 and the assignment stays below 400. No other implementation source was inspected. Context included root AGENTS.md, .planning/STANDARDS.md and docs/completion/be02-busybox-timeout-repair.md; the combined historical README/state/documentation read was truncated and does not establish full historical-document coverage.

## Checklist and evidence

- **Portable syntax / retained budgets:** concurrency lines 21-23 use `timeout -k 1 5`; processes lines 5-8 and 37-45 use `-k 1 4` and `-k 2 25`. These match the supplied BusyBox help and retain the documented deadline/grace numbers. No wrapper, dependency, SQL rewrite or new domain abstraction appears in this repair.
- **Signal oracle:** regression lines 22-25 require success and exact propagation of exit 37. Lines 30-38 require the exact two-line ready/terminated output plus status 42 or 124. Missing TERM, natural completion (`overran`), early failure, extra output and SIGKILL-only termination do not satisfy this oracle. The accepted status alternatives accommodate the documented BusyBox/GNU difference without accepting every nonzero exit.
- **Child/FIFO lifecycle:** the smoke child uses only Bash builtins and a three-second read, avoiding a sleep descendant. FIFO open is read/write, so opening does not depend on a separate reader. Normal completion closes the parent descriptor (39-40); EXIT cleanup removes the exact FIFO and scratch files and propagates removal failure (9-19). These are static lifecycle properties, not observed absence/reaping evidence under external interruption or SIGKILL.
- **Fail-closed behavior:** strict shell options and explicit status/output checks reject unsupported timeout options and unexpected child results. The production caller rejects any nonzero harness result before real schedules. The cleanup trap retains the original failure status and converts filesystem cleanup failures to failure.
- **Boundaries/security:** the harness requires zero arguments, a container marker and the disposable flag; the caller also restricts DB environment and source mount/hash. Temporary files use a private directory and umask 077, with quoted paths and fixed cleanup names. This repair introduces no new external data, credentials, database access or authorization mechanism. Existing SQL interpolation/caller validation outside the assigned ranges is not certified.
- **Regression compatibility:** the two existing helper entry points remain in sequence after the smoke checks. The diagnostic suite contains 18 positive/negative cases including empty and malformed output. The cleanup suite contains 16 mocked cases including discovery failures, identity drift, residual sessions, reap failure and escalation. Its sleep override advances a fake clock rather than adding intentional wall-clock sleeps. These suites call uninspected implementations; authored assertions are not evidence of passing tests.
- **Total deadline:** the enclosing five-second timeout and one-second kill grace remain unchanged. The new successful signal fixture intentionally consumes approximately one second, reducing the time available to the existing fixtures. Source contains no duration measurement or enforceable proof that all fixtures and cleanup finish inside five seconds. Root must establish that on the actual pinned image. Five seconds is the TERM deadline; the retained kill grace means it is not a strict five-second wall-clock completion guarantee.
- **Maintainability/documentation:** comments explain portability, signal-status differences and the bounded builtin read. The repair note accurately separates source readiness from runtime verification and explicitly excludes forced-SIGKILL proof. No additional abstraction appears warranted. Formatting/style is delegated to linters and was not reviewed.

## Numbered defects

None confirmed in the inspected repair. **Defect count: 0. Defect density: 0 / 272 x 1000 = 0 defects/KLOC.** This is bounded static coverage, not a claim of whole-system correctness or zero runtime risk.

## Design limits and unchecked dependencies

The minimal syntax substitution avoids wrapper-maintenance and behavior drift. The one-second real signal fixture gives stronger evidence than checking only an exit status, at the cost of consuming one second of the fixed outer budget. No deep architecture change or recommendation requires a new design simulation; no Obsidian connection was used or claimed.

Unchecked: processes.sh lines 47-198 (including actual expect_error, stop_children and reaping implementations), concurrency.sh lines 41-127, catalog helper, production SQL, actual BusyBox/GNU binaries, Bash descriptor inheritance on the pinned image, Compose/runner packaging, database cleanup schedules, forced escalation and interruption behavior. No out-of-scope contract was assumed to be verified. Exact unchanged-source comparison against the previous revision was not performed; preserved pre-repair values are supported by the provided repair context, while current values were directly inspected.

Runtime: **NOT_RUN**. No host app tests, Docker, SSH, web server, dependency installation, subagents, ultrareviews or commits were performed. Root's separate actual-image run must supply elapsed time, exit status and resource cleanup evidence; this report does not import or predict those results. Only this report was written; shared review ledger/state updates remain root-owned.
