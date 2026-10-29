# BE02 Auth concurrency review A

Review date: 2026-10-14 (Australia/Sydney). **No confirmed defect found in the assigned 315 physical source lines.** This is a static review result; runtime acceptance remains pending on fleet-02.

Task `task_5160e50a4ed0`; dispatch `ctx_b9dc7c988a2d`; worker terminal `term_4a9a1baa-20fb-429d-8bea-971603893c0a`.

Requested identity/effort: GPT-6-Astra MAX. Observed Orca `worker-show` requested and effective launch configuration: `codex / gpt-6-astra / max`; the exact live worker's terminal preview also identified GPT-6-Astra max. This records the runner's observable configuration, not an independent provider-level attestation. No substitute or additional agent was used.

## Scope and source integrity

Two separate passes, each below 200 source lines. All paths below are relative to `ops/tests/be02-guards/`. Blank and comment lines count as physical lines. The ranges do not overlap; no source beyond these ranges was reviewed. Whole-file hashes and physical line counts were checked before review and rechecked before reporting; no drift was observed.

| Pass | File | Reviewed range | Reviewed LOC | Whole-file LOC | SHA-256 of whole file |
| --- | --- | --- | ---: | ---: | --- |
| 1 | `auth-rls-concurrency-processes.sh` | 1–126 | 126 | 196 | `aef6bcc55040a65a52b9652df2d30d30a22aff3e188452aa56c497894935578e` |
| 1 | `auth-rls-concurrency-harness-regression-errors.sh` | 1–41 | 41 | 41 | `36cead291153bd45dde8f5b791c53385bc5e9d36981308dc8c64a6b3f88b8bbd` |
| 2 | `auth-rls-concurrency.sh` | 1–127 | 127 | 127 | `1f5ecc889dcd0e038a2687086dda6fe9c198720e3c2a9dceaa7be92edefade91` |
| 2 | `auth-rls-concurrency-harness-regression.sh` | 1–21 | 21 | 21 | `626420e8cb558a2e836516cb4ce62712dc299c2a302028841c781f24b3536f7c` |

Planning context included the project instructions, `.planning/STANDARDS.md`, orchestration/planning guidance, current project state/documentation, and `docs/completion/be02-auth-rls-concurrency-repair.md`. The full supplied adversarial rubric was applied to the assigned slices. Documentation and external command manuals are context, not additional reviewed source.

## Defect accounting

| Coverage | Unique physical LOC | Confirmed defects | Defects per 1,000 LOC |
| --- | ---: | ---: | ---: |
| Pass 1 | 167 | 0 | 0.00 |
| Pass 2 | 148 | 0 | 0.00 |
| Total, deduplicated | 315 | 0 | 0.00 |

Severity counts: critical 0, high 0, medium 0, low 0. There is no defect-specific failure schedule, repair, or regression recommendation to report. The runtime requirements below are outstanding evidence, not invented defects or claims of successful execution.

## Pass 1: diagnostic oracle and process helpers

