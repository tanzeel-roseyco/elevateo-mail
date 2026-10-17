# BE-02 write deadline and connection lifecycle: Astra MAX synthesis

Status: **design complete; root adoption and implementation gate pending**. Prepared 2026-10-13 by the dispatched Codex `gpt-6-astra` worker at `max` effort. This document does not authorize implementation or change the accepted contract by itself. No application source, application tests, Docker resources, production state, commits or pushes were changed by this dispatch.

<!-- AIDEV-NOTE: Root must adopt the explicit D05 amendment before authorizing this bounded repair. -->

## Decision and contract gate

Adopt a narrow, typed SQL-call capability inside the existing write transaction: permit `RequestDeadline::Expired` during application Ruby work, defer it during each actual Rails adapter call and during connection/transaction ownership changes, and retain cooperative budget checks at those boundaries. Return only a normally completed, registered, correctly owned adapter to the real Rails pool. Evict and disconnect adapters on abnormal owned-work exit; never unconditionally check in after Rails has removed an adapter.

This repairs WD-01 (the mask also covers Ruby business execution/serialization) and WD-R02 (checkin can requeue an adapter removed after incomplete COMMIT). Include the two independently reported guard repairs, WG-01 and WG-02, because both were present in the immutable packet supplied to all three opinions. Preserve the existing draft operation ledger, terminal 409 commit behavior, private transaction marker, first-entry lock ordering, and current authorization checks.

**The literal ten-second absolute response/rollback guarantee is not achievable by this bounded repair.** PostgreSQL disables its transaction timer inside `CommitTransaction` before durable WAL commit, and native connection establishment, a stalled libpq call, cleanup, Ruby C extensions, scheduling and delivery can exceed a Ruby budget. A request can time out after its transaction committed. Root must explicitly accept the following scoped amendment to BE02-D05 and the protected-write contract, or leave implementation blocked on that contract decision:

> Protected writes use one monotonic ten-second request budget beginning before Auth and covering response construction. Auth, checkout queue waits, SQL/lock waits and the native pre-commit transaction timer receive tighter limits derived from the remaining budget. Application Ruby work is interruptible at the defined safe phases and bounded by existing input/output limits. Check the budget before business SQL, after each safely completed adapter call, before leaving the transaction body, after transaction completion, and immediately before rendering the protected payload. Observed expiry suppresses that payload and starts failure handling; ownership cleanup may finish later. This does not guarantee a ten-second wall-time return during native connection/I/O, COMMIT, cleanup or runtime stalls, and does not prove rollback after a possible commit. Preserve the original operation identity and reconcile an ambiguous outcome under current authorization.

There is an unavoidable check-to-render race and no guarantee that the client receives a response by the budget. An error response may be late. Do not claim that no bytes can start after the exact deadline, that no COMMIT can occur after it, or that a timeout proves the operation did not happen. This amendment is scoped to the write boundary; it does not certify or silently rewrite the separate protected-read implementation. If root retains a strict absolute wall-time requirement, report that unmet requirement explicitly; do not add a new worker/process subsystem within this repair.

## Evidence and independence

The [consultation receipt](../../.planning/consultations/results/be02-write-deadline/metadata.json) records current CLI version/help/authentication preflight, exact process results, session IDs, observed model usage, hashes and actual Astra launch/provider evidence. CLI version was `2.1.296 (Claude Code)`; all preflight commands exited zero using the existing authorized account. Each opinion ran in a fresh process with `--safe-mode --print --model <exact model> --tools "" --no-session-persistence --output-format json`, no fallback, no resume, no peer outputs and no repeated opinion. All completed before the 900-second process watchdog.

| Requested and observed model | Returned session ID | Exit / structured result | Elapsed seconds |
| --- | --- | --- | ---: |
| `claude-fable-5` | `37f2278e-cfe4-4ec1-a8f6-761825bc95f2` | 0 / non-error success | 203.816 |
| `claude-opus-5-5` | `baa6b90f-3ad3-4fd0-85d9-3ea632cca872` | 0 / non-error success | 196.325 |
| `claude-fable-5-1` | `8e3d2d90-b597-44cd-acb5-0b0a383cd419` | 0 / non-error success | 467.004 |

