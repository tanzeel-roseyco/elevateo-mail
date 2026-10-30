# BE02 membership race-test repair

Date: 2026-10-13 Australia/Sydney. Run `run_5cc7ae2ab900`, task `task_beaa515b9087`, dispatch `ctx_fe1f3404977f`.

## Scope and evidence

Authored bounded test-only repairs for R1, R2, and R3 from the full coordinator report at `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/docs/completion/review-be02-membership-sql-races.md`. That report was read in full at the coordinator's explicit direction; it was not copied or edited. Source ownership remains this BE02 checkout.

Application tests, syntax execution, lint, Docker, mutation experiments, and runtime lock observations: **NOT_RUN**. The coordinator owns container execution and independent review. Static inspection of the authored schedules is not runtime acceptance. No production code, frozen C/D contract `1.0.0-collaboration.1`, root documentation, unrelated writer files, commits, or activation settings changed. No agents or model calls were made. The dispatch requested Astra LOW; model identity was not independently verified by this worker.

## Repairs and discrimination

1. **R1:** Preserved the original same-version CAS test. Added a separate self-departure schedule using two managers, ordered UUIDs, and expected revisions `r` and `r+1`. An authorized no-op holds the revision lock while both managers still exist. The second worker must be observed in `change_mailbox_membership`, blocked by the first API backend; disjoint self generation guards rule out a substituted generation wait. Only then does the holder delete itself and commit. The second deletion must fail, revision must advance once, and the remaining active explicit manager must be the second actor. Moving the last-manager decision before the revision lock would let the second worker retain the old two-manager observation and delete the last manager, failing the assertions. Direct revision-table access was deliberately avoided because the API role has no such privilege.
2. **R2:** Preserved the original shared-target missing-guard test. Added reversed roles using the same two fixed UUID users: high targets low, and low targets high. Both existing-row and missing-row schedules hold the low guard, observe actual protected-write contention, then probe the high guard in a savepoint. PostgreSQL may report a queued tuple waiter as a soft blocker, so the second observation accepts the already-observed first worker as well as the holder. Actor-first locking or inserting high before low makes the high-row probe fail; sorted acquisition leaves it available. In the missing case, low is uncommitted holder-created data and high remains absent after rolling back the probe, so workers contend on creation and must create high themselves. Existing-row mutations are no-ops (two successes, no increments); missing-row mutations request a real capability change (one success, one CAS conflict, one revision increment, generations exactly 1 and 2). These guard observations happen in `begin_protected_write`, before mailbox business locking.
3. **R3:** Replaced the delete/re-add test's unbounded PID pop and join with PID-or-exception publication, exception-aware polling, bounded results, and one monotonic race budget. The helper reserves the last 250ms for cleanup, with the last 100ms available for joining a cancelled overdue thread. Holder scopes are nested inside the race scope, so commit/rollback happens before cleanup. Cleanup retains the original exception instead of replacing it with a join failure. Added regressions for an injected failure before PID publication and a worker that finishes without ever reaching the expected lock; they require the useful cause, no remaining worker, and an idle holder transaction. The missing-lock case also asserts bounded elapsed time.

## Exact changed-source manifest

Paths are relative to `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. SHA-256 hashes cover full files, including unchanged context. Counts include blank and comment lines.

| Proposed reviewer / pass | Path | Inclusive physical range | LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| A / 1 | `apps/server/test/be_02/mailbox_membership_concurrency_test.rb` | 1-148 | 148 | `65A3F5789E1330D1D837119E2280152C2F49C7C2BC5AFA098C16FB7E05CC042F` |
| A / 2 | `apps/server/test/be_02/mailbox_membership_database_test.rb` | 1-141 | 141 | `F182CB092D31CD97FDE022700FC7E6F6CD62E05F10AA9A8BF9BD42C23F958E8B` |
| B / 1 | `apps/server/test/be_02/mailbox_membership_database_helper.rb` | 1-189 | 189 | `B9E7C939C804F40CEB6302ECE846C54544898AD1D216776E4DAD452AB9C2BE29` |

Total unique source: **478 physical LOC**. Reviewer A: 289 LOC across two passes; reviewer B: 189 LOC. Every pass is below 200 LOC and every reviewer below 400 LOC. These are proposed independent review assignments, not completed adversarial reviews. A separate design reviewer can inspect concurrency lines 1-80 and helper lines 85-167 (163 LOC) for schedule discrimination, proof boundaries, and cancellation tradeoffs. Formatting remains delegated to lint/CI.

The fourth changed path is this report, `docs/completion/be02-membership-test-repair.md`; its final hash is supplied in the worker completion message rather than recursively embedded here.

Defect accounting: **3 inherited test defects addressed in authored source; 0 runtime-verified closures**. Original review test density was **3 / 0.183 KLOC = 16.39 defects/KLOC**. Across the current expanded 478-LOC source envelope, those three inherited findings correspond to **6.28 findings/KLOC**; this is an accounting denominator, not an independent claim that no defects remain.

## Coordinator follow-up and caveats

- Run the two changed test classes in the authorized Docker environment, then relevant existing membership regressions; verify the original CAS and shared-target cases still pass. All test execution remains NOT_RUN here.
- Perform isolated mutation experiments for a pre-business-lock last-manager decision and actor-first/unsorted guard creation. Static reasoning predicts rejection; no mutant was installed or executed by this worker.
- Inspect actual PostgreSQL wait chains, fixed-user fixture cleanup, and pool behavior. Fixed UUID fixtures assume this test class is not duplicated concurrently against the same database. Normal workers use the existing 2s lock/3s statement limits, while the race budget is intentionally shorter.
- Forced thread cancellation is a last resort after holder release, not a guarantee against an uninterruptible native driver. Its join is bounded; the coordinator should verify driver cleanup under failure before accepting runtime evidence. Both injected regressions assert no surviving worker. Existing unrelated shared helpers remain read-only, including their original parallel-services behavior.
- No genuine production failure was observed statically; a runtime implementation failure must be escalated to root rather than weakening these tests or changing production in this bounded repair.

Review checklist: R1 valid next revision and observed business wait; R2 reversed topology, both creation states, high-guard probe and exact increments; R3 original error propagation, common deadline and holder-before-worker cleanup; unchanged API/contract/security boundaries; no unauthorized execution or publication. Independent adversarial and design review remain coordinator-owned.
