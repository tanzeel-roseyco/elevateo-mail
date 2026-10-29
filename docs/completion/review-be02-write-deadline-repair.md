# BE02 protected-write deadline repair: bounded adversarial re-review

Review date: 2026-10-13 Australia/Sydney. Task `task_ef5e89f86506`, dispatch `ctx_efe3e143c9c0`. Reviewed workspace: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. This report is the only file written. No application execution, host tests, Docker, SSH, source edits, commits, additional agents, model calls or paid reviews were performed.

## Verdict and governing requirement

**WD-01 is partially repaired, but remains open at MED severity.** PostgreSQL 17's native transaction timer closes the previous cumulative-statement/idle-database-transaction gap. The wrapper still defers the request's asynchronous expiry across Ruby work and connection cleanup. Separately, unconditional pool check-in can return an adapter that Rails has already removed after an unsuccessful commit (**WD-R02, MED**).

**Runtime status: NOT_RUN.** These are static findings and analytically simulated interleavings, not measured failures. Root Docker acceptance remains required. Formatting, lint, typechecking and broader suite acceptance are outside this read-only assignment.

The accepted normative requirement is BE02-D05, `.planning/consultations/results/be-02/decisions.md:65`: the entire server request includes Auth and serialization in the canonical ten-second deadline, with tighter internal timeouts and no late streaming. D03 at line 41 places Auth HTTP before the short SQL transaction. D05 at line 69 requires session, sorted generation, then business locks. D07 at lines 83–85 preserves durable operation outcomes and treats absence as unknown, including after lost acknowledgement. This review does not authorize changing these decisions or the durable 409 replay behavior.

Governing context read: project instructions; standards; planning/workflow guidance; current README/state/documentation sections; local completion instructions; accepted BE02 decisions; the write-boundary and session/database interface documents; and the prior coordinator `review-be02-write-design.md`. Implementation dependencies outside the assigned ranges were not inspected. Existing documentation already acknowledges connection setup and network limits; that disclosure does not resolve the avoidable Ruby-work overrun below.

## Exact coverage

Counts include blank lines and comments. Counted before review; two passes, neither exceeding 200 physical source lines. Hashes were rechecked without drift during review. No additional first-party implementation was reviewed.

