# claude-fable-5: independent design opinion

Requested and returned model: `claude-fable-5`. Session: `37f2278e-cfe4-4ec1-a8f6-761825bc95f2`. Process exit: **0**; structured result: **success**, non-error.

Common packet: `7df91a826548dac18c74a0d6d65e877ee1b223d1ba4da64ad2b827d56adf65d0`. Base revisions and disclosed excerpts/omissions are in [input-manifest.json](input-manifest.json); full execution metadata is in [metadata.json](metadata.json).

This is the model's substantive result, retained without editorial correction. It contains proposals that the [Astra synthesis](../../../../docs/completion/be02-write-deadline-decision.md) rejects or adapts; code sketches are not approved implementation. No runtime tests were performed by this opinion. Account data, raw runner JSON, prompts and process logs remain in ignored local storage.

---

# BE02-WRITE-DEADLINE — independent Fable 5 opinion

**Verdict: change (repair), with a required wording amendment to BE02-D05.** The reviewer's findings are correct: the blanket `Thread.handle_interrupt(Expired => :never)` converts the 10-second budget into "10 seconds unless Ruby is busy," and the unconditional `pool.checkin` in `with_write_connection` (session_writes.rb:72–74) can re-enqueue an adapter Rails has already evicted via `throw_away!`. Both are fixable with small, local changes that keep one Rails write authority, the SessionWrites/Tenancy ownership model, the lock order, and the terminal-409 commit semantics. The absolute "entire request within 10 seconds" reading of D05 cannot be fulfilled safely and must be restated as a cooperative bound with three named non-interruptible residues.

## Minimal allowed change surface

- `apps/server/lib/elevateo/session_writes.rb` — restructure cleanup ownership; narrow the interrupt mask; add cooperative checkpoints.
- `apps/server/sig/session_writes.rbs`, `apps/server/sig/rails_seams.rbs` — add `ConnectionPool#remove` and `#connections` declarations with an AIDEV note that `remove` on an already-evicted adapter is a safe no-op.
- `apps/server/db/be02_writes/guard.sql` — WG-01 re-entry reorder and WG-02 dimension-safe validation split only.
- `apps/server/test/be_02/write_boundary_deadline_test.rb`, `write_boundary_database_deadline_test.rb`, `write_boundary_database_test.rb` (+ its helper) — regressions below; one new file `write_boundary_pool_recovery_test.rb` for the real-Rails-pool cases.
- `docs/completion/be02-cd-contract.md` §2 deadline sentence and (coordinator-owned) D05 wording amendment.

No controller, Tenancy, ledger, or contract-schema changes. No new dependency, worker subsystem, or cancellation framework.

## Lifecycle state table for the connection

| State | Entered by | Exits |
| --- | --- | --- |
| UNOWNED | before `pool.checkout(deadline.remaining)` | checkout success → OWNED_REGISTERED; checkout raise → nothing to clean (assert no adapter leaked) |
| OWNED_REGISTERED | successful checkout | success → `pool.checkin` → POOLED; ActiveRecord error → DISCARD path; Rails `throw_away!` already ran → EVICTED |
| DISCARD path | our rescue | `pool.remove(connection)` (idempotent: deleting an absent adapter is a no-op in Rails 8.1.4 `remove`, which also wakes waiters via `bulk_make_new_connections`), then `connection.disconnect!` in its own begin/ensure; a secondary failure during cleanup is logged and suppressed, the original error re-raised; **never** `checkin` on this path |
| EVICTED | Rails `within_new_transaction` ensure after incomplete commit | our `remove` is a no-op; we still `disconnect!` defensively; never checkin |
| POOLED | checkin of a successfully committed, still-registered adapter only | normal reuse |

Pseudocode for the repaired wrapper:

