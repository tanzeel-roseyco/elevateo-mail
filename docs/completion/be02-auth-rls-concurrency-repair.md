# BE02 Auth RLS concurrency repair implementation

Status: **authored; all runtime and independent review checks NOT_RUN**. This fresh dispatch `ctx_143e4d739a63`, task `task_3e16362481fa`, implemented the preceding MAX design handoff (85 LOC, SHA-256 `9dfee2a319f891bee024836f6339b6de28fb299c238596efbfdb19ab59fc28dd`). Orca worker-show recorded requested/effective `gpt-6-astra` effort `low`; its exact terminal preview also displayed `GPT-6-Astra low` before edits. The initially unobserved turn-start receipt is not represented as an execution failure; the terminal was live.

Read the applicable project instructions, standards, orchestration workflow, local completion brief, prior authored concurrency handoff, and coordinator review. The review resides in the sibling `Elevateo Mail - Local Completion/docs/completion/review-be02-auth-rls-concurrency-processes.md`, not this checkout. Only the six files listed as authored below were written; unrelated existing worktree changes were preserved. No commits, host tests, syntax execution, SSH, Docker, agents, provider sends, purchases, ultrareview or deployment occurred.

## Authored disposition

The diagnostic oracle strips only the exact production psql filename and a positive decimal line prefix, then compares the complete severity/SQLSTATE/message literally. It counts exactly one error, reads a final line without newline, rejects foreign error text and unexpected diagnostic lines, and permits separate CONTEXT/LOCATION metadata plus the expected connection identity record. The upstream actual child exit-3 requirement remains. Failures identify the case without printing arbitrary log contents.

Cleanup now sends TERM to recorded child wrappers, observes exit and reaps before fresh database discovery. Failure to reap (including wait status 127), forced escalation, or incomplete exit remains failed even if subsequent server absence is observed. The retained application registry includes normally finished and interrupted-before-capture launches; invalid or duplicate application names fail closed.

Every fresh discovery and final absence query covers all registered exact application names plus postgres/supabase_admin constraints. Discovery validates every PID/start/name row and rejects malformed, foreign, duplicate or replaced identities before constructing any batch termination authority. Termination additionally requires the captured PID and backend start; final absence is a separate fresh all-name query, including when discovery was empty. A residual session triggers bounded retry; failed queries, uncertain identity and expired deadlines remain failures.

A shared eight-second server cleanup deadline permits at most one in-flight control-query overrun (the existing four-second timeout plus one-second kill grace); observations after the deadline cannot pass. Client cleanup retains the shared five-second grace plus up to one second per outstanding child (at most three in these schedules). The separate regression subprocess has a five-second timeout plus one-second kill grace, before the unchanged 75-second work watchdog; the outer runner remains 120 seconds. These are static bounds, not measured runtime evidence, and outer disposable-cluster reconciliation remains required on interruption or forced termination.

## Regression fixtures and retained integration

The driver invokes isolated Bash processes sourcing the actual helper. Error fixtures require the explicit assertion status 42 plus an assertion marker, distinguishing deliberate rejection from crashes or infrastructure exit codes. Cleanup fixtures mock only OS-child/query/clock boundaries; file-backed query steps and ordered events survive command substitutions. Boundary violations create a separate infrastructure marker and exit 90 rather than satisfying expected cleanup failure.

- 18 diagnostic fixtures: exact drift without final newline; exact timeout with metadata; policy/timeout suffix; trailing whitespace; prepended text; wrong state/severity; duplicate/different second errors; embedded NOTICE/CONTEXT; wrong filename; missing/invalid line prefix; empty log; successful identity only; foreign diagnostic after valid error.
- 16 cleanup fixtures: backend first visible after reap; never-connected client; mixed captured/uncaptured names; backend appearing between empty discovery and absence; changed PID/start; duplicate application rows; malformed/foreign rows; discovery/absence failure; failed reap; persistent residual session; forced escalation; invalid/duplicate registry names.
- The between-discovery-and-absence fixture deliberately advances the mock deadline after observing the residual backend and requires explicit failure, never an empty-captured-set success. The late and mixed fixtures require exact identity termination followed by fresh all-name absence.
- Mocks cannot prove timeout-wrapper OS behavior, PostgreSQL startup/disconnect timing, or locks. All three unchanged real schedules remain mandatory: simultaneous blocked grants; actual five-second production lock timeout; DDL committed only after observing the bootstrap waiter.

