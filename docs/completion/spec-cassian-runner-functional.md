# SPEC-C21 functional source review

Reviewed immutable commit dc3796a89b7e42f40c84040adc36a9924590f370. Actual reviewer: inherited Codex agent; effective Fast billing unverified. Independent functional review only; no product modifications.

Scope: ops/tests/be02/run.py bootstrap_database_roles and its call site (7 source lines), ops/tests/be02/test-suites.sh (30 lines), ops/tests/be02/test_send_runner.py (72 lines): 109 unique source lines, one assignment below 200 lines. Context inspected in separate bounded packets: Task compose/error behavior, bootstrap service configuration, privileged send SQL, migration sequencing and runner phases. Rubric: INT-401 purpose, invalid/empty inputs and limits, cross-system effects, simplicity, duplication/naming/comments, happy/failure tests, documentation, boundary validation/authorization, and performance.

Result: 0 actionable defects, 0/KLOC for reviewed 109 lines. SOURCE REVIEW ONLY; runtime NOT_RUN by this reviewer.

The helper executes ordinary role bootstrap then send-owner/schema bootstrap before auth startup and migration. Task.compose propagates required-command nonzero exits; Postgres bootstrap entrypoint enables ON_ERROR_STOP and the SQL transaction rejects privilege drift. Static filenames and argv arrays avoid shell interpolation. Both phases are bounded to 45 seconds; no new hot-path queries or unbounded loops.

The shell admits all existing BE02/request suites and every test/sends suite, explicitly rejects missing four database suites before executing anything, preserves process isolation, and accumulates failures across later successful checks. Glob null handling cannot erase the explicitly required send database suite set. Current API read/boundary/controller suites are included by the wildcard.

Regression source meaningfully checks bootstrap order and failure propagation at either phase, actual Bash suite discovery through a controlled temporary executable, missing-suite fail-closed admission, and retained failure despite later successful suite/Steep execution. The mock tests do not prove real database readiness, SQL correctness or Docker behavior; the shell stub does not execute Ruby suites. Runtime evidence must therefore come from coordinated fleet execution.

Limitations: no application/container commands or tests executed, no cleanup necessary because no runtime resources created. Null task is outside the typed helper contract; no external input is added. Existing 480-second aggregate Ruby-suite budget is unchanged and needs observed fleet duration with the expanded suites. Documentation claims remain explicitly untested pending fleet evidence. Dedicated design review remains a separate assignment.
