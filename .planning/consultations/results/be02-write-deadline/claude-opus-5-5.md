# claude-opus-5-5: independent design opinion

Requested and returned model: `claude-opus-5-5`. Session: `baa6b90f-3ad3-4fd0-85d9-3ea632cca872`. Process exit: **0**; structured result: **success**, non-error.

Common packet: `7df91a826548dac18c74a0d6d65e877ee1b223d1ba4da64ad2b827d56adf65d0`. Base revisions and disclosed excerpts/omissions are in [input-manifest.json](input-manifest.json); full execution metadata is in [metadata.json](metadata.json).

This is the model's substantive result, retained without editorial correction. It contains proposals that the [Astra synthesis](../../../../docs/completion/be02-write-deadline-decision.md) rejects or adapts; code sketches are not approved implementation. No runtime tests were performed by this opinion. Account data, raw runner JSON, prompts and process logs remain in ignored local storage.

---

# BE02-WRITE-DEADLINE: independent design opinion (Opus 5.5)

Status: this is a design opinion only. Every scenario below is **NOT_RUN**. I made no edits, ran nothing and claim no Obsidian execution. My focus prompt adds UX emphasis; I touch that only where it affects the contract.

## Verdict

**Change, as a prerequisite blocker. Make a bounded local repair and amend D05's wording.**

- Keep the native `transaction_timeout`, the reset-to-zero rearm, the session → sorted guards → business lock order, and the terminal-409 commit path.
- Replace the blanket mask with three things:
  1. A narrow **ownership mask** that covers only checkout/assignment and dispose/checkin.
  2. **Cooperative checkpoints** at the single SQL seam each domain service already uses.
  3. A **dispose-or-checkin state machine** that never requeues an adapter Rails has evicted.
- Move the guard re-entry rejection ahead of generation acquisition, and split the dimension check.

An absolute 10-second server or response guarantee cannot be met safely. COMMIT's critical section and connection establishment are both uninterruptible. D05 must say so explicitly instead of being silently relabelled.

## Allowed paths (minimal)

**Source**
- `apps/server/lib/elevateo/session_writes.rb`: lifecycle rewrite of about 40 lines.
- `apps/server/lib/elevateo/drafts/database.rb` (`rows`) and `apps/server/lib/elevateo/thread_collaboration.rb` (`rows`): one `deadline.check!` before each statement. The deadline is passed through the constructor, or read from a thread-local set by SessionWrites. I prefer the constructor; it already receives `connection:`.
- A new migration, e.g. `db/migrate/2026101300000N_repair_protected_write_guard.rb`, that runs `CREATE OR REPLACE FUNCTION app_auth.begin_protected_write`.
  - `db/be02_writes/guard.sql` is updated to the same text so fresh installs match.
  - Do not edit an applied migration in place if any disposable DB already ran it. If none has, editing `guard.sql` alone is acceptable; record which choice was made.

**RBS**
- `sig/session_writes.rbs`: new private `dispose`/`release` signatures.
- `sig/rails_seams.rbs`: add `ConnectionPool#remove: (AbstractAdapter) -> void` and `#connections: () -> Array[AbstractAdapter]`, plus `AbstractAdapter#throw_away!` only if used.
- Constructor signatures for the two `rows` seams.

**Tests**
- `test/be_02/write_boundary_deadline_test.rb`: fake-level orchestration; this supplements but does not prove.
- New `test/be_02/write_boundary_pool_test.rb`: real Rails 8.1.4 `ConnectionPool` with size 1 against pinned PG and the actual `elevateo_api` login.
- `test/be_02/write_boundary_database_deadline_test.rb`: SQLSTATE-specific assertions, plus a timer-disabled control.
- `test/be_02/write_boundary_database_test.rb`: re-entry and dimensionality cases.

**Docs**
- D05 amendment in `.planning/consultations/results/be-02/decisions.md` (as a new dated subsection, not a rewrite).
- Contract §2 line 33 in `docs/completion/be02-cd-contract.md`.
- AIDEV notes at `session_writes.rb:12,14,69`.
- WD-01, WD-R02, WG-01 and WG-02 disposition in `code-reviews.md` after the independent re-review, not before.

**No new** worker subsystem, cancellation framework, ledger table or dependency.

## Lifecycle