```ruby
def with_write_connection(deadline)
  connection = pool.checkout(deadline.remaining)
  owned = true
  begin
    deadline.check!
    yield(connection)
  rescue ActiveRecord::ActiveRecordError, PG::Error
    owned = false
    begin pool.remove(connection) ensure safe_disconnect(connection) end
    raise
  ensure
    pool.checkin(connection) if owned   # success path only
  end
end
```

This fixes WD-R02 exactly: the invariant is *an adapter is either registered-and-available, registered-and-leased, or fully removed-and-disconnected; never available-but-unregistered*. A size-1 pool regression with real Rails proves it (below).

## Challenge rows

**1. Blocked Ruby work under a live deadline.** Reject both extremes: keeping the blanket `:never` mask (current defect) and wrapping the whole transaction in asynchronous Timeout (can interrupt rollback, commit accounting, or checkin, which is exactly why the mask exists). The correct observation is that this codebase has **no unbounded Ruby phase**: request bodies are ≤1 MiB, response budgets ≤2 MiB, `ReadResponse.page` already iterates per-item, and `WriteResponse.verify!` operates on ≤4 KiB. So cooperative checkpoints are sufficient and honest. Concretely: keep the `:never` mask only around checkout/checkin/remove and the `connection.transaction` entry/exit bookkeeping; inside the transaction, insert `deadline.check!` at the existing seams (already present at lines 47, 51, and in `acquire`) plus one per-item check in any loop that serializes list pages. Checks *after* a callback are not a bound for the callback itself — so additionally require (as a tested convention, enforced by the regression) that no yielded operation performs unbounded I/O or iteration without a deadline parameter; the block signature already receives none, and `WriteController` passes `deadline:` to the yielded handler, so handlers can and must check it. I considered a narrowly scoped `handle_interrupt(Expired => :immediate)` region around the pure-memory serialization phase: adapt-with-caution only if a later profile shows a single chunk can stall; it would require proving the region touches no adapter state and that a raised `Expired` still reaches the rollback path. For now, **reject async cancellation entirely** and accept the honest residue: the request can overrun by at most one bounded chunk's duration. That residue is what forces the D05 wording change.

**2. Native libpq SQL wait.** Accept the current `acquire` design: reset `transaction_timeout` to 0 then assign the remaining budget (positive-to-positive does not rearm, per `assign_transaction_timeout` in REL_17_6 postgres.c:3685–3695), with tighter statement/lock timeouts inside it. The native timer is cumulative across statements and across idle-in-transaction time, and on expiry raises FATAL `25P04`, terminating the backend — tests must assert that exact SQLSTATE (errcodes.txt:255), not broad `PG::Error`. The unwind is synchronous: the blocked `exec_query` returns a connection error, translated to `ActiveRecord::ConnectionFailed`-family, which unwinds through `connection.transaction` (rollback attempt fails harmlessly against a dead backend) into our DISCARD path. No pending Ruby async exception is involved, and critically **no second thread ever touches the PG connection** — reject any design that calls `cancel` or `disconnect!` from a watchdog thread while the request thread may be mid-`exec`; libpq connections are not safe for concurrent operations. SQL cancel is only a request and the backend may ignore it; adapter disconnect from the owning thread after the error is the only safe disposal. Reject any generic cancellation framework.

**3. COMMIT reply lost / ConnectionFailed during COMMIT.** Rails' `within_new_transaction` rescues `ConnectionFailed` at commit, invalidates the transaction, and its ensure calls `throw_away!` (transaction.rb:661–675, abstract_adapter.rb:794–797) — the stack is popped, the adapter evicted. The commit **may be durable**: PostgreSQL's `CommitTransaction` holds interrupts and disables the transaction timer before `RecordTransactionCommit` (xact.c:2292–2315), so neither timer nor cancel proves rollback, and the guard marker/business rows may have persisted until the server finished. Required caller behavior: map to 503 `temporarily_unavailable` (the existing rescue already does), **preserve the exact original operation_id and immutable payload**, and reconcile via `GET /v1/draft-operations/{id}` — where `unknown` means "no visible record at snapshot time," never non-commit, per D07. For writes without a ledger (read-state, assignment, notes, membership), the only honest options are re-read of current state plus the designed idempotency (same-desired-value no-ops, note-id replay, version conflicts on a stale retry); state in docs that re-read cannot distinguish "my write committed" from "someone else's identical write," and manual reconciliation inherits that limit. Never blanket-claim rollback; never blind-retry with a new operation identity; never widen other operations with a speculative ledger schema.

