# claude-fable-5-1: independent design opinion

Requested and returned model: `claude-fable-5-1`. Session: `8e3d2d90-b597-44cd-acb5-0b0a383cd419`. Process exit: **0**; structured result: **success**, non-error.

Common packet: `7df91a826548dac18c74a0d6d65e877ee1b223d1ba4da64ad2b827d56adf65d0`. Base revisions and disclosed excerpts/omissions are in [input-manifest.json](input-manifest.json); full execution metadata is in [metadata.json](metadata.json).

This is the model's substantive result, retained without editorial correction. It contains proposals that the [Astra synthesis](../../../../docs/completion/be02-write-deadline-decision.md) rejects or adapts; code sketches are not approved implementation. No runtime tests were performed by this opinion. Account data, raw runner JSON, prompts and process logs remain in ignored local storage.

---

Delivering one fresh Fable 5.1 design opinion from the packet alone: no tools, edits, runs or external calls, and every runtime claim below is NOT_RUN.

**Verdict: change, with three prerequisite blockers.** The native PostgreSQL transaction timer is the correct core and should stay. Before implementation can close: the unconditional pool check-in must become a conditional retain-or-discard; the guard.sql re-entry and dimension checks must be reordered; and the D05 sentence promising to bound "the entire server request" must be reworded, because no safe Ruby mechanism delivers an absolute wall-time response. The blanket interrupt mask should remain around connection ownership. Cooperative checkpoints on contract-bounded data, not a narrow asynchronous window, are the honest Ruby-side bound for this slice.

## Minimal allowed paths and the ownership lifecycle

Source: `apps/server/lib/elevateo/session_writes.rb` (the ownership method, the line-14 comment and the ActiveRecordError rescue). Signatures: `apps/server/sig/session_writes.rbs` plus two additions in `apps/server/sig/rails_seams.rbs` for the pool methods actually called. SQL: `apps/server/db/be02_writes/guard.sql`. Optional plumb: `apps/server/lib/elevateo/drafts/database.rb` and its two packet callers. Tests: the existing unit deadline test and its fake pool helper, the raw database deadline test, the guard database test, and one new real-pool lifecycle test. Docs: contract section 2 in `docs/completion/be02-cd-contract.md`, a dated amendment appended under D05 rather than rewriting the accepted record, plus code-reviews, README, state and documentation checkpoint lines as the project instructions require. If guard.sql has already been applied by a recorded migration in any retained database, ship the SQL change as a new CREATE OR REPLACE file instead of editing in place.

Proposed ownership method, keeping the existing mask around it:

```ruby
def with_write_connection(deadline)
  pool = ActiveRecord::Base.connection_pool
  raise Tenancy::ContextError, "..." if pool.active_connection?&.transaction_open?
  connection = pool.checkout(deadline.remaining)   # raises before any lease on timeout
  retained = true
  begin
    deadline.check!
    yield(connection)
  rescue ActiveRecord::ActiveRecordError, Tenancy::ContextError
    retained = false
    raise
  ensure
    if retained && pool.connections.include?(connection)
      pool.checkin(connection)
    else
      discard(pool, connection)
    end
  end
end

def discard(pool, connection)
  pool.remove(connection)        # no-op when Rails already evicted it
ensure
  begin
    connection.disconnect!       # tolerate an already-closed raw connection
  rescue StandardError => error
    Rails.logger.error("write adapter disposal failed: #{error.class}")
  end
end
```

| State | Entered by | Invariant | Exit |
| --- | --- | --- | --- |
| Unleased | before checkout, or checkout raised | nothing to clean | none |
| Leased | checkout returned | adapter in registered set, leased to this thread | ownership block |
| Owned transaction | Tenancy BEGIN, claims, timers armed, guard ok | one physical session, read committed | business yield |
| Committing | Rails popped its stack, COMMIT sent | transaction_open? already false | retained or discarded |
| Retained | normal commit, or completed rollback after a business, auth or budget error | still registered | checkin |
| Discarded | any Active Record error, Tenancy ownership loss, or Rails eviction | not registered, not available, raw socket closed | request fails |

Discard is idempotent because the pool's remove deletes from both registered and available arrays without checking presence, and a second disconnect on the PostgreSQL adapter should be a no-op once the raw connection is nil. That second claim is from memory of the adapter, not from the packet, and the lifecycle test must prove it.

## Challenge rows