## Exact source manifest

Paths below are relative to this BE02 Codex checkout. Physical LOC includes comments and blank lines; hashes are SHA-256 of the authored LF bytes, read without executing them.

| Authored path | Physical LOC | SHA-256 |
| --- | ---: | --- |
| `ops/tests/be02-guards/auth-rls-concurrency-processes.sh` | 196 | `aef6bcc55040a65a52b9652df2d30d30a22aff3e188452aa56c497894935578e` |
| `ops/tests/be02-guards/auth-rls-concurrency.sh` | 127 | `1f5ecc889dcd0e038a2687086dda6fe9c198720e3c2a9dceaa7be92edefade91` |
| `ops/tests/be02-guards/auth-rls-concurrency-harness-regression-errors.sh` | 41 | `36cead291153bd45dde8f5b791c53385bc5e9d36981308dc8c64a6b3f88b8bbd` |
| `ops/tests/be02-guards/auth-rls-concurrency-harness-regression-cleanup.sh` | 102 | `996ea7fb45cc23c634b499f8ac868d24210dd727e8c89496728c4eedec605327` |
| `ops/tests/be02-guards/auth-rls-concurrency-harness-regression.sh` | 21 | `626420e8cb558a2e836516cb4ce62712dc299c2a302028841c781f24b3536f7c` |
| `docs/completion/be02-auth-rls-concurrency-repair.md` | Supplied in completion | Supplied in completion to avoid self-reference |

Protected source hashes were re-read and match the MAX handoff: production SQL 147 LOC `2f63d116e2b23af69d7abd0452893509231e39658d298a9ad207e75a8a96fcd6`; catalog helper 75 LOC `b9d31ec5d9c6fa5f63ee389aabcf6f9224c4257e58e44f8ed32ecbf5c9f98065`; visibility SQL 49 LOC `073e97ace4f79cd084e67adf1ecb73622ecaabc640fa076186c29731ff9ba9aa`; run.py 154 LOC `3c465d5364ac709d8891eaccf87fea81c9765c3ca191e2cc5c2dfb8d37234bb6`. The production before/after hash guards and direct original-file execution remain.

## Root review and execution handoff

Input findings: 2 / 156 helper LOC = 12.82 defects/KLOC; aggregate input review 2 / 293 LOC = 6.83 defects/KLOC. Both have authored repairs but remain open for independent review and runtime acceptance. No post-repair defect count or density is claimed. Root owns the shared review ledger and must record actual findings.

| Independent assignment | Separate review slices (each <=200 LOC) | Unique LOC |
| --- | --- | ---: |
| Diagnostic oracle and retained process barriers | helper 1-126; errors regression 1-41 | 167 |
| Cleanup identity/order/deadlines and fixtures | helper 127-196; cleanup regression 1-102 | 172 |
| Wiring and unchanged schedules | main 1-127; regression driver 1-21 | 148 |
| Dedicated design-tradeoff pass | helper 103-196; main 1-127; cleanup regression 1-102 | 323 |

Unique authored shell coverage is 487 LOC. Each assignment uses separate <=200-line passes and stays below 400 total lines. Review conformance, failure propagation, query authority, real-process bounds and diagnostic formatting; formatting belongs to Docker lint. Tradeoff remains the accepted handoff: strict diagnostic-format coupling prevents false oracle matches; name-based discovery closes interrupted-start accounting while identity-constrained termination fails closed on replacements. No new production design or Obsidian simulation is claimed.

Root must run Docker shell syntax/lint and the isolated driver, then the complete real Auth concurrency invocation through the existing post-Auth/pre-Rails runner, preserving all three schedule logs and accepted source hashes. Validate actual psql verbose formatting and real child shutdown, then run independent adversarial review and task-owned Docker cleanup/absence proof. Syntax, lint, 34 fixture executions, all three actual DB schedules, full runner integration, and independent review: **NOT_RUN**. This dispatch delivers authored repair only; it does not close release acceptance.