**4. Cleanup matrix.** Covered by the state table. Ordinary business exception with completed rollback does *not* take Rails' eviction path (transaction completes as rolled back); but distinguishing "rollback verified" from "rollback attempted against uncertain backend" from Ruby is fragile, so I **accept conservative discard for the whole `ActiveRecordError` class** on the write path — connection churn on a rare error path is cheaper than one shared-state defect, and read paths are untouched. Normal success and terminal-409 both take the checkin path (409 is a committed `WriteResponse`, not an exception — preserve that). An async exception arriving during checkin/disposal is masked by the retained narrow `:never` region around those calls specifically.

**5. Cross-request isolation.** Discard yields a fresh physical connection, so no GUC claims (`app.user_id`/`app.org_id` are transaction-local anyway), no marker (xid-bound: `write_transaction = pg_current_xact_id()` can never match a new transaction), no query cache (Tenancy clears it, and a new adapter has none). A deferred `Expired` pending on the thread is converted by `RequestDeadline#within`'s rescue into `AuthError` at the request boundary; add a regression that a request following a deferred-expiry request starts with no pending interrupt and a size-correct pool. Never infer commit outcome from `transaction_open?` — after backend FATAL it reflects client-side bookkeeping, not server truth.

**6. Test discipline.** Real Rails 8.1.4 `ConnectionPool` (size 1) against the pinned Supabase PG 17.6.1.136 image with the actual restricted `elevateo_api`/`elevateo_worker` logins; `Queue` barriers and `pg_stat_activity` wait-event polling (the helper's `wait_for_lock`) as synchronization, never bare sleeps as proof; assert `25P04`, `55P03`, `25001`, `22023` specifically. Fault injection at the adapter seam (stub the raw commit to raise `ConnectionFailed` after the server has, or has not, been allowed to commit — controllable by killing the backend from the admin connection at a barrier) is portable and sufficient for the pool-hygiene and uncertainty-handling invariants; it is **not** proof of physical lost-WAL/reply timing against the vendor binary, which stays an acknowledged limit. Fakes (the existing harness) supplement orchestration coverage only.

## Guard SQL (coordinator-requested)

**WG-01:** move `IF s.write_transaction = pg_current_xact_id() THEN RAISE ... 25001` to immediately after the first `session_status` check and the `organization_id` null check (guard.sql:25), **before** the FOREACH insert/lock loop. Precedence is preserved: input validation (22023), isolation (25001 read-committed), session lock + status, *then* re-entry, then guards. Regression exactly as specified: two real API connections, preexisting guards B<A, same actor via two sessions; T1 enters holding A; T2 enters with target B, acquires B, blocks on A (confirmed via wait-event); T1 re-enters targeting B → immediate 25001 without touching B; T1 ROLLBACK → T2 completes; plus identical-target re-entry → 25001.

**WG-02:** split validation into two statements: first a dimension-safe check (`p_targets IS NULL OR cardinality(p_targets) > 2 OR (cardinality(p_targets) > 0 AND array_ndims(p_targets) <> 1)`) raising 22023, then a second check `array_position(p_targets, NULL) IS NOT NULL` raising the same 22023. Reordering within one OR is insufficient because PostgreSQL does not guarantee operand order. Regression uses parameterized SQL array literals (`ARRAY[[...]]::uuid[]`) directly, since the Ruby `targets.join` serializer cannot express them; cover NULL array, NULL element, empty, 2D one/two-element, three targets. No wider domain change.

## D05 wording amendment (required)

Replace "Bound the entire server request, including Auth and serialization, by the canonical 10-second deadline" with: *"Enforce the canonical 10-second cumulative budget cooperatively at every application checkpoint and natively via a cumulative PostgreSQL transaction timer armed from the remaining budget. A request may exceed the budget only within a single bounded non-interruptible step: one bounded serialization/validation chunk, PostgreSQL's commit critical section, or a network/connection-establishment stall — after which the outcome is reported as failed or unknown, never as a late success, and no payload is streamed after expiry."* Do not silently relabel the current behavior as strict wall-time compliance.

## Analytical interleavings (all NOT_RUN)

1. **Deferred-expiry serializer (current defect).** Budget 1.0s; guards acquired t=0.10; native timer 0.90s; business block enters a Ruby gate at t=0.15 and blocks until t=60. DB backend FATALs at t≈1.0, releasing locks. Current code: request thread holds the lease until t=60 (mask defers everything, next SQL at t=60 errors). Repaired code: the gate sits inside the handler, which receives `deadline:`; the first cooperative check after the gate opens fails — residue equals one chunk duration, which the repaired contract names. A truly checkpoint-free 60-second pure-Ruby loop would still overrun; that is the documented residue and the reason handlers must thread the deadline.
2. **COMMIT lost after durable commit.** t=0.95 COMMIT sent; server enters HOLD_INTERRUPTS, disables timer, records commit at t=1.3; reply lost at t=1.1 (connection reset). Rails raises ConnectionFailed, invalidates, `throw_away!`. Repaired wrapper: `remove` no-op, disconnect, no checkin; 503 + original operation_id; later ledger lookup returns `applied`. Current code would additionally checkin the evicted adapter → interleaving 3.
3. **Phantom adapter, pool size 1.** After interleaving 2 under current code: adapter X is unregistered but in `@available`; waiter W1 polls X (checkout verifies/reconnects it) while `remove`'s waiter-wakeup also spawned registered adapter Y → two live physical connections against a size-1 bound, X carrying stale lifecycle state outside pool accounting. Repaired code: X fully discarded; W1 gets Y only.
4. **WG-01 deadlock.** Guards B<A exist. T1 enters (locks A). T2 enters targeting B: locks B, waits on A. T1 re-enters targeting B: current code reaches the FOREACH, waits on B → cycle; PG kills a victim (likely innocent T2) or lock_timeout fires 55P03. Reordered code: T1's second call raises 25001 before touching B; T1 rolls back; T2 acquires A and completes.

## Required evidence before closure

Docker runs on the pinned image with real roles: (a) 25P04 cumulative-timer tests (existing two, plus the zero-reset-rearm case with a previously armed timer and a disabled-timer control run with an elapsed upper bound); (b) size-1 real-pool COMMIT fault injection proving registered/available invariants and clean subsequent checkout+tenant context; (c) deferred-serializer barrier test proving bounded failure, rollback of the test mutation, and no success payload (gate released in teardown); (d) both WG regressions with exact SQLSTATEs; (e) lost-ack test preserving operation_id and ledger `applied`/`unknown` semantics; (f) follow-on request isolation (no pending interrupt, no GUC/marker/cache residue). RBS typecheck and lint pass; NOT_RUN until root Docker acceptance.

## Dissent and residual uncertainty

I am less convinced than the prior reviewer that an "independently bounded response wait with an isolated owner" is worth designing even later: for a 10-user pilot it adds lifecycle complexity to shave the rare commit-stall residue, and the ledger already makes that residue safe. Remaining uncertainty: whether the vendor PG image matches upstream REL_17_6 timer/commit behavior (only the pinned-image tests resolve it); whether every C/D handler actually threads `deadline` into its loops (needs a grep-level audit plus the barrier regression per route family); and whether `pool.remove` on an evicted adapter remains a no-op across future Rails patches — pin the behavior with a test, not a comment.