**Row 1, blocked Ruby under a live deadline.** The reviewer's reproduction blocks the business block on a test gate. No production code path in this slice contains an unbounded callback: between the two existing checkpoints, the yield performs SQL round trips bounded by the native timers, and pure-memory work on data already bounded at the boundary. Inputs are capped at the request maximum before the transaction opens. Outputs are capped at the route budget. Therefore the honest statement is "CPU-bound Ruby time is bounded by data limits; I/O time is bounded by native timers; scheduler starvation and the garbage collector are not bounded." A narrow interruptible region around pure-memory phases was compared and rejected for this slice: the services interleave SQL and Ruby at statement granularity, so every adapter call inside the region would need its own re-mask, which is the generic cancellation framework the task forbids. The pending Expired delivered at mask exit is harmless because the ensure that returns or discards the adapter runs inside the mask. Keep blanket deferral, keep synchronous checks, and add one cheap checkpoint before each SQL round trip in the draft database adapter by passing the deadline the controller already yields. Make that keyword optional on the collaboration base class so unseen subclasses keep compiling, and record which services opt in.

**Row 2, native libpq waits.** The transaction timer accumulates across statements and idle time because it is armed once at reset-then-assign and only disabled in the commit critical section. Its firing cause is SQLSTATE 25P04 as a FATAL termination, so the regression must read the SQLSTATE diagnostic field from the PG result and must not depend on a generated exception class name. After termination the socket closes; the next adapter call raises a lost-connection error that Rails translates to ConnectionFailed. Unwind order with the mask in place: the raising statement unwinds Rails' transaction manager, which attempts ROLLBACK, which fails, which triggers throw_away, then Tenancy re-raises, then the wrapper discards. No second thread ever touches the connection: SQL cancel is only a request and gives no ownership proof; adapter disconnect from another thread races libpq; disposing the lease from the owning thread after the error is the only safe operation. The only remaining uncovered waits are physical connect, DNS, TLS, and a stalled socket with no server reply, and the docs must say so.

**Row 3, COMMIT reply lost.** Rails pops its stack before sending COMMIT, so transaction_open? is false whether the commit landed or not. On ConnectionFailed Rails invalidates, throws the adapter away, and re-raises. The wrapper discards and the controller returns a bounded 503 with Retry-After. The guard marker persisted in the session row is harmless after commit because the next transaction has a different xid. Caller rule: keep the exact operation ID and the immutable payload; retry with the same identity or look the operation up. Every C/D write has a replay-safe identity in the contract, so same-identity retry after 503 is safe. Retry with a new operation ID is forbidden. For non-draft routes there is no ledger: read-state and notes are idempotent on desired state or note ID, assignment and membership carry expected versions, so a retry yields either the same result or a version conflict that prompts a refetch. Manual reconciliation beyond that is limited to re-reading the resource, which cannot distinguish "my write landed" from "someone else's identical write landed."

**Row 4, cleanup paths.** The table above covers them. Checkout that raises leaves nothing leased, because checkout_and_verify removes and disconnects on its own failure. Business exceptions with a completed rollback retain the adapter. Normal 200 and terminal 409 commits retain it. Cleanup failure in discard is logged and swallowed because the adapter is already unregistered and the request is already failing. An Expired that arrives during checkin or disposal stays pending until the mask ends, by construction. Pool size one is proved by checking out again from another thread after each failure path and asserting the returned adapter is a different object, that the registered set has one member, and that the discarded adapter is not reachable.

**Row 5, next request isolation.** All GUCs are set transaction-locally and die with the transaction. Tenancy clears the query cache and the thread marker in its ensure. A pending Expired is delivered at mask exit and consumed by the request's own rescue; add a unit assertion that no interrupt is pending after the action returns. The phantom-available adapter is the one leak that survives today, which the discard path closes.

**Row 6, regression suite.** Real pool: construct a real `ActiveRecord::ConnectionPool` of size one against the pinned image under the actual restricted API login, and drive the real `SessionWrites` and `Tenancy` code. Fault injection at the adapter seam: prepend a module on that single adapter instance whose commit method either raises ConnectionFailed before calling super, or calls super then raises. That is a portable model of "COMMIT never sent" and "COMMIT reply lost," and the test asserts the business row is absent in the first case and present in the second while the HTTP outcome is identical. Physical lost-WAL timing is not portable and must be labeled a non-goal. Synchronization only by Queue gates, pg_stat_activity wait events, or backend pid disappearance; a sleep may serve as a watchdog only. Assert SQLSTATE 25P04 on the native path, 25001 on re-entry, 22023 on malformed targets, and run a disabled-timer control so the suite cannot pass on an unrelated connection failure.

## D05 wording, guard.sql, interleavings and evidence

**Required D05 amendment.** Replace "Bound the entire server request, including Auth and serialization, by the canonical 10-second deadline; set tighter internal HTTP/SQL timeouts within it and fail rather than stream after the deadline" with: "The request budget is ten seconds and is enforced cooperatively. Auth HTTP, pool waiting, each SQL statement and the whole database transaction are bounded by timers derived from the remaining budget. Ruby phases check the budget at every SQL and serialization boundary and operate only on contract-bounded data. The server never begins a payload after the budget expires. The budget does not guarantee a client-observed response time under connect, DNS, network, COMMIT durability or scheduler stalls; in those cases the response is late or absent, and the outcome of a sent COMMIT is unknown to the caller until reconciled by operation identity." Mirror that sentence in contract section 2, and rewrite the line-14 comment to say the mask defers only the HTTP timeout while the adapter is owned and that the database timer, not Ruby, bounds held guards.