```ruby
def transaction(...)
  conn = nil; state = :none                       # :none | :leased | :released | :disposed
  Thread.handle_interrupt(RequestDeadline::Expired => :never) do
    pool.active_connection?&.transaction_open? and raise ContextError
    conn = pool.checkout(deadline.remaining); state = :leased   # atomic w.r.t. Expired
  end
  begin
    outcome = run(conn, ...)    # Expired NOT masked here; see challenge 1
  rescue Exception => e
    failed = e
    raise
  ensure
    Thread.handle_interrupt(Object => :never) { release(pool, conn, state, failed) }
  end
  map_errors(outcome)           # rescue mapping unchanged; pending Expired lands here
end

def release(pool, conn, state, failed)
  return unless state == :leased
  reusable = failed.nil? || verified_rollback?(failed, conn)
  if reusable && pool.connections.include?(conn) && !conn.transaction_open?
    pool.checkin(conn)                             # sole checkin path
  else
    begin
      pool.remove(conn) if pool.connections.include?(conn)   # remove BEFORE disconnect
    ensure
      begin
        conn.disconnect!
      rescue StandardError
        nil
      end                                         # cleanup failure cannot requeue
    end
  end
end
```

`verified_rollback?` is true only for application errors (`CollaborationError`, `ReadResponse::*`, `WriteInput` invalid) raised while Rails completed its ROLLBACK normally. Any `ActiveRecordError`, `RequestDeadline::Expired`, `Tenancy::ContextError` (ownership lost) or other non-StandardError means dispose.

| State | Event | Next | Pool invariant |
|---|---|---|---|
| none | checkout raises (`ConnectionTimeoutError`; `checkout_and_verify` already removes on `clean!` failure) | none | Nothing leased; nothing to return |
| leased | success or terminal-409 commit | released (checkin) | `available ⊆ connections`, `|connections| ≤ 1` |
| leased | application error, completed ROLLBACK | released | same |
| leased | AR error / 25P04 / ConnectionFailed on COMMIT; Rails already `throw_away!` | disposed (remove is a no-op, disconnect idempotent) | adapter in neither set |
| leased | Expired between statements | disposed (conservative) | same |
| leased | disconnect raises | disposed | removed first, so still absent |
| any | Expired during release | deferred by `Object => :never` | n/a |

Idempotency is guaranteed by the `state` guard. `remove` tolerates an absent adapter, and `disconnect!` on a disconnected adapter is a no-op.

## Challenge rows

### 1. Blocked Ruby work

There are three options.

- **(a) Blanket deferral (current): reject.** A blocked serializer holds the thread and adapter without bound.
- **(b) No async cancellation, cooperative checkpoints only: adapt as the base.** The checkpoints are:
  - before every `exec_query` in the two `rows` seams;
  - before `response.verify!`;
  - before commit (already present at line 51).

  A check placed *after* an unbounded callback is not a bound. What actually bounds this work is the data limits:
  - draft input ≤ 1 MiB, parsed with `max_nesting 16`;
  - response ≤ 4096 bytes (8192 for collaboration inputs);
  - guards ≤ 3 tuples;
  - recipients ≤ 100.

  These make the pure-memory work between checkpoints O(input) with small constants. That is a CPU bound, not a wall-clock proof under GC or scheduler stalls.
- **(c) Narrowly interruptible pure-memory window: accept, as in the sketch.** `run` executes with Expired unmasked, which is safe only for this reason: in pg 1.7, an async exception that interrupts `exec_query` mid-protocol is caught by Rails' `rescue Exception` in `with_raw_connection`. That marks the adapter unverified, and `release` then disposes it because `failed` is Expired. The adapter is never reused. ROLLBACK may be attempted by `within_new_transaction`; if that fails, Rails `throw_away!`s, and the fact that `release` checks `pool.connections.include?` makes this harmless.

  The cost is that an interrupted statement's server-side work is ended by the disconnect or by `transaction_timeout`, not by Ruby. This is *not* "async delivery into arbitrary SQL called safe." Safety here comes only from the unconditional disposal, not from delivery timing.

  **Exception:** `commit_transaction` must not be interrupted. A Ruby interrupt during COMMIT produces the same unknown outcome as a lost reply. To avoid stacking ambiguity, wrap the final commit call in `handle_interrupt(Expired => :never)`. That needs a seam inside the Tenancy `connection.transaction` block's return path. The minimal approach is to mask around the `connection.transaction` exit, i.e. pass a flag to `Tenancy.with_context`.

  If reviewers find that seam too invasive, fall back to (b) alone and document the residual bound. **Dissent noted:** (b)-only is simpler and may be sufficient given the byte caps.

### 2. Native libpq wait

