# Final SQL and runner regression review

Reviewed 2026-10-24 for task `task_fa9ec6386b9f`, dispatch `ctx_ad987f8ac1af`.
Result: zero actionable defects in 134 unique physical source lines; defect density
0 / 134 × 1,000 = **0 defects/KLOC**. This is bounded static review, not runtime
verification or production acceptance. Only this report was edited.

## Frozen packets and identity

Slice hashes use UTF-8 without BOM, LF between lines and one final LF. Whole-file
hashes use the actual on-disk bytes, preserving their line endings. Counts include
blank lines and comments; the packets are disjoint and each is below 200 lines.

| Packet | Exact path | Inclusive slice | Physical lines | Defects | Defects/KLOC |
| --- | --- | --- | ---: | ---: | ---: |
| A | `ops/production/launch-controls/test_enrollment.py` | 175–216 | 42 | 0 | 0 |
| B | `apps/server/test/be_02/thread_database_test.rb` | 154–182 | 29 | 0 | 0 |
| C | `ops/tests/be02/test-suites.sh` | 1–63, complete | 63 | 0 | 0 |

Packet A slice SHA-256: `2623d46aa80c138499376a57a740753b1e854a11841d3a4613edd8b063a9da24`.
Whole file: `e3bec09b70e68e75fe3b87549c18cb2b2028b7d7fc461edf32ff0589ce57dfef`.

Packet B slice SHA-256: `4756d076e75e20a7a3d01e672fdce8a1a2fa3acd3300353b3d45c4e11f1cfc6b`.
Whole file: `072a69371a313ef7b7df0f3a6bf9c884eb39864fede701d71efa97374e632d11`.

Packet C slice SHA-256: `72b0da4e8034804c23bddb06488b1f1d694d2b552c3c270435fdc7ca37faed2e`.
Whole file: `b7297b5ba0540e8f4c465961d36b0f30bb91aecc0367e0093f2846e8b319bfc2`.

## A: session revocation ordering

The exact method is `test_session_revocation_serializes_before_enrollment`.
Deletion and expiry each run with revocation first and enrollment first, resetting
fixtures for every schedule. The holder remains in an explicit transaction after
executing its first operation; READY follows that operation. The waiter must be
observed blocked by the holder through `pg_blocking_pids` before COMMIT is sent.
This proves an overlapping lock wait rather than assuming overlap after a sleep.
Early waiter exit and exhaustion of 200 polling attempts fail the test.

Revocation first must return unauthorized and create zero memberships. Enrollment
first must return ok before READY and leave one membership after the subsequent
revocation. That assertion establishes the permitted serialization order; it does
not assert that enrollment-first revocation erases membership. Both child exit
codes are checked. SQL statements have a 10-second timeout; holder and waiter
communication use 10- and 15-second timeouts. The polling sleep is retry pacing,
not the ordering oracle. The finally block commits the holder on barrier failure
so the normal assertion-failure path releases its lock.

Limits: the initial stdout reads have no Python-side deadline, and the called
`execute` helper is outside this packet. SQL statement timeouts bound statement
execution, not arbitrary connection/startup stalls; no universal process-liveness
guarantee is inferred. No actionable regression is established by this limitation.

## B: dense organization-list fixture

The actual path is under `test/be_02`, not `test/threads`. The reviewed method is
`test_organization_list_bounds_dense_120_mailbox_query`; line 182 is only the next
method signature and contributes no reviewed assertions for that next method.
The fixture adds 119 mailboxes, 100 threads per tenant mailbox, and messages for
the tenant threads. Both inserts use a bound organization parameter. It exercises
the ordinary page response (50 items plus cursor) and EXPLAIN ANALYZE of the actual
organization query with a 51-row lookahead, asserting 51 root output rows.

This is a meaningful dense workload and captures the complete JSON plan for
inspection. It does not assert a latency threshold, scan count, per-mailbox plan
shape, or exhaustive traversal; the separate 173-row traversal is context only.
The report correctly describes the 211.186 ms result as a fixture observation,
not a production guarantee. The exact 120-mailbox/12,001-thread label depends on
setup and mailbox helpers outside this assignment; those helpers were not audited.

## C: suite admission and deferral

The exact cleanup unit path is admitted before the broad directory cases, while
the exact Mox app-chain path is recorded as deferred with its dedicated-harness
reason. Other new unclassified suites fail admission. Nonempty selection is
required, failures accumulate across independent Ruby processes, and test/type/
lint commands each have finite timeout plus kill grace. The final status fails
if any selected check fails. Dedicated app-chain deferral cannot silently count
as execution or passing evidence; its execution remains a separate acceptance
requirement. This packet classifies files that exist; it does not independently
require the cleanup or app-chain file to exist, nor verify the dedicated harness.

## Rubric, context and scope limits

Applied the supplied functional/security/regression rubric to all three packets:
ordering and state assertions, empty selection and admission failures, finite
query limits, parameterization, readable ownership, non-obvious comments, test
failure paths, unnecessary abstractions, and performance claims. No new external
input boundary or authorization implementation is introduced by these packets.
No styling review, nested review agents, host tests, builds, Docker execution,
frontend changes, production changes, live mail or external publication occurred.

Read `launch-authentik-20261023.md` and `launch-unified-server-20261023.md` as context
only, including their reported fleet results and historical failures. Those
reports do not substitute for independently rerun tests. The supplied standards
and README/state/documentation establish context, not additional source coverage.
No production SQL, query implementation, fixture helpers, cleanup implementation,
dedicated Mox harness, whole-system authorization, or frontend behavior was
reviewed. No runtime pass, whole-project approval, independent design review or
Obsidian simulation is claimed. No actionable defect requires coordinator repair;
the remaining work is coordinator acceptance of separate runtime/release gates.