- **Exact error and whole-log matching — covered statically.** `processes.sh:103–125` requires the literal production-file prefix, a positive decimal source line, and exact severity, SQLSTATE, and reason. Literal comparison rejects suffixes, leading additions, and trailing spaces. It reads the complete log, including an unterminated final line, requires exactly one qualifying error, and rejects a second error or unrelated output. Only empty lines, the specified identity-record shape, and `CONTEXT`/`LOCATION` metadata are otherwise permitted; metadata containing `ERROR:` is rejected before the metadata allowlist. The narrower captured-PID identity check occurs separately at `processes.sh:89–90`.
- **Regression assertions — covered statically.** `errors.sh:7–41` defines 18 cases: two accepted cases and 16 rejection cases, including empty input, missing/foreign prefixes, invalid line zero, wrong severity/state, altered reasons, duplicate errors, embedded diagnostics, and unrelated trailing text. Rejections must produce both exit 42 and the assertion marker. A generic shell failure does not satisfy the expected rejection. Each case resets its marker and rewrites its input; these are authored tests, not executed evidence.
- **Client and exit semantics — covered statically.** `processes.sh:3,36–44,80–95` uses one client for the identity command followed by the original SQL file, disables startup files, prevents password prompting, enables `ON_ERROR_STOP`, and checks the actual waited status before accepting the captured admin identity and disconnection. The command does not add `--single-transaction`. PostgreSQL documents ordered `-c`/`-f` processing and distinguishes script error status 3 from fatal client status 1 and broken-connection status 2. [PostgreSQL 17 psql manual](https://www.postgresql.org/docs/17/app-psql.html)
- **Positive lock evidence — covered statically.** `processes.sh:26–33,46–77` rejects missing/ambiguous identities and binds observations to PID, backend start, application name, database, and user. Holder readiness requires its final marker query and an idle `ClientRead` state. Waiter evidence requires an active lock wait, an ungranted `AccessExclusiveLock` on the intended relation/database, the expected holder among its blockers, and the bootstrap lock statement. Exact aggregate counts reject an empty or partial waiter set.
- **Bounded waits — covered statically with timing limits.** Control calls have a 4-second wrapper with a 1-second kill grace plus SQL timeouts; barriers have a nominal 3-second budget; child wrappers have 25 seconds plus 2 seconds of grace; `finish_child` has its own 18-second polling budget. A barrier checks its deadline after the query before accepting success. Its 3-second budget is not a strict wall-clock ceiling: an in-flight control call and integer `SECONDS` granularity can extend failure reporting. The helper remains bounded in the reviewed code; actual timing and descendant termination are NOT_RUN.

Here and below, abbreviated filenames such as `processes.sh` and `errors.sh` refer to the corresponding full filenames in the scope table.

## Pass 2: guard sequencing and fixture driver

- **Environment and input boundaries — covered statically.** `auth-rls-concurrency.sh:5–23,56–62` rejects arguments and the wrong disposable-container/database context, disallows the listed ambient connection overrides, checks required commands and the source mount path, and pins the production SQL hash. The generated namespace is validated before interpolation into SQL. PID/start-time and injected-OID validation constrain the other dynamic identifiers used by the reviewed calls. Secrets are neither embedded nor deliberately printed in these slices. Broader database authorization is outside this assignment.
- **Sequencing — covered statically.** `auth-rls-concurrency.sh:21–23,69–88` runs the isolated fixture driver before database preflight and baseline capture, then observes both actual bootstrap clients waiting together before releasing their holder. The later schedules are sequential. Caller ordering after real Auth and before Rails is stated in the file and repair documentation; the caller implementation was not reviewed.
- **Lock-timeout schedule — covered statically.** `auth-rls-concurrency.sh:90–105` positively observes the wait, requires child exit 3, checks the exact `55P03` reason, and confirms that the holder still owns the lock before releasing it. GNU timeout expiration produces a wrapper failure status such as 124 or 137, which the expected-status comparison rejects; an expired wrapper is not accepted as the desired SQL error. [GNU timeout manual](https://www.gnu.org/s/coreutils/manual/html_node/timeout-invocation.html)
- **Timing interpretation — covered statically.** The 5–12 second assertion includes client startup, observation, and disconnect checking; it is an elapsed schedule envelope, not a precise measurement of PostgreSQL's lock-wait duration. The fixture driver receives 5 seconds plus 1 second of kill grace before the separate 75-second work watchdog starts. Compatibility with the documented outer 120-second limit depends on cleanup and runner behavior outside this source assignment and remains unverified.
- **Post-wait drift schedule — covered statically.** `auth-rls-concurrency.sh:107–127` captures a numeric policy OID, checks that the uncommitted fixture is invisible, observes the bootstrap waiting before commit, and then requires exit 3 and the exact policy-specific drift reason. It invokes fixture/catalog checks, removes the fixture, and rechecks the production hash. The called catalog and fixture-cleanup implementations are outside scope, so these call sites alone do not prove catalog restoration.
- **Regression driver and cleanup call sites — covered statically.** `auth-rls-concurrency-harness-regression.sh:1–21` creates private scratch state, runs the error and cleanup fixtures in separate Bash children, and prints success only after both return successfully under `set -e`. Its trap propagates failure and removes only its named scratch artifacts. `auth-rls-concurrency.sh:28–55` propagates cleanup-helper/catalog failures into final status. The process cleanup bodies and cleanup-fixture assertions belong to the other reviewer.

## Checklist and standards conformance

| Area | Review status |
| --- | --- |
| Purpose, exact diagnostic identity, empty input, duplicate/error limits | Covered statically within assigned ranges |
| Exit propagation, identity/state coupling, positive waiter evidence | Covered statically; real process/database behavior NOT_RUN |
| Small responsibilities, duplication, readable names, non-obvious comments | Covered; no confirmed actionable issue in the slices |
| Bounded polling, repeated control queries, sequencing and timing | Covered statically; performance/timing measurements NOT_RUN |
| Boundary validation, local disposable target checks, secret handling | Covered within the harness boundary; application authorization unchecked |
| Happy path and failure-test assertions | Authored oracle cases and three schedule call flows inspected; execution NOT_RUN |
| Documentation | Repair note describes authored behavior and pending validation; no runtime pass inferred from prose |
| Deliberate failures, AIDEV rationale, scoped changes | No observed violation within assigned code; strict TS/Python typing is not applicable to these shell files |
| Syntax, lint, formatting | NOT_RUN; delegated to coordinator tooling/CI |
| Helper lines 127–196, cleanup regression, catalog/visibility helpers | Unchecked; separate reviewer ownership |
| Production SQL, integrated runner, native clients/UI, wider authorization | Unchecked; outside assignment |
| Deep architecture tradeoff review / Obsidian simulation | Unchecked; no architecture change recommended by this bounded review |

The mandatory runtime/testing gates in project standards remain open. This report does not approve publication or certify the whole harness. No host tests, Docker/SSH commands, live database actions, sends, purchases, source edits, commits, or agent spawns were performed. Only this report was written; coordinator-owned state and review ledgers were left for integration.

## Remaining evidence for the coordinator

All of the following are **NOT_RUN by this reviewer**: fleet-02 Docker syntax/lint checks; the 18 diagnostic fixtures and the 16 cleanup fixtures assigned to the other reviewer; all three real PostgreSQL/Auth schedules; and the integrated post-Auth/pre-Rails guard run. Preserve actual exit statuses, both-waiter evidence, the timeout error and held-lock evidence, the committed-policy drift error, final catalog/fixture/session/lock restoration, duration and signal-cleanup evidence, and the final source hashes. Reconcile the other reviewer's cleanup findings and runner evidence before closing those gates.