| Pass | File relative to reviewed workspace | Inclusive lines | LOC | SHA-256 of whole file |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/lib/elevateo/session_writes.rb` | 1–100 | 100 | `7d7ddb8c1a2e8167da2faab5e8e10682965ad40333408387c1018cda9815e0dc` |
| 1 | `apps/server/sig/session_writes.rbs` | 1–20 | 20 | `0ad5936e51c1fc19671cdce4c581994667e66b549e52778eece9c1e36abb5e1f` |
| 1 | `apps/server/sig/rails_seams.rbs` | 122–123, changed checkout/checkin declarations only | 2 | `cab4289665cf64191b129d8bd5f9006a5424156144e86b1d9a37cfe5e1402851` |
| 2 | `apps/server/test/be_02/write_boundary_deadline_test.rb` | 1–102 | 102 | `9395d3c7f31e8e661738894ca4d9910f1d2ef82b8d2da7e634ec073dea848f21` |
| 2 | `apps/server/test/be_02/write_boundary_database_deadline_test.rb` | 1–47 | 47 | `8fb25217ef03a39070c1c598a9df44dc0ca2f7379c252cc4b495b86bf702bdb7` |
| Total | Five files; only two declarations in the Rails seams file | | **271** | |

Pass 1: 122 LOC. Pass 2: 149 LOC. **Open defects: 2 (one residual prior defect, one new defect); defect density: 7.38 defects/KLOC, or 0.738 defects per 100 reviewed physical lines.** This measures this assignment, not overall product quality. Related symptoms and missing tests are not counted again as independent defects. Root owns incorporation into the project-wide `code-reviews.md` and state records.

## WD-01 — MED: request expiry remains deferred through Ruby work

**Locations:** `session_writes.rb:14–18`, `:47–57`, `:61–74`; tests `write_boundary_deadline_test.rb:73–88`.

`Thread.handle_interrupt(RequestDeadline::Expired => :never)` surrounds the entire connection/transaction operation, including yielded business work and response verification. Ruby defers that asynchronous exception until the mask ends; synchronous `deadline.check!` still works, but only when execution reaches it. Thus killing the PostgreSQL backend does not interrupt a Ruby serializer that is still running. See the [Ruby 3.4 interrupt-mask contract](https://docs.ruby-lang.org/en/3.4/Thread.html#method-c-handle_interrupt).

**Concrete reproduction:** use a one-second deadline and enter the real protected-write path. After acquiring guards and performing a test mutation, block the operation's pure Ruby materialization/serialization on a controlled gate. Let the deadline expire, and leave the gate closed past the permitted interval. The request thread and checked-out adapter remain occupied, even if the database has already terminated its transaction and released guards. Opening the gate eventually reaches the explicit check and failure cleanup. An ordinary slow Ruby operation can therefore violate the stated request bound without any network fault.

The existing asynchronous unit test does not disprove this: it injects the exception without advancing the fake monotonic clock, lets the block finish, and expects commit followed by the deferred exception. It proves the masking policy, not bounded elapsed request time.

**Smallest safe repair:** retain the native database timer and the protection against asynchronous interruption during adapter/resource-ownership transitions. Make explicitly interrupt-safe Ruby materialization/serialization deadline-aware, either through sufficiently frequent cooperative checks or a narrowly scoped interruptible region after auditing cleanup. The current blanket mask cannot remain the sole protection for arbitrary Ruby work. Do not simply remove every mask or wrap the whole Rails transaction in another asynchronous timeout: that can interrupt rollback, commit accounting or pool cleanup. Update the line-14 rationale and affected documentation with the implemented guarantee.

**Deterministic regression:** in Docker, use barriers to confirm the real wrapper has acquired guards and entered Ruby serialization, then expire the real request deadline while the serializer remains blocked. Assert bounded failure or cooperative cancellation, no protected success payload, and eventual transaction/connection cleanup; release the gate in test teardown so a failure cannot hang the suite. A separate controlled late-serialization case must show rollback of the test business mutation. Keep a subprocess/test watchdog as a harness safeguard, not evidence that the application enforces its own deadline.

### COMMIT is a separate limit within the deadline analysis

In upstream PostgreSQL **REL_17_6**, `CommitTransaction` calls `HOLD_INTERRUPTS()` at line 2138, disables `TRANSACTION_TIMEOUT` at lines 2150–2152, and only then records the commit at line 2160. Lock release is later, at lines 2222–2224. A WAL/durability stall in that critical section can exceed the timer; neither a shorter statement timer nor another transaction timer makes it safely interruptible. See [pinned transaction implementation](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/access/transam/xact.c#L2137).

This does **not** mean the application must guarantee receipt of a network acknowledgement by an absolute instant. A cooperative operation deadline is enforceable at application checkpoints; an absolute guarantee of database outcome or client receipt under arbitrary stalls is not. The application's response wait can be bounded independently, but a connection owner that may still be committing must remain isolated from reuse until resolved. That is a larger ownership change, not a one-line timer fix. Root should decide the implementation and explicitly describe the achievable guarantee; this review does not weaken the accepted request requirement.

After COMMIT may have reached the server, a timeout/disconnection must preserve an unknown outcome and reconciliation through the durable operation record. Do not infer rollback, blindly retry the write, erase a durable conflict outcome, or change 409 replay. Test lost acknowledgement separately from a definite pre-commit rollback.

## WD-R02 — MED: unconditional check-in can requeue an evicted adapter

**Location:** `session_writes.rb:68–73`.

On an incomplete commit with `ActiveRecord::ConnectionFailed`, Rails invalidates the transaction and its transaction-manager ensure path calls `throw_away!`. That removes the adapter from its pool and disconnects it. The wrapper then disconnects again and unconditionally calls `pool.checkin(connection)`. Rails check-in expires the lease and adds the adapter to the available queue without checking that it remains in the pool's registered connections. This can leave an available adapter outside the pool's capacity/lifecycle accounting. See [Rails 8.1.4 transaction failure handling](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/transaction.rb#L600), [adapter eviction](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb#L733), and [pool check-in/removal](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb#L623).

**Concrete reproduction:** use a real Rails pool of size one and a materialized transaction. Inject `ActiveRecord::ConnectionFailed` at the actual COMMIT adapter boundary. Rails evicts; wrapper check-in requeues. A waiter/new checkout can subsequently reconnect the unregistered adapter while replacement capacity is also allocated, violating the intended pool bound and lifecycle tracking. This is a source-derived reproduction, not an executed observation. Ordinary body errors whose rollback completes do not necessarily take Rails' eviction path; this finding specifically requires an incomplete transaction such as the commit failure above.

**Smallest safe repair:** explicitly discard on the Active Record error path and skip ordinary check-in for that path. Mark the adapter non-returnable before cleanup, remove/disconnect through the applicable pool ownership API, and tolerate Rails having already removed it. Only successfully retained, still-owned adapters should take normal check-in. Disconnecting a registered adapter for later reconnection can be legitimate; reinserting an evicted one is the defect.

**Deterministic regression:** fault-inject COMMIT failure in a real Rails transaction, assert the failed adapter is absent from both registration and availability, then perform another checkout/query. With competing checkouts, verify registered/physical connection limits and clean tenant context. Also exercise normal success, ordinary rollback, and cleanup failure so the repair neither leaks nor double-returns adapters. The current fake pool's check-in log does not model Rails eviction and cannot catch this issue.

## Retained analytical interleavings and design tradeoffs

These are local, source-grounded simulations, not executed benchmarks. **Obsidian was unavailable; no Obsidian simulation or connection is claimed.** Times below are illustrative monotonic seconds.

| Scenario | Interleaving and result |
| --- | --- |
| Repeated SQL | A native 0.25-second timer surrounds two 0.15-second statements. It accumulates elapsed transaction time instead of restarting for each statement; the second should be interrupted. This repairs the original mechanism, pending runtime verification. |
| Timer reset | An older positive timer is active. Writing zero disables it; the next positive assignment arms a fresh timer using the remaining budget. Without zero, changing a positive value does not rearm an already active timer. |
| Slow checkout/setup | Checkout/BEGIN/tenant setup consume 0.75 seconds of a one-second budget. Recomputed remaining time is approximately 0.25 seconds, so earlier consumption is not ignored. However connection establishment and setup themselves are not made interruptible by that calculation. |
| Slow configuration delivery | Remaining time is computed before sending the setting. Additional delivery/processing delay precedes server arming, so this is an approximation to the absolute request deadline. Later checks help but cannot retroactively eliminate that delay. |
| Idle Ruby serializer | Guards acquired at 0.10; Ruby work blocks until 60.10; database timer expires near 1.00. Database rollback may release locks promptly while the masked request thread continues waiting for almost another minute. |
| Slow COMMIT | COMMIT enters its critical phase just before the deadline; timer is disabled; durability work stalls. Request and guards may outlive the budget. A later successful commit must not be described as rolled back. |
| Lost acknowledgement | The server commits, but the client loses the reply. Report unknown/temporary failure and reconcile the operation ID; the original durable outcome, including a conflict record, remains authoritative. |
| Pool eviction | COMMIT raises ConnectionFailed; Rails removes adapter A; wrapper returns A to availability. A can be used outside registered capacity while adapter B fills replacement capacity. |

The timer-reset behavior comes from [PostgreSQL 17.6 assign_transaction_timeout](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/tcop/postgres.c#L3451). The same file's timeout handler raises a fatal transaction-timeout error, terminating the database session. That is stronger than a per-statement cancellation, but does not cancel application-side computation.

| Choice | Correctness and practical cost |
| --- | --- |
| Native transaction timer plus request checks | Keep: protects ordinary cumulative database/idle-transaction time without asynchronous Ruby interruption inside adapter bookkeeping. Does not alone bound every request phase. |
| Narrow interruptible/cooperative serialization | Preferred bounded repair for WD-01's avoidable Ruby gap. Requires ownership and rollback tests; never open an asynchronous-interruption window during unsafe adapter transitions. |
| Interrupt arbitrary SQL/COMMIT from Ruby | Reject as a blanket fix: risks uncertain adapter/transaction state and cannot prove whether commit happened. |
| Independently bounded response wait with isolated owner | Can preserve a bounded application response attempt under stalled database I/O, at the cost of more lifecycle/capacity management. Root-owned design decision; preserve ambiguity and reconciliation. |
| Discard uncertain adapter after Active Record failure | Conservative connection churn is preferable to returning an evicted or uncertain adapter; keep normal success/replay paths unchanged. |

## Test evidence, uncovered cases and checklist

- **Cumulative SQL / idle database transaction:** raw PostgreSQL tests cover the intended shapes and attempt session/generation lock reacquisition. They bypass `SessionWrites`, Rails transactions and the Rails pool. Their broad `PG::Error` assertions and absence of an elapsed upper bound/control run can accept unrelated connection failures; add SQLSTATE/termination-cause evidence where available and a disabled-timer control.
- **Bounded checkout:** the unit test verifies the remaining argument and post-checkout expiry. Rails applies the checkout timeout to waiting for availability; new connection establishment is a separate path. DNS, connect/TLS/authentication handshakes, socket I/O, scheduling and cleanup are not proven bounded by passing that argument. See [pinned pool acquisition](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb#L1083).
- **BEGIN/setup:** configuration and tenancy setup precede native timer arming and the protected guard call. This ordering avoids claiming that guards are protected by a timer that does not yet exist; it does not bound slow setup. The tenancy implementation itself is an unreviewed dependency.
- **Reset regression:** current mocks check remaining-budget values; add a real transaction with an already armed timer to prove the explicit zero reset and remaining-budget behavior together.
- **Cleanup/locks:** raw tests check session and actor generation release after backend failure. Actual-wrapper business rollback, additional target generation release, rollback failure, COMMIT failure, eviction and reuse remain uncovered in these assigned tests.
- **Inputs and authorization:** context/version types, CSRF, organization binding, metadata type, response type/size and bound SQL values have visible checks. Empty guard targets are supported. Guard lists larger than two are rejected after mapping; internal typed callers and controller boundary limits are unreviewed. No new bypass was identified in the reviewed wrapper; SQL permissions, UUID validator behavior and lock ordering implementation are outside scope.
- **Errors/state:** absence of a result after Rails-swallowed rollback is rejected. Success is checked again after transaction exit. Those checks cannot establish rollback after lost commit acknowledgement. Happy paths, explicit expiry, serialization failure and ordinary Active Record failure have local test coverage; the two findings above lack adequate regressions.
- **Design/maintainability:** narrow wrapper responsibilities and no new dependency/framework were identified. RBS declarations match the reviewed calls by inspection; typechecking is NOT_RUN. The broad interrupt-mask comment overstates what native database cancellation protects and needs revision with the repair. Formatting remains the linter's responsibility.
- **Scope boundaries:** `RequestDeadline`, `Tenancy`, serializer internals, fake test helpers, controllers, protected-write SQL and durable ledger code were treated only through documented interfaces. No claim of implementation or permission verification for those dependencies is made.

Pinned metadata inspected: Ruby 3.4.11, Rails/Active Record 8.1.4, pg 1.7.0 and timeout 0.6.1. Database documentation pins Supabase PostgreSQL 17.6.1.136, image digest `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`. PostgreSQL implementation analysis used upstream REL_17_6; this is not execution or attestation of every downstream image patch. Rails COMMIT disables automatic query retry in its [PostgreSQL transaction commands](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/postgresql/database_statements.rb#L52), consistent with preserving uncertain outcomes.

## Coordinator disposition

Both material findings were sent through Orca during review. Keep WD-01 open, add WD-R02, and retain **NOT_RUN** until root completes Docker acceptance. Root should choose the bounded repair, preserve protected-write and durable 409 replay semantics, update corresponding comments/docs, and add the deterministic regressions above before closure. This report does not request or authorize production activation.
