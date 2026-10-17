# BE02 auth cleanup — bounded adversarial review

Date: 2026-10-14 (Australia/Sydney). Task: `task_afd78dd25906`; dispatch: `ctx_5aac1c5a536d`.

Reviewer: Codex, **gpt-6-astra**, **max** effort. Evidence: Orca's effective worker launch and live terminal preview agree on this identity; no independent provider response metadata was available. No substitute reviewer or subagent was used.

## Result and scope

**No confirmed defect was established in the 172 assigned physical lines.** The selected database cleanup logic validates a complete discovery batch before authorizing termination, rejects ambiguous identities, and requires a fresh all-name absence check. This is a static conclusion, not a runtime pass or certification of the complete harness. Shell-child PID ownership remains an unresolved safety concern, detailed below.

Runtime: **NOT_RUN**. No host application tests, Docker, SSH, servers, dependency installations, commits, or additional review agents were used. Source was not modified. Formatting is delegated to linters; no lint result is claimed.

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/`.

| Source | Inspected physical range | Unique LOC | Whole-file SHA256 |
| --- | --- | ---: | --- |
| `ops/tests/be02-guards/auth-rls-concurrency-processes.sh` | 127–196 only | 70 | `aef6bcc55040a65a52b9652df2d30d30a22aff3e188452aa56c497894935578e` |
| `ops/tests/be02-guards/auth-rls-concurrency-harness-regression-cleanup.sh` | 1–102, entire file | 102 | `996ea7fb45cc23c634b499f8ac868d24210dd727e8c89496728c4eedec605327` |

The supplied hashes matched before implementation inspection and on the final pre-report metadata check. Each source read/review pass covered at most 200 physical lines. Total unique implementation/test coverage is **172 LOC**, including blanks and comments; no implementation outside these ranges was opened. Whole-file metadata reports 196 and 102 physical lines respectively.

Applicable ancestor/project instructions and `.planning/STANDARDS.md` were read as review context, along with the local-completion planning/state documentation. The assigned report is the only changed file; the coordinator owns aggregate review ledgers and application state updates.

## Checklist and evidence

| Check | Static assessment and evidence |
| --- | --- |
| TERM, escalation and reaping | `processes.sh:140–150` sends TERM before database discovery, shares a five-second grace period, records KILL escalation as failure, and attempts reaping. `127–133` bounds the existence poll and treats `wait` status 127 as failure while accepting signalled-child exit statuses. Numeric PID ownership is not proven by this slice; see U1. |
| Database registration scope | `151–158` rejects invalid or duplicate application names, limits names to 63 characters, and scopes discovery/absence to exact names, database `postgres`, and user `supabase_admin`. No wildcard matching or unvalidated name interpolation is present. |
| PID/start/name proof | `165–176` validates row shape, registry membership and uniqueness. When either captured PID or start exists, both must match. The eventual termination predicate comes from the uninspected `identity()` helper; its contract was supplied by the coordinator below. |
| Ambiguous batches fail closed | `164–185` builds local pending maps and validates every row before promoting identities or requesting termination. A valid first row followed by a duplicate, unknown name or changed captured identity cannot authorize partial termination. |
| Fresh absence and deliberate errors | `185–195` propagates termination/absence query failures, rejects malformed counts, and requires zero from a fresh query over all registered names. Deadline exhaustion, residual sessions, reaping failure and forced escalation cannot return success. |
| State coupling | Captured identities persist across retries; pending/seen maps reset per discovery (`164`, `172–182`). Application registrations remain available for late-session absence checks. The caller's lifecycle and broader effects of retained child entries were not inspected. |
| Empty inputs and limits | An empty registry produces a false predicate and an empty discovery batch grants no termination authority. Empty/malformed absence output is rejected (`191`). Name length is bounded (`153`); arbitrary external array construction and launcher limits are outside coverage. Boundary behavior is not runtime-verified. |
| Regression intent and failures | `regression-cleanup.sh:86–102` contains **16 invocations**, with three expected successes and thirteen expected failures. Cases cover late/mixed/absent sessions, changed PID/start, duplicate/malformed/foreign rows, discovery/absence query errors, reap failure, residual sessions, escalation, and invalid/duplicate registration. Uncovered branches are listed below. |
| Mock reliability | File-backed step/event/infra records (`16–74`) survive query command-substitution subshells. Assertions enforce reaping before queries, exact SQL scope, expected captured identities, and no termination for rejected scenarios. The infrastructure side channel prevents expected failures from hiding mock assertion failures. These are test assertions in source, not observed passes. |
| Maintainability, comments and cost | The two inspected functions have focused cleanup roles. AIDEV comments explain ordering, whole-batch validation and fresh absence. No added dependency or speculative abstraction appears. Processing scales with the registry and returned rows; caller cardinality is uninspected. |
| Documentation and standards | Review evidence and limits are recorded here. The selected source supports deliberate errors and fail-closed validation. Docker/runtime and complete application verification obligations remain with the coordinator. Broader documentation synchronization cannot be certified from this bounded assignment. |

## Numbered confirmed defects and density

None established; there are no numbered confirmed defects or source repairs to prescribe from this review. The limitations below are not counted as confirmed defects or silently treated as satisfied requirements.

**Defect count: 0. Defect density: 0 / (172 / 1000) = 0.00 defects/KLOC.** This denominator covers only the inspected physical implementation/test lines and is not an application-wide quality metric.

## Unresolved safety concern and coverage gaps

1. **U1 — OS child ownership is unverified.** `processes.sh:141` sends TERM to retained numeric PIDs, and `144–149` uses `kill -0` before KILL/reaping. Existence is not process identity. The coordinator confirmed that launches record `$!`, normal `finish_child` removes an entry after waiting, no OS process start identity is captured, and cleanup itself retains entries after reaping. If an exited child's PID is recycled while its entry remains, these checks do not prove that a signal still addresses the task-owned child. This review did not inspect the containing PID namespace, caller lifecycle or any isolation guarantee and did not reproduce PID reuse, so it does not claim a demonstrated foreign-process termination. Minimal follow-up: establish the ownership/isolation contract, add a stale/reused-PID and repeated-cleanup regression, and prevent signals when ownership is ambiguous; clear successfully reaped entries where the lifecycle permits. A start-time check alone should not be presented as an atomic signalling guarantee.
2. **U2 — Two explicit failure branches lack assigned regression cases.** No fixture makes the termination query fail (`processes.sh:185`), and no fixture returns malformed absence output (`191`). The mock always returns `t` for permitted termination and numeric counts for absence (`regression-cleanup.sh:57–70`). The coordinator confirmed that neither case was found in this assigned regression file. Minimal addition: one fixture per branch, asserting nonzero cleanup and the exact permitted event sequence. No claim is made about uninspected tests elsewhere.
3. **U3 — Rediscovery success and boundary behavior remain unchecked.** The fake sleep advances `SECONDS` by nine (`regression-cleanup.sh:31`), so `between` deliberately verifies bounded failure after empty discovery/nonzero absence, not a successful second discovery and termination. Empty registries, 63/64-character name boundaries, real signalled-child wait statuses and multiple real child processes are also not exercised by these fixtures. These are coverage limits, not evidence that the implementation fails those cases.

## Coordinator-supplied helper contracts

Question `msg_892779c0a2a9` requested missing contracts without expanding source inspection. The coordinator replied through Orca and directed completion of this bounded report. The following is **coordinator-supplied evidence, not independently inspected implementation**:

- `identity(name)` includes PID, numeric backend-start epoch, exact application name, database `postgres`, and user `supabase_admin`.
- `query()` wraps psql with a four-second timeout, one-second kill-after, two-second statement timeout, and one-second lock timeout.
- `start_child` stores the background timeout process's `$!` in `children`; `finish_child` polls existence, waits and removes that entry. No captured OS start identity or explicit PID-reuse verification exists; see U1.

The shell's eight-second discovery deadline is checked after each query. It therefore is not, by itself, a strict eight-second wall-clock cap; completion also depends on the query wrapper and scheduler. The supplied timeout contract provides a bound for an individual query, subject to runtime verification.

## Design assessment and limits

The inspected design favors conservative cleanup failure over uncertain database termination. Whole-batch validation can leave a known backend alive when another discovered row is ambiguous; that is consistent with fail-closed ownership and should surface as failure for the coordinator to handle. A fresh all-name count covers sessions that were not captured before interruption without accepting a merely empty first discovery as success.

Static scenario tracing gives these outcomes: a matching registered identity may be terminated and succeeds only after zero absence; a changed or duplicated identity fails before termination; empty discovery followed by a positive count cannot succeed; escalation or `wait` ownership failure remains a failure even if absence later becomes zero. These are code-derived predictions, not executed simulations.

No broad architecture change is recommended. Obsidian-backed tradeoff simulation was unavailable: no Obsidian connection was exposed and the documented local knowledge/review indices were absent. This report records analytical tradeoffs only and does not claim that requirement was executed.

Unchecked dependencies include `processes.sh:1–126` and its helper implementations, caller/trap ordering, array initialization and name generation, timeout and signal behavior, PID namespace/isolation, PostgreSQL permissions and activity-view visibility, actual SQL evaluation, scratch-directory provisioning, other regression files, and the complete BE02/FE02 application. Runtime, lint, integration and end-to-end results all remain **NOT_RUN** by this worker and must be supplied by the coordinator before broader acceptance.