All received the same 362,660-byte sanitized packet, SHA-256 `7df91a826548dac18c74a0d6d65e877ee1b223d1ba4da64ad2b827d56adf65d0`, plus their separate focus instructions. The coordinator base was `d2de43b438ad9fb5f003d3e808a6181dbd827632`; the backend base was `5785eba47f3709debb2815c8d86608f7e62d02f3`. These repositories have concurrent working changes: the [input manifest](../../.planning/consultations/results/be02-write-deadline/input-manifest.json) records actual source hashes and excerpt ranges, rather than implying the commit alone identifies the reviewed state. Its omissions apply identically to all opinions. Raw prompts, source snapshots, authentication/process logs and provider JSON remain only in ignored `ops/local/be02-write-deadline-20261013/`.

The Astra receipt reports both requested and effective `gpt-6-astra` / `max`, a live Codex provider projection for `gpt-6-astra`, and the worker terminal. Its initial startup marker was `turn_start_unobserved`; no separate provider session ID was exposed. That limit is retained rather than manufacturing a session receipt. The following synthesis is this worker's actual reasoning, not a renamed Claude response.

The [drift assessment](../../.planning/consultations/results/be02-write-deadline/drift-assessment.md) separates seven later edits from the frozen opinions. Additional call-site, typing and Rails ownership inspection is explicitly Astra-only. None changes the mask, pool-removal or COMMIT assumptions; no opinion was repeated. Later exact-number parsing and helper changes still require their own review and integration checks.

## Verified source constraints

