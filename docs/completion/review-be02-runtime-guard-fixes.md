# BE02 runtime guard repairs: bounded adversarial review

Reviewed 2026-10-13 (Australia/Sydney) for task `task_5d39ce2c289a`, dispatch `ctx_d2e008c00810`, run `run_5cc7ae2ab900`.

**Result: no confirmed defects in the assigned repairs.** This is a source review with examination of existing coordinator runtime evidence, not Rails acceptance. The recorded run failed at a separate private-parameter permission check.

## Scope and accounting

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.

| Pass | File | Exact reviewed range | Physical LOC |
| --- | --- | --- | ---: |
| 1 | `ops/db/bootstrap-auth-grants.sql` | 1-62 | 62 |
| 1 | `apps/server/db/be02/grants.sql` | 1-61 | 61 |
| 1 | `ops/tests/be02-guards/auth.sh` | 1-58 | 58 |
| 2 | `ops/tests/be02/run.py` | 1-151 | 151 |

Pass 1 covers 181 lines; pass 2 covers 151 lines. Total: **332 physical LOC**, including comments and blank lines, with no uncovered ranges in these four files. Distinct lines are counted once. Confirmed defects: **0**; defect density: **0 / 332 × 1,000 = 0.00 defects/KLOC**. No severity/file/line/reproduction/fix entries are warranted because no defect was established.

These files were untracked in the reviewed checkout, so this review attests their worktree contents, not a committed diff. Applicable `AGENTS.md`, `.planning/STANDARDS.md`, README/state/documentation context, and the grants-repair documentation informed the review. Helpers, migration callers, cleanup implementation, and the broader application are outside this assignment. No implementation files or root state documents were changed.

## Findings and reasoning

- **Sequence type safety:** `bootstrap-auth-grants.sql:43-47` and `grants.sql:54-57` put the sequence-only inquiry inside `CASE WHEN relkind = 'S'`. The function receives a row-dependent relation OID only for sequences; table, index, and TOAST rows select `false`. Reordering surrounding `AND` predicates therefore cannot invoke this function on a non-sequence. This is consistent with PostgreSQL's conditional evaluation rules; their constant-folding caveat does not apply to this row-dependent expression. [PostgreSQL 17 CASE documentation](https://www.postgresql.org/docs/17/functions-conditional.html)
- **Privilege semantics:** The CASE change retains the existing schema, role, and privilege-list boundaries. PostgreSQL treats comma-separated privilege lists as an any-match inquiry, so any one of sequence `USAGE`, `SELECT`, or `UPDATE` still triggers rejection. The repair neither converts this to an all-privileges requirement nor weakens table/column/grant-option checks. Fixed role names and catalog OIDs introduce no new external input or dynamic SQL injection surface. Empty entrypoint arrays in `grants.sql` still describe no permitted function execution. [PostgreSQL 17 privilege inquiry documentation](https://www.postgresql.org/docs/17/functions-info.html)
- **SQL failure handling:** `bootstrap-auth-grants.sql:2-3,24-61` keeps `ON_ERROR_STOP`, an explicit transaction, drift rejection before new grants, and a postcondition before commit. A raised guard error cannot commit the attempted grants through this script. The separate `grants.sql` fragment has no transaction wrapper of its own; caller-level atomicity was not independently verified here and was not changed by this repair. PostgreSQL documents both transaction rollback semantics and noninteractive `psql` failure behavior. [Transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html), [psql ON_ERROR_STOP](https://www.postgresql.org/docs/17/app-psql.html)
- **Regression and negative checks:** `auth.sh:3-5` adds a table/index fixture with a text column to exercise a mixed relation catalog. Existing cases retain sequence drift rejection (`30-31`), table/column/schema/PUBLIC excess-permission rejection, and exact four-column success with private-column read/write denial (`38-58`). The permission assertions raise an error on unexpected success and catch only `insufficient_privilege`, avoiding an unconditional-success exception handler. Fixture transaction/rollback behavior is described in `docs/completion/be02-grants-repair.md:28-30`; the helper implementing it was not reviewed in this assignment.
- **Runner ordering and fail-closed result:** `run.py:94-107` arms cleanup before starting disposable services, then runs database guards and Auth setup before building or inspecting the application image. `PASSED` is assigned only after the later application checks and source-hash comparison (`112-126`). Exceptions retain a failed result; the `finally` block gives cleanup its own deadline and removes the temporary environment file (`127-140`). The final exit requires both tests and cleanup to pass (`147`). The examined failure evidence confirms that the guard error did not become a successful run.
- **Maintainability and boundaries:** The repairs are narrow, introduce no dependencies or new state abstraction, and explain the non-obvious planner and build-order constraints with AIDEV notes. Catalog scanning remains setup-time work, outside application request paths. No newly introduced null/list/maximum-input path or unrelated behavior change was identified in the assigned repairs. Formatting, unrelated architecture, and application-wide standards conformance were not certified.

## Existing runtime evidence and limits

Examined evidence under the source root:

`ops/local/be02-runtime-stage-0b1aa6b178bd42a48522a09fa60edf72/evidence/`

- `014-privilege-guards.log:24-26` records fresh and idempotent Auth grant success, followed by `ok auth-mixed-relation-catalog`.
- The same log records subsequent Auth rejection cases, including `ok auth-sequence-drift` at line 54 and `ok auth-exact-four-column-read` at line 57.
- Lines 60-64 then record `permission denied to set parameter "app_auth.verified_user_id"`, `FAILED named-default-acl-boundary`, and exit 1. This is the already identified, separate parameter-permission blocker; it is not a newly found defect attributed to these repairs.
- `result.json` records `tests: FAILED`, a privilege-guards exception, and `cleanup_passed: true`. `cleanup.json` records removal of two task containers, two task database/config volumes, and one network, with no errors and shared base images retained. These are the coordinator's recorded results, not independently executed cleanup by this reviewer.

The evidence supports the mixed-catalog regression and the runner's early failure/cleanup path. It does **not** establish full private-grants execution, successful Rails image build, migrations, Ruby/Steep suites, real Auth/API HTTP acceptance, worker acceptance, or failure cleanup after every later stage. A fresh successful coordinator run remains required after the separate parameter repair. The shared test helper was not mutation-tested here, so this report does not claim that reverting CASE must fail under every possible query plan.

No Docker, SSH, host application tests, paid sessions, new agents, or commits were run for this review.

## Snapshot identity

The following SHA-256 values matched both the reviewed files and the supplied run's `source.sha256.json`; they were rechecked before writing this report.

| File | SHA-256 |
| --- | --- |
| `ops/db/bootstrap-auth-grants.sql` | `4c4dd33830d110a251985073c70f757f5b45d1ba8768752a5145ba02f9ffec8e` |
| `apps/server/db/be02/grants.sql` | `840f1e348288540b0b7121c9680ff2aa89ae3df73409831c4e4fa7aeb79e7ee1` |
| `ops/tests/be02-guards/auth.sh` | `adeca4d4b4d6dbb64ccdbc7dbc832488483fceb0a3bbe020d5e3976ff90a4885` |
| `ops/tests/be02/run.py` | `dbc4bb11eac8838530fe5ac4e8413677076b025948e4964ec53c811378a05d37` |