- `transaction_timeout` is reset to 0, then set to the remaining budget. It is cumulative across statements and idle time, and it fires FATAL `25P04`, which terminates the backend.
- Expect pg to surface either `PG::ConnectionBad`/`PG::UnableToSend` with the 25P04 message, or a translated `ActiveRecord::ConnectionFailed`. The test must assert the **SQLSTATE `25P04`** where the result is available, otherwise backend absence in `pg_stat_activity` with the timer enabled versus present in the disabled control. Never assert a broad `PG::Error`.
- Unwind order: Rails invalidates the transaction → `throw_away!` (remove + disconnect) → Tenancy ensure clears the marker and query cache → `release` (no-op remove, disconnect) → error mapped to 503.
- No other thread ever touches the PG connection. `PG::Connection#cancel` from a timer thread is only a request: it races with the next statement and may cancel the wrong one. Reject it. Concurrent `disconnect!` from another thread violates adapter thread-safety (pool.rb 504–506). Reject that too.
- Removing and disposing the lease on the owning thread after the unwind is the only allowed action.

### 3. COMMIT reply lost or ConnectionFailed during COMMIT

- `commit_transaction` pops the stack before `transaction.commit`. Rails' ensure then calls `throw_away!`.
- The outcome is **unknown**. Respond `503 temporarily_unavailable`, `Retry-After: 1`.
- Never say "rolled back." Never retry the transaction. Never mint a new `operation_id`.
- For drafts, the client keeps the exact `operation_id` and immutable payload and calls `GET /v1/draft-operations/{id}`. `unknown`/`expired` is not evidence of non-commit; an identical replay returns the original applied or conflict outcome via the ledger.
- Read-state, assignment and membership have no ledger. Read-state is desired-state idempotent, so re-PUT is safe. Assignment and membership must re-read their version and present a manual reconciliation step; the 409 version mechanism prevents a blind double change. Notes have caller-generated IDs, so a replay returns 200 if the note was created.
- Guards may persist until PostgreSQL actually finishes COMMIT, which is outside the request bound.

**UX:** the composer shows "Save status unknown — checking…" and keeps the buffer. It does not show an error toast that invites retyping.

### 4. Ownership

Covered by the state table above. The real-pool proof, after every scenario, is:

- `pool.connections.size <= 1`
- `pool.stat[:size] == 1`
- no adapter appears in `@available` that is absent from `connections` (observed through `pool.stat`, `checkout(0.1)` identity and `pool.connections`)
- `SELECT count(*) FROM pg_stat_activity WHERE usename='elevateo_api' AND application_name=$tag` ≤ 1

### 5. Isolation for the next request

- GUCs are `set_config(..., true)` (transaction-local) and vanish at transaction end.
- The marker is bound to `pg_current_xact_id()`.
- The query cache is cleared in the Tenancy ensure.
- A disposed adapter is never handed out again.
- Pending Expired: the Timeout 0.6.1 request is cancelled when `within` exits. Assert `Thread.pending_interrupt?` is false at the start of the next request on the same thread.
- **Never** use `transaction_open?` as commit evidence. It only gates reuse.

### 6. Regression evidence

Covered in "Required exact evidence" below.

## guard.sql repair

**WG-01.** Insert after line 25, before line 26:

```sql
IF s.write_transaction = pg_current_xact_id() THEN
  RAISE EXCEPTION 'protected write already entered' USING ERRCODE = '25001';
END IF;
```

Delete lines 46–48.

Precedence impact: for single-entry requests nothing changes, because the predicate is false. For re-entry, 25001 now precedes the post-lock status and claim checks. This is acceptable and should be documented: the same xid already passed those checks, and both outcomes fail closed with no grant. The `FOR UPDATE` on the session row is a self-held lock in T1, so it does not wait.

**WG-02.** Replace lines 14–17 with two statements:

```sql
IF p_targets IS NULL OR cardinality(p_targets) > 2
   OR (cardinality(p_targets) > 0 AND array_ndims(p_targets) <> 1) THEN
  RAISE EXCEPTION 'invalid protected write targets' USING ERRCODE = '22023';
END IF;
IF array_position(p_targets, NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid protected write targets' USING ERRCODE = '22023';
END IF;
```

## D05 wording change (required)

Replace "bound the entire server request … by the canonical 10-second deadline" with:

> The request carries one monotonic 10-second budget. No SQL statement starts, no transaction commits and no response is rendered after the budget expires. Database work is natively bounded by `transaction_timeout` set to the remaining budget, and pure-memory phases are interruptible or check cooperatively under bounded input sizes. Excluded from the bound, and disclosed as such:
> - connection establishment (DNS, connect, TLS, auth);
> - PostgreSQL's COMMIT critical section;
> - adapter disposal;
> - scheduler and GC stalls.
>
> If expiry or connection loss can overlap COMMIT, the outcome is reported as unknown (503) and reconciled; it is never reported as rolled back.