| Boundary | Source observation and consequence |
| --- | --- |
| Ruby deadline | `RequestDeadline#within` uses `Timeout.timeout` with the specific `Expired` exception; `remaining` raises an `AuthError` on observed expiry. Mask only `Expired`, not `Exception`, `Object` or unrelated failures. Ruby's interrupt masks can nest, but they are not hard real-time scheduling. [Ruby Thread interrupt documentation](https://docs.ruby-lang.org/en/3.4/Thread.html#method-c-handle_interrupt) |
| Current write wrapper | `SessionWrites#transaction` masks its entire execution, including user-supplied business Ruby, JSON work and `WriteResponse#verify!`. Its ensure checks in unconditionally. These are the two invalidated assumptions, not proof that every Rails/database operation is broken. |
| Rails transaction manager | Rails 8.1.4 pops a transaction before COMMIT and calls `throw_away!` when the transaction remains incomplete. A false `transaction_open?` therefore does not prove clean completion or continued registration. [Pinned transaction source](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/transaction.rb) |
| Real Rails pool | `checkin` expires ownership and adds the adapter to the available queue without a registration test. It locks adapter then pool. `remove` deletes registration and available-queue membership, then may create a replacement for waiting callers outside its monitor; repeated removal is not necessarily an inert call. [Pinned pool source](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb) |
| Adapter disposal | `throw_away!` calls pool removal and then disconnect; a removal failure can skip its disconnect. Lease/expire require the correct execution-context owner. Use normal removal/disconnect semantics, not fork-oriented `discard!`. [Pinned adapter source](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb) |
| PG transaction budget | Preserve the reset to `transaction_timeout = 0`, followed by a positive value derived from the cumulative remaining request budget. The native transaction timeout includes idle time before commit, but its timer is disabled after `HOLD_INTERRUPTS()` inside `CommitTransaction`, before durable WAL completion. [PostgreSQL 17.6 transaction source](https://raw.githubusercontent.com/postgres/postgres/REL_17_6/src/backend/access/transam/xact.c) |
| Timeout identity | `25P04` is transaction timeout, `57014` is query cancellation and `55P03` is lock unavailability. Generic `PG::Error`, elapsed time or backend disappearance alone cannot prove which mechanism fired. [PostgreSQL error codes](https://raw.githubusercontent.com/postgres/postgres/REL_17_6/src/backend/utils/errcodes.txt), [native timeout handling](https://raw.githubusercontent.com/postgres/postgres/REL_17_6/src/backend/tcop/postgres.c) |

The runtime test target is Ruby 3.4.11 / Rails 8.1.4 and `supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`. The upstream PostgreSQL source supports the reasoning; it is not proof of byte-equivalent downstream image behavior. Actual pinned-image regression evidence remains required.

## Opinion disposition and retained dissent

The complete substantive answers are retained: [Fable 5](../../.planning/consultations/results/be02-write-deadline/claude-fable-5.md), [Opus 5.5](../../.planning/consultations/results/be02-write-deadline/claude-opus-5-5.md), [Fable 5.1](../../.planning/consultations/results/be02-write-deadline/claude-fable-5-1.md). Their pseudocode is advisory and has not been executed. The table resolves material recommendations; none is accepted merely by majority vote.

| Recommendation / source | Disposition | Reason and implementation consequence |
| --- | --- | --- |
| Fable 5 and Fable 5.1: retain the blanket interrupt mask and use cooperative checks | **Reject for WD-01; retain dissent** | Cooperative checks cannot run while a Ruby serializer is blocked. A test that releases its gate after expiry only proves late detection. Their concern about async exceptions inside native SQL is valid and motivates a narrower SQL boundary. |
| Opus: narrow ownership masking and cooperative checks | **Adapt** | Accept interruptible Ruby work; do not unmask the raw adapter along with that work. The existing domain interface needs only `exec_query`, so one closed capability supplies the missing protected SQL boundary without a generic framework. |
| Opus checkout sketch: establish cleanup after the masked checkout block | **Reject that sketch** | Pending expiry can land after acquisition but before an ensure exists. Install the ensure before checkout and keep assignment plus disposition inside the outer mask. |
| Opus: rely on Rails `rescue Exception` to recover from async cancellation during native SQL | **Reject** | Ruby exception handling is not evidence that a libpq protocol operation was safely cancelled or consumed. Mask the actual adapter call; native server cancellation and safe return precede Ruby delivery. |
| Fable 5/Fable 5.1: retained/owned defaults true with selected rescue classes | **Reject that ownership algorithm** | Rails can already have removed the adapter; nonlocal exits and swallowed `ActiveRecord::Rollback` need an explicit unsuccessful disposition. A boolean unrelated to actual pool membership is insufficient. |
| Opus: membership guard before checkin | **Adapt** | Membership and checkin must be atomic under the pinned pool's locking discipline, with current ownership checked. An unlocked `connections.include?` followed by checkin has a race. |
| Opus: distinguish verified ordinary rollback for reuse | **Reject for this bounded repair** | Discard on any abnormal owned-work exit. This deliberately spends a reconnect on validation, context or serialization failures rather than inventing a second transaction-state validator. Successful 2xx and committed terminal 409 remain reusable. |
| Opus: use an `Object` interrupt mask or swallow disposal errors | **Reject** | Defer only the owned `Expired` exception. Record cleanup failures deliberately and preserve the primary failure; never turn an uncertain adapter into a successful checkin. |
| Opinions: remove/disconnect uncertain connections; no second-thread cancel/disconnect | **Accept with source-specific limits** | Removal may already have occurred or may trigger replacement creation. Ensure disconnect is attempted even if removal raises. Connection protocol ownership remains on the request thread. |
| Opinions: native cumulative timeout and honest COMMIT uncertainty | **Accept** | Retain reset/rearm and tighter statement/lock limits. Require the explicit D05 amendment above; reject any accompanying claim of guaranteed rollback or no commit after expiry. |
| Fable 5.1: every C/D write has replay-safe identity | **Reject the generalization** | Drafts have the durable operation ledger. Other writes have their existing desired-state, resource ID or CAS semantics; those do not prove which request committed. Do not introduce a generic ledger here. |
| Opinions: preserve operation ID and terminal 409 replay | **Accept** | An ambiguous draft outcome retains the original operation ID and exact submitted binding/payload. A missing or expired lookup never means safe to mint another operation. |
| Opinions: early marker rejection and dimension-safe SQL validation | **Accept** | Both WG-01 and WG-02 were in every packet. Use the local ordering repairs and the bounded two-connection/error-code proofs below. |
| Fable 5: global 4096-byte response assumption | **Correct** | Preserve route-specific bounds, including the existing 65,536-byte note response bound. Existing limits must be enforced after serialization/escaping. |
| Opinions: pool size/statistics and backend absence as evidence | **Adapt** | Verify registered and available membership and actual next-checkout behavior. Pool statistics miss an orphan in the available queue; an absent backend does not identify the timeout cause. |
| Opus: add a before-commit flag to shared Tenancy | **Reject as unnecessary now** | Current `active_frame?` is in-memory state inspection. The nested interrupt scope can close before Tenancy/Rails cleanup without modifying read behavior or adding another callback protocol. |
| All: real regressions and practical tradeoff simulation | **Accept with evidence limits** | Tests below are required, not claimed results. Obsidian was unavailable; local analytical traces below are substitutes for design reasoning only, not an Obsidian run. |

Fable 5.1's simplicity objection remains useful: this decision accepts one extra boundary class solely because the task explicitly requires stopping blocked Ruby work. If the capability expands beyond the demonstrated `exec_query` interface, or introduces arbitrary delegation, its justification must be revisited before implementation scope expands.

## Minimal implementation specification

### 1. One SQL capability and three interrupt scopes

Add `Elevateo::WriteStatements`, holding only the owned adapter and this request's deadline. Expose the existing `exec_query(sql, name, binds)` operation with a concrete materialized `ActiveRecord::Result` return type. Existing `_ThreadConnection` consumers already require that operation and `to_a`; do not add `method_missing`, a raw-connection reader, transaction methods, retry logic or a general cancellation API.

The scopes are:

1. **Outer ownership scope (`Expired => :never`)**: begins before checkout assignment and its already-installed ensure; covers transaction begin/bootstrap, all Rails transaction completion/unwind and final ownership disposition.
2. **Application Ruby scope (`Expired => :immediate`)**: inside the established Tenancy context, covers guarded acquisition through the capability, metadata/context/CSRF checks, business execution, response construction and verification, and the last pre-commit budget check. Restoring the outer scope must precede Tenancy's ensure and Rails rollback/COMMIT.
3. **SQL-call scope (`Expired => :never`)**: inside the capability, check the budget, execute the actual adapter operation with interrupts deferred, and check again after safe completion. Return no live cursor or unfinished protocol work. Pending expiry may be delivered when this nested scope restores the application scope; the outer transaction ensure then runs under its protected scope.

Use the capability for the guard's reset/rearm/acquisition calls as well as all business calls. Never yield the raw adapter to the controller/domain callback. Preserve the private marker and typed SQL binds. Do not unmask bootstrap/BEGIN merely to move a timer earlier; they have the same native-I/O limitation as other adapter calls.

Keep the monotonic deadline instantiated before input/Auth as today. Preserve request/body/recipient/target and route-specific serialized-response caps; do not grow an unbounded Ruby loop under the outer mask. Add a budget check immediately before `api_serialized` in the write controller. Keep the current `RequestDeadline` timer and typed error translation; no timer per statement and no separate worker/watchdog that touches the connection.

This is cooperative at SQL boundaries and interruptible during Ruby work; neither mechanism is an absolute realtime guarantee. Ruby or native JSON work and runtime scheduling still need the contract limitation. Preserve the parallel `WriteInput` exact-number fix; integration must verify its BigDecimal exception-mode restoration under error/expiry instead of reverting it.

### 2. Explicit ownership disposition

Install the ensure before `pool.checkout(deadline.remaining)`. Initialize the local adapter to nil and returnability to false. The outer interrupt mask protects the handoff from Rails to that local owner, including the interval after checkout returns. Rails remains responsible for a checkout/verification failure that never returns an adapter; verify that real behavior in its regression.

Mark returnable only after Tenancy returns normally with a verified `WriteResponse`, no open transaction, intact current execution-context ownership and no observed expiry before disposition. Treat a swallowed `ActiveRecord::Rollback` result (`nil`), nonlocal escape, context loss, business/serialization exception, expired budget, SQL error and incomplete COMMIT as abnormal. A committed terminal 409 is a normal result. A timeout that arrives after completed safe handoff must not lead the old owner to manipulate an adapter another request now owns.

| Observed owned-work result | Required disposition |
| --- | --- |
| Normal verified 2xx or terminal 409; closed transaction; still registered and owned here | Under adapter lock then pool monitor, atomically confirm registration/ownership and call the pinned Rails checkin. Do not separately release the membership guard before checkin. |
| Rails already removed this adapter | Never check it in or re-register it. Attempt owner-side disconnect; retain the incomplete-COMMIT failure/uncertainty. |
| Abnormal exit while adapter is still registered | Remove it through the supported pool method, then disconnect in an ensure. Never check in on the fallback path. |
| Removal raises after eviction/replacement creation begins | Still attempt disconnect; independently record the removal failure and verify absence from registration. Do not mistake the replacement-creation failure for safe reuse of the old adapter. |
| Disconnect fails | Keep the old adapter out of the pool, record a sanitized cleanup failure and fail the request. A physical backend may remain until the server/network closes it; do not claim immediate backend disappearance. |
| Checkin fails before ownership is transferred | Discard the untransferred adapter and preserve the failure. A pinned checkin callback can fail after `owner` becomes nil but before queue insertion; that is not a completed handoff. Never remove an adapter already transferred to another owner. |
| Ownership is unexpectedly another execution context, or removal cannot establish absence | Do not steal, disconnect another owner's connection, or claim pool health. Surface the invariant failure; the integration gate remains failed until its cause is resolved. |

Use the pinned public monitor/lock and registration accessors; do not edit Rails internals or mutate its queue instance variables in production. Preserve adapter-before-pool lock order. Record the checkin handoff while still in that atomic section: Rails' nil owner during callbacks does not itself prove queue transfer. Cover callback failure both before and after that owner clear. Do not hold the pool monitor across the disposal path: `remove` can create a replacement outside its own synchronized section. Never treat an unlocked membership check, a default-true flag or `transaction_open? == false` as sufficient.

Capture cleanup failures separately from the primary failure with sanitized exception class, lifecycle phase and request correlation where available. Do not log SQL, binds, cookies, claims or message payloads. Propagate the primary failure with cleanup evidence, or a deliberate cleanup/invariant failure when there was no primary failure. A rescue whose only behavior is `nil` is not acceptable. Retain the normal C/D public error envelope without exposing database details.

Registered adapters must remain within pool capacity and every available adapter must be registered. Temporary physical overlap can occur because Rails removes an old adapter and opens a replacement before the old disconnect finishes; a failing disconnect can extend that overlap. After ordinary successful disposal settles, assert the expected API backend count. Do not label configured pool size one as a universal hard bound on all live PostgreSQL processes, especially the separate observer.

### 3. Guard repairs

For WG-01, move the existing same-transaction marker rejection immediately after the locked session's preliminary status and non-null organization checks, before any generation insert or acquisition. Keep first-entry session, sorted generation, then business lock order; keep revalidation after waits. The early `25001` rejects an already-entered SQL protocol state and does not authorize or skip checks for a fresh request. Preserve normal HTTP Auth/context/CSRF and revocation precedence. No new guard ledger, savepoint protocol or retry is needed.

For WG-02, use two PL/pgSQL statements. First reject a NULL array, cardinality greater than two, or a nonempty array whose dimensionality is not one using only dimension-safe operations. Only after that check may a separate `IF` call `array_position` to reject NULL elements. Both branches raise `22023`. Reordering terms in one OR expression is insufficient. Preserve empty targets, actor inclusion, duplicate normalization and the supplied-target maximum.

### 4. Unknown outcomes

An expired/lost COMMIT acknowledgment produces no successful application acknowledgment. For a draft, retain the original operation ID and exact submitted payload/binding/expected version; retain edits locally. Use the existing authorized operation lookup and same-ID replay rules. Applied and persisted terminal conflict outcomes remain authoritative. `unknown`, missing, expired or currently inaccessible outcomes do not prove non-commit and do not authorize sending or minting a replacement operation for the same ambiguous submission.

For other C/D writes, preserve the existing resource ID, desired state or expected version and re-read under current authorization. Reconciliation of resource state is not proof of this request's causal outcome. Do not automatically replay a non-idempotent action on timeout or add an all-purpose operation ledger in this patch.

## Local analytical simulations — NOT_RUN

Obsidian was unavailable. These are deterministic reasoning traces, not executed tests, performance measurements or connection-fault experiments. Times are illustrative monotonic offsets, not promised tolerances.

| Scenario | Current / rejected behavior | Selected design prediction and remaining limit |
| --- | --- | --- |
| One-second budget; serializer enters a closed Ruby Queue gate at 0.3s; external opener waits until 60s | Blanket mask holds the Ruby timeout until the gate opens. PG can abort the idle transaction without unblocking that Ruby Queue. A late 503 at 60s does not meet WD-01. | `Expired` interrupts the inner Ruby phase without opening the gate. The outer scope runs rollback/disposal. Completion still depends on native cleanup returning; the regression must leave the gate closed until observed completion or failure teardown. |
| Multiple individually short SQL calls exhaust the cumulative budget; another request waits for a guard | Per-statement limits alone reset between calls. Broad `PG::Error` cannot establish the native mechanism. | Reset/rearmed native timer gives `25P04` and releases guards on the server; distinct controls prove it. A lost/stalled network response can still delay Ruby cleanup/response. |
| COMMIT begins at 9.8s, durable commit finishes at 10.3s, response returns at 10.4s | Treating transaction timeout or Ruby expiry as a rollback guarantee falsely tells the user the draft was not saved. | No protected success after observed expiry; ambiguous failure retains the same operation ID. The ledger may prove applied. The already-committed transaction cannot be rolled back by later disposal. |
| COMMIT fails before durable success versus failure raised after the real COMMIT completed | Both can produce the same 503. Inferring database outcome from status or stack depth is unsafe. | Separate real-adapter before/after-COMMIT injections prove absent/present state respectively and require the same safe reconciliation protocol. These injections do not emulate every network/WAL failure. |
| Rails removes adapter A after incomplete COMMIT: registered = {}, available = {} | Unconditional checkin changes available to {A} while registered remains empty. A subsequent checkout plus another connection creation can violate capacity accounting. | A is never requeued. The next returned adapter B must be registered; an observed second waiter remains blocked at pool size one until B is released. |
| Guard rows B < A; T1 owns A; T2 owns B and waits for A; T1 re-enters requesting B | Sorting each call still creates a transaction-wide cycle before the late marker check. | The early marker raises `25001` without waiting for B. Rollback T1 and T2 can finish in normal first-entry order. |
| Removal evicts A, replacement creation fails; or disconnect of A fails | Sequential remove-then-disconnect without ensure can skip disconnect; fallback checkin can resurrect an uncertain connection. | Disconnect is attempted despite removal failure; no fallback checkin. A remains unregistered, errors are visible, and any remaining physical backend is explicitly unresolved rather than claimed reclaimed. |

The practical tradeoff is one narrow capability and reconnects on abnormal work versus either unsafe async SQL interruption or indefinite masked Ruby work. The theoretical distinction is between a cancellation request, a database commit decision, and knowledge of that decision: they are separate events. No rearrangement of ensure/rescue can make an ambiguous distributed acknowledgment atomic with the client's observation.

## Required regression evidence — all NOT_RUN in this dispatch

Use the actual Rails pool and pinned PostgreSQL image, the real restricted API role and an independently identified observer connection. Fake pools remain useful for small routing assertions but cannot close WD-R02. No host application tests or Docker tests were authorized for this design worker.

| Check | Required observable proof |
| --- | --- |
| Blocked serializer and blocked business Ruby | Real `RequestDeadline#within`; observe entry through a Queue/barrier, then let the request deadline fire without opening that gate. Verify rollback/no business row, cleared Tenancy frame, safe disposition and a usable next request. A bounded watchdog may open the gate only during failure teardown; that path fails the test. |
| Capability safety | Existing domain callbacks receive only the typed SQL capability. Verify pre/post-call expiry checks, deferred delivery inside the adapter and delivery after safe return. Prove no extra SQL starts when expiry was already observed. Include success and the two likely failure paths (pending expiry and adapter failure). |
| Ownership acquisition/unwind | Inject the exact owned `Expired` at observed checkout/assignment, inner-entry, post-SQL and disposition barriers. Ensure no acquisition gap, leaked adapter, stuck waiters or leftover request thread. Cover Rails checkout verification failure and swallowed rollback/nonlocal exit. |
| Native timeout identity/control | On actual PG, arrange cumulative budget expiry with tighter causes controlled so `transaction_timeout` is the cause. Assert SQLSTATE `25P04` from the PG diagnostic or correlated server error evidence for that backend; compare a transaction-timeout-disabled control and distinct statement/lock timeout cases. `PG::Error`, backend absence or a timer sleep alone fails this evidence requirement. |
| Native libpq SQL wait | Observe the actual blocked backend with `pg_blocking_pids` and lock type before triggering expiry. The request thread must not asynchronously disconnect/cancel while libpq owns the operation. Show server cancellation/rollback and then safe owner-side disposition. A simulated blackholed transport must be labeled a contract-limit case, not a false ten-second pass. |
| COMMIT before/after acknowledgment failure | Inject through the real Rails adapter/transaction manager before real COMMIT and after real COMMIT returns, raising the corresponding connection failure. Confirm respectively absent/present durable effects, Rails removal behavior, no orphan checkin and identical honest public uncertainty. Preserve same-ID draft replay and persisted 409 outcomes. |
| Already-removed adapter and pool size one | Assert available is a subset of registered using test-only inspection or equivalent actual checkout proof; `pool.stat` alone is insufficient. Observe a second waiting checkout while the next registered adapter is owned; it must not obtain an untracked spare. Check registration and owner identity for every returned adapter. |
| Cleanup failure | Inject remove failure after actual eviction/replacement attempt, disconnect failure, and pinned checkin-callback failure before queue transfer. Prove disconnect attempt where appropriate, no requeue, no successful acknowledgment and visible sanitized cleanup evidence. Do not disconnect a connection transferred to another owner. |
| Success and normal rollback | Successful 2xx and committed terminal 409 use/reuse a registered clean adapter. Business failure, serialization failure, context error and Rails rollback discard conservatively. Record the deliberate reconnect cost; no new reuse optimization is needed. |
| Next request and claim cleanup | Follow every abnormal path with a different authorized tenant/session on a size-one pool; assert transaction-local GUC/RLS isolation, cleared Tenancy frame, no stale claims, no pending previous timeout and working queries. Observer/admin connections are not counted as API pool members. |
| WG-01 two-connection proof | Precreate B < A guards and distinct valid sessions for actor A. T1 enters for A; observe T2 holding B and waiting on T1's A via actual blocker identity. T1 re-entry requesting B must return exact `25001` without a wait on B. Roll back T1 and prove T2 completes; include identical-target re-entry. Use two API connections for this case rather than the separate size-one pool test. |
| WG-02 direct SQL shapes | Parameterized calls assert exact `22023` for NULL array, NULL element, three targets, and one-/two-element multidimensional arrays. Empty, one/two valid and duplicate targets retain their established behavior. A Ruby array-join helper alone cannot express these malformed shapes. |
| Concurrent parser/helper integration | Preserve BigDecimal input types and exception-mode restoration, absent Content-Length handling, HTTP-method helper support and the new observed-lock helper. Test integration under expiry/error without changing their independent feature semantics. |

Use observed barriers rather than sleeps to choose a concurrency phase. Short polling intervals may observe real server state, but cannot stand in for that state. Bound all test waits and always join/clean task-owned threads, sessions, fixtures and Docker resources, including on failure. Tests that depend on a sleeping query must additionally identify the exact server timeout and a control; elapsed sleep is not the assertion.

After repair, root must arrange Docker lint, strict type checks, unit and integration suites plus independent adversarial reviews (at most 200 physical lines per assignment; no single reviewer over 400 total) and a dedicated design-tradeoff review under the full user rubric. Review tests and affected interfaces as well as production lines, and record actual coverage, defects and defect density in `code-reviews.md`. These opinions and this synthesis do not replace that review. This dispatch carries four reported findings (WD-01, WD-R02, WG-01, WG-02); it does not claim a new code-review LOC denominator or invent a defect density. Actual UI/application validation remains a release gate owned by root.

## Exact bounded change surface for the implementation dispatch

All paths in this table are relative to the sibling `Elevateo Mail - BE02 Codex` repository. Root must assign them explicitly; this design worker has changed none. No blanket app-source grant follows from the table.

| Allowed path | Bounded purpose |
| --- | --- |
| `apps/server/lib/elevateo/session_writes.rb` | Nested Ruby/SQL ownership scopes, typed capability yield, correct clean-result/discard handling and current anchors. |
| `apps/server/lib/elevateo/write_statements.rb` (new) | The single demonstrated `exec_query` capability, with boundary checks and a short explanatory AIDEV anchor. |
| `apps/server/app/controllers/v1/write_controller.rb` | Immediate pre-render deadline check only. |
| `apps/server/sig/session_writes.rbs` | Capability callback, acquire and lifecycle helper types matching final code. |
| `apps/server/sig/write_statements.rbs` (new) | Strict concrete adapter/deadline/result types; no `any`. |
| `apps/server/sig/write_controller.rbs` | Change only the yielded connection type; preserve the parallel `WriteInput::object` changes. |
| `apps/server/sig/rails_seams.rbs` | Only actual additional pool/lock/owner accessor signatures used by this repair; update the stale unconditional-return comment. |
| `apps/server/db/be02_writes/guard.sql` | The two local WG ordering/validation repairs and their anchors. |
| `apps/server/test/be_02/write_boundary_deadline_test.rb` | Real deadline/blocked-Ruby regressions. |
| `apps/server/test/be_02/write_boundary_database_deadline_test.rb` | Exact native timeout cause/control and observed server-state assertions. |
| `apps/server/test/be_02/write_boundary_database_test.rb` | WG-01/WG-02 SQL regressions and unchanged positive cases. |
| `apps/server/test/be_02/write_boundary_controller_test.rb` | Protected-payload suppression and unchanged error/replay contract. |
| `apps/server/test/be_02/write_boundary_test_helper.rb` | Capability-aware fakes and observed test barriers; preserve concurrent edits. |
| `apps/server/test/be_02/write_boundary_database_test_helper.rb` | Required real-role fixtures/barriers only; preserve exact blocker/lock helper improvements. |
| `apps/server/test/be_02/write_statements_test.rb` (new) | Focused capability contract cases. |
| `apps/server/test/be_02/write_boundary_pool_test.rb` (new) | Real Rails lifecycle, COMMIT fault injection, pool accounting and next-request isolation. |
| `apps/server/test/be_02/write_boundary_pool_test_helper.rb` (new, only if needed) | Small real-pool fixture/setup and failure teardown shared by those lifecycle tests. |

`RequestDeadline`, shared `Tenancy`, domain services, other controllers, frontend files, provider/native clients, database business schemas, operation-ledger semantics and deployment configuration need no implementation edits for this design. Do not add alternate framework workers, generalized cancellation, cross-thread native calls, new dependencies or new ledgers. If real typing/test evidence requires another path or a different SQL interface, escalate the concrete need before widening scope.

Changing `guard.sql` affects fresh disposable schema setup; it does not update an already-applied migration. Before implementation, root must establish whether the only target is its disposable local database. If a persistent applied schema needs an upgrade, root must separately authorize an exact reversible replacement-function migration instead of silently rewriting applied history or resetting persistent data.

Root's adoption work includes the explicit scoped D05 amendment in `.planning/consultations/results/be-02/decisions.md`, the write-boundary/CD contract documentation, and synchronized README Current state, state/documentation and `.planning/STATE.md` as applicable. Root also owns the review ledger and final source/contract hash check. These files are deliberately outside this worker's exclusive output surface.

## Handoff checklist

- Root accepts or rejects the explicit ten-second limitation; the implementation gate remains root-only.
- Root confirms disposable-schema versus separately authorized migration handling and assigns the exact bounded paths.
- Implementer preserves the concurrent parser/helper changes and follows the scoped interrupt and pool invariants above.
- Real pinned Rails/PG regressions establish exact causes, ownership, commit uncertainty, guard behavior and next-request isolation.
- Independent adversarial code/design reviews, Docker checks and required actual-app validation complete before release claims.

No implementation or runtime gate is closed by this document. The requested three opinions and actual Astra MAX synthesis are complete.