**guard.sql.** Move the existing current-transaction marker check to immediately after the organization-null return and before the generation loop. For a first entry nothing changes. For a re-entry the 25001 now precedes the post-lock status, access-expiry and claims checks; the only observable difference is that a re-entry with mutated claims raises instead of returning a status object, which is a programming-error path either way. Record that in the adjacent note. Split the target validation into two sequential statements: first null, cardinality above two, and a non-empty array whose dimension count is not one; only then the null-element check using array_position. Keep the message and the 22023 code unchanged. Regression: precreate guard rows for users B below A, open two API connections with two sessions for actor A, let T1 enter with no targets, let T2 enter with target B and observe it waiting on A through the existing wait-event helper, then call T1 again with target B and assert 25001 within the helper's one-second lock timeout. Roll T1 back and join T2 with status ok. Repeat with identical targets. Call the function directly with one-element and two-element two-dimensional array literals and assert 22023.

**Interleaving A, blocked serializer, NOT_RUN.** Budget one second. Checkout, BEGIN, arm at roughly 0.95 seconds, guard ok, business insert, then the gate blocks for sixty seconds. The Timeout thread raises Expired at one second and it stays pending. The backend terminates itself with 25P04 shortly after, releasing session and generation guards, and the row is never committed. When the gate opens, the budget check raises, Rails attempts ROLLBACK on a closed socket, ConnectionFailed replaces the original error, Rails evicts, the wrapper discards, and the pending Expired is delivered at mask exit. Public outcome: one 503 after sixty seconds, no payload, business row absent, registered set empty, next checkout creates a fresh adapter. The database bound held; the application bound did not, and nothing in this design can make it.

**Interleaving B, COMMIT outcome versus response, NOT_RUN.** Variable P is the injection point, before or after the real COMMIT. In both cases the wrapper discards and the client receives the same 503. With P after, the draft row and ledger entry exist and a same-identity retry returns the original applied result through the ledger. With P before, nothing exists and the retry performs a fresh version-one save. The response therefore carries zero information about the outcome, which is exactly the contract's claim.

**Interleaving C, phantom adapter, NOT_RUN.** Request one holds adapter A and its COMMIT raises ConnectionFailed. Today: Rails removes A, the wrapper checks A in, the available queue holds A while the registered set is empty. Request two's checkout polls the queue first and receives the evicted A, reconnecting it outside accounting. Request three finds the registered set below size one and creates B. Two physical sessions now exist under a size-one pool, and disconnect-all will never close A. After the repair request two creates B, A is unreachable, and the registered count stays at one.

**Interleaving D, re-entry deadlock, NOT_RUN.** As in the guard regression: T1 holds A, T2 holds B and waits for A, T1 re-enters targeting B. Today T1 waits for B, and the deadlock detector or lock timeout aborts one of them, possibly the valid T2. After the move T1 fails fast with 25001 and T2 proceeds once T1 rolls back.

**Required evidence before closure.** Docker run on the pinned image with the real pool and restricted roles covering: successful 200, terminal 409 commit with ledger persisted, business exception rollback, native 25P04 with a disabled-timer control, both COMMIT injection points, Tenancy ownership loss, cleanup-failure logging, re-entry and dimension SQLSTATEs, the two-session lock interleaving with observed wait events, and a pending-interrupt assertion after the action. Each test states its SQLSTATE or outcome explicitly; no broad PG::Error assertion survives. Independent bounded reviews of the repaired files remain required afterward.

**Alternatives.** Accept: native transaction timer with reset-then-assign; blanket mask around ownership; conservative discard on any Active Record error. Adapt: cooperative checkpoints extended to SQL round trips in the draft adapter. Reject: a narrow interruptible Ruby region, any Ruby-side Timeout wrapping SQL or COMMIT, cross-thread cancel or disconnect, an isolated owner subsystem for stalled commits, and any inference from transaction_open? about commit outcome.

**Dissent and uncertainty.** I have not seen the pinned PostgreSQL adapter's disconnect implementation, so idempotent double-disconnect is a hypothesis the lifecycle test must confirm. I have not seen the collaboration subclasses, so the optional deadline keyword may need more call sites than named. The discard-on-any-error policy trades connection churn for certainty at pilot scale; if churn is measured as a problem later, narrow it to connection-class errors, not before. A committed write reported as 503 after a late pending Expired is permitted by the contract but is operationally unkind; I did not find a safe way to prefer the truthful 200 without streaming after the budget, so I leave it as is and flag it for the coordinator.