Contract line 33 should mirror this.

## Analytical interleavings (NOT_RUN)

**I1: Blocked serializer.** Deadline D = t0+1s.
- Guards are acquired at 0.10. The serializer blocks on a gate in an unmasked region.
- At 1.00 the Timeout thread raises Expired into the request thread; the server's `transaction_timeout` fires about then too.
- Expired unwinds: Rails ROLLBACK fails on the dead backend → `throw_away!` → Tenancy ensure → `release` disposes.
- The response is 503. `|connections| = 0`; the next checkout creates one fresh adapter.
- The gate is released in teardown, and the business row is absent.
- Under the current code, the thread would instead wait until the gate opened.

**I2: ConnectionFailed on COMMIT** (fault injected at `commit_db_transaction`).
- Rails pops the stack, invalidates, and `throw_away!` removes adapter A.
- `release`: `failed` is ConnectionFailed and A ∉ connections, so it skips remove, disconnects (no-op) and does not check in.
- A waiter checks out B, so `|connections| = 1` and A is not in available.
- The client receives 503. A lookup with the same `operation_id` returns `applied` if the injection was placed *after* the server COMMIT, or `unknown` if it was placed before. Both cases must be tested.

**I3: WG-01 deadlock, after the fix.** Guards B < A; sessions S1 and S2 belong to actor A.
- T1 enters via S1 with no targets and holds generation A.
- T2 enters via S2 with target B, locks B, and waits on A (confirmed by `wait_event_type='Lock'` in `pg_stat_activity` and `pg_locks` showing T2 waiting on T1's xid).
- T1 re-enters via S1 with target B. It re-locks the S1 session row (self-owned), then the marker equals its xid, so it raises 25001 immediately, before touching B. The test asserts the SQLSTATE and that `pg_locks` shows no T1 request on B.
- T1 rolls back; T2 acquires A and returns `ok`.
- Identical-target re-entry raises the same 25001.

**I4: Expired during checkin.** The ensure runs inside `Object => :never`. Checkin completes, the pending Expired is delivered in `transaction`'s caller frame and mapped to 503. `|available| = 1`, and the next request sees no pending interrupt.

## Required exact evidence

All in authorized Docker against the pinned digest image, through real Rails 8.1.4 `ConnectionPool` (size 1, checkout_timeout set) with the actual restricted `elevateo_api` login.

Synchronization uses `Queue` gates and `pg_stat_activity`/`pg_locks` polling as barriers. Sleep never serves as proof; a watchdog is only a harness guard.

1. **Serializer blocked past deadline:** bounded failure, no success body, row absent, and pool invariants hold.
2. **Cumulative timer:** two statements exceed the budget → SQLSTATE `25P04` or backend gone. With the timer disabled as a control, the same statements succeed.
3. **Reset rearm:** pre-arm 5s, then reset and arm 200ms; it fires near the 200ms mark, observed via the barrier rather than measured wall time.
4. **COMMIT ConnectionFailed:** injected at the actual adapter `commit_db_transaction` seam, once before and once after a real server COMMIT. Assert eviction, no requeue, ledger outcome, and that a subsequent different user/org request sees empty `current_setting('app.user_id', true)`, no open transaction, a cleared query cache and `Thread.pending_interrupt? == false`.
   - This is portable fault injection, not proof of physical lost-WAL or lost-reply timing. That remains disclosed residual risk.
5. Normal success; terminal 409 committed and visible to the ledger lookup; application-error rollback with checkin; disconnect raising during cleanup; Expired injected during checkin.
6. WG-01 as in I3, plus identical-target re-entry. WG-02 with 1- and 2-element 2-D arrays, NULL array, NULL element, empty, two valid targets and three targets, each asserting `22023` exactly.
7. Steep typecheck, RuboCop and the existing suite run in Docker, with results recorded verbatim.

## Remaining dissent and uncertainty

- Unmasking `run` relies on Rails' `with_raw_connection` handling plus unconditional disposal. If reviewers doubt pg 1.7's behaviour under an async interrupt mid-`PQgetResult`, fall back to cooperative-only (b). The disclosed bound then becomes "between checkpoints."
- The commit-exit mask needs a small Tenancy seam. It is the most invasive part of this proposal.
- Whether pg reports 25P04 with a SQLSTATE or only as connection loss on this vendor image is unverified.
- Nothing here bounds connect/TLS time; D05 must disclose that, not hide it.
