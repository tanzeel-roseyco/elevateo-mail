# BE02 pool disposition: bounded adversarial design review

**Result: 1 MED defect in 231 unique physical source/test lines; 4.33 defects/KLOC. Runtime: NOT_RUN.** The protected owner/removal sequence closes the two described race windows when eviction succeeds, subject to the pinned Rails locking contract. A nonlocal exit from removal can still replace an original checkin exception. This is a static review, not application acceptance or proof that any test passes.

<!-- AIDEV-NOTE: Coverage is the frozen 231-line assignment; root owns execution, the review ledger and acceptance. -->

## Identity, scope and evidence

- Worker: `term_169520fd-6f6f-4008-8642-1db62edceb89`; task: `task_9d0105b07e35`; dispatch: `ctx_4f16407fc83a`.
- Actual execution identity as exposed by Orca: Codex, `gpt-6-astra`, effort `max`. `worker-show` returned matching requested/effective launch settings, provider projection, and a terminal preview identifying GPT-6-Astra max. The retained launch stage was `turn_start_unobserved`; observation reported the exact worker live. No independent provider session attestation was exposed.
- Review date: 2026-10-14 Australia/Sydney; final source metadata verification at 2026-10-13 20:40:29 UTC, before report creation.
- Context: supplied full adversarial rubric, project `AGENTS.md`, `.planning/STANDARDS.md`, planning/orchestration instructions, and `docs/completion/be02-pool-disposition-repair.md` (61 narrative lines). The coordinator expressly authorized reading the root amendment as narrative after a blocking Orca question.
- Root amendment: `docs/completion/be02-pool-disposition-amendment.md`, all 21 lines, SHA256 `a10703d661ce70bebcf12170c9842d92f79a177a12dd8b90d4dc96645ed4bfa5`. It supplies the accepted contract, not runtime evidence.
- The test filename was resolved by filename-only enumeration. Both supplied full-file hashes matched before either source inspection and again before report creation. No drift was observed.

All implementation/test paths below are relative to `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.

| Separate inspection pass | Exact range inspected | Physical LOC inspected | Full-file physical LOC | Verified full-file SHA256 |
| --- | --- | ---: | ---: | --- |
| 1 | `apps/server/lib/elevateo/session_writes.rb:66-181` | 116 | 206 | `65f7d28b75827d8cd7e30c189d8ddea930772d54d8d61511517968cf07b6cb00` |
| 2 | `apps/server/test/be_02/write_boundary_pool_disposition_test.rb:1-115` | 115 | 286 | `49525648ebeb1f0701fc1c2594d8bcf5e42965491225ab031dc4bcab8043faaf` |

Each source pass was below 200 physical lines. Unique implementation/test coverage is exactly 231 lines, including comments and blanks; no unassigned implementation/test line was inspected. Narrative and metadata reads do not enter the defect-density denominator.

## Numbered defect

### 1. MED — A removal throw can replace the original checkin exception

**Evidence:** `session_writes.rb:93,101-110,128-137,148-166`. The protected checkin's `ensure` calls `quarantine_connection` while its original exception is unwinding. `pool.remove` is guarded by `rescue Exception`, which does not intercept a nonlocal `throw` with a matching enclosing `catch`. The removal `ensure` still checks detachment, but nothing restores the original exception after that nonlocal transfer. The outside disposal path only explicitly raises a primary exception if logging itself fails; ordinary successful disconnect does not restore it.

**Analytical reproduction, not executed:** put a matching `catch(:cleanup_abort)` outside the protected call; have checkin raise a specific `RuntimeError` object after its real enqueue; have the single cleanup `remove` complete real eviction and then `throw :cleanup_abort, :unexpected_exit`. The throw bypasses both `rescue Exception` clauses in quarantine. Its `ensure` can establish detachment; outer cleanup can disconnect once with no recorded failures; execution then reaches the enclosing catch with `:unexpected_exit` instead of raising the original `RuntimeError`. This conclusion does not depend on whether `$!` remains populated in the outside ensure, because the no-cleanup-failure path does not raise it. It also does not claim that ordinary unmodified Rails removal independently generates this throw.

**Violated contract:** amendment lines 15 and 19 require primary/original-error preservation, and the repair narrative explicitly includes removal that throws or raises in its disposition bookkeeping. A pending request failure must not become a different nonlocal return merely because cleanup unwinds. The resource-disposition bookkeeping can succeed while the request's original failure is lost. Severity is MED: error propagation and classification are wrong in this fault schedule; data corruption is not established by this slice.

**Minimal repair:** distinguish normal/rescued completion of the one removal attempt from a nonlocal departure, retain any pre-existing primary exception, and restore that primary during cleanup unwinding after the detachment/disconnect obligations. Record sanitized evidence for the abnormal removal departure. Keep the adapter-before-pool order, one public removal attempt, and existing foreign-owner/detachment protections. This needs a small explicit unwind guard, not a general pooling or catch framework; do not blanket-convert the caller's otherwise valid nonlocal exit.

**Required regression:** with an enclosing matching catch, combine a known checkin exception with a removal throw after actual eviction; assert the identical original exception escapes, exactly one cleanup removal occurs, and proven detachment still permits one disconnect outside the pool monitor. Retain a separate callback-throw case with successful cleanup to ensure its intended nonlocal exit still survives. The inspected two tests do not inject a removal throw. Additional uninspected tests may exist; no claim about their coverage or results is made.

## Analytical interleaving simulations

These are manual state-transition simulations, not measured experiments or Obsidian results. The coordinator reports the Obsidian connection unavailable. No Obsidian operation was attempted or claimed.

Notation: `R` means registered, `Q` means in the available queue, `O` is owner, `M` is the pool monitor, and `A` is the adapter lock. Queue leases requiring `M`, reentrant synchronization, and Rails removal's eviction/replacement ordering are accepted amendment facts, not independently re-read dependency implementations.

| Schedule | State/order traced in the assigned source | Assessment |
| --- | --- | --- |
| Normal owner release and waiter handoff | Writer holds `A` then `M`; checkin changes current owner to nil and enqueues; waiter cannot lease until `M` is released. Registration, nil owner and closed transaction are checked before `handed_off = true` at line 98. | The disposition decision is made while the waiter is excluded. Successful return alone is not accepted without postconditions. Queue membership on successful checkin relies on the Rails checkin contract; this slice only privately checks queue membership for detachment. |
| Checkin raises after release/enqueue | `R=true,Q=true,O=nil`; the inner ensure runs under the same `A/M` region. Quarantine observes nil owner and calls removal without exposing an unlocked owner-observation gap. | If eviction succeeds, the rejected adapter cannot be leased in either former window. A waiter may receive a replacement after monitor release; old-adapter disconnect then acts only on the detached adapter. |
| Callback raises before owner release | `O=current`; inner ensure validates ownership and makes one removal attempt under `M`. | A successful eviction is disposed outside `M`; an ordinary removal exception is recorded without replacing the original raised checkin error. Callback internals remain outside coverage. |
| Callback nonlocal throw, cleanup completes normally | Inner ensure runs despite the throw; `started` is set, detachment is proved under `M`, and outside cleanup skips a second removal. With no cleanup failure, no new exception is raised. | The caller's nonlocal exit survives this normal-cleanup schedule. A second nonlocal transfer from removal is different and produces defect 1 when a raised primary is pending. |
| Removal fails before eviction | Registration and/or queue membership remains; `detached` stays false and failure evidence is recorded. | No disconnect is authorized. The adapter/pool can remain unresolved after unlock. This is the expressly recorded failure limit, not successful quarantine or a healthy reusable pool. |
| Partial removal: registry deleted, queue entry retained | `R=false,Q=true`; the read-only combined membership check returns false. | Registration absence does not authorize disconnect. A subsequent lease of the queued orphan is not ruled out after monitor release; the accepted unresolved-state limit remains material. |
| Eviction finishes, replacement creation raises | `R=false,Q=false`, no foreign owner; removal error is captured, then the ensure proves detachment. | Outside cleanup still attempts disconnect. The original raised request error remains primary on ordinary exception paths; replacement capacity/next-request recovery still needs actual Rails tests. |
| Queue introspection unavailable or malformed | Missing/wrong queue class, non-array contents, invalid entries, or a throwing read prevents a positive detachment result. Initial `detached=false` is retained; `started=true` prevents a retry. | No disconnect based on unknown state. An already detached native connection may remain open. An empty, valid array is distinct from an inaccessible queue and can support detachment when registration is absent. |
| Pre-existing foreign owner | Owner differs from the current execution context before removal. Quarantine records ownership failure and returns with `detached=false`. | Zero removal/disconnect in this path. The report does not infer how an upstream caller allowed such ownership to arise. |
| Late expiry after accepted handoff | `handed_off=true` is written before late checks at lines 99-100. Inner/outer cleanup both exclude handed-off connections, including when a waiter obtains ownership after `M` unlocks. | Response suppression does not revoke the transferred adapter. Actual deadline delivery, transaction commitment and HTTP mapping require unchecked wrappers/helpers. |

## Design tradeoffs and limits

**Linearization versus progress.** The repair makes the checkin acceptance decision and exceptional owner/removal decision within one pool-monitor interval. This prevents a waiter lease between nil-owner observation and action. Releasing `M` before the removal attempt would reduce contention but recreate the accepted defect; no such change is recommended. The `handed_off` flag records the writer's accepted transfer before another thread can act on it; the pool's actual enqueue/lease implementation remains a dependency assumption.

**Latency is not a cleanup deadline.** In the exceptional path, time holding `M` includes removal and any synchronous replacement connection creation. Analytically, its duration includes `T_remove + T_replacement + T_inspection`; no absolute bound follows from the visible deadline checks. Other requests can wait for this interval, and an expired request can continue cleanup. The amendment explicitly accepts this cost to avoid owner corruption. This report supplies no measured latency, throughput, timeout guarantee or recommendation for a new timeout/pool subsystem.

**Proof of detachment versus recovery.** Refusing disconnect when ownership or queue state is unknown protects a possible borrower, at the cost of possible native-resource retention. Refusing a second removal avoids pretending that a partially completed public operation is safely repeatable. Neither decision proves that an unresolved pool is healthy. The private seam is small, read-only, pinned in comments/narrative, and needs validation against the exact Rails version whenever that dependency changes.

**Scope and complexity.** The request-local two-boolean disposition record and separated removal/proof/disconnect responsibilities fit this repair; no independent backend or new dependency is visible in the slice. Registration/queue scans are linear in pool/queue size and occur under the pool monitor; configured maximum size is outside coverage. No repeated database query or measured hot-path bottleneck is established here. Fixing defect 1 should add only the state needed to preserve existing primary errors through abnormal cleanup transfer.

**Exception safety.** Ordinary exceptions are deliberately collected without emitting their messages, while cleanup maintains ownership safeguards. Ruby nonlocal transfer is a different control-flow mechanism from an exception; catching `Exception` alone cannot provide the stated original-error guarantee for the combined schedule in defect 1. Resource safety and preservation of the original failure are separate obligations.

## Checklist and authored test assessment

| Area | Review result within coverage |
| --- | --- |
| Feature purpose and state integrity | Lock nesting and post-checkin validation support the accepted handoff/disposition policy; primary-error defect 1 remains. No full-application correctness claim. |
| Null/empty inputs and limits | Checkout failure leaves `connection=nil` and skips outside disposal; a non-`WriteResponse` result is rejected. Nil owner is considered only under `M`. Invalid queue shapes/entries remain unknown; an empty valid array is handled. External request validation and configured pool limits are unchecked. |
| Foreign owner and authorization | Foreign ownership blocks removal/disconnect. Execution-context ownership is not mailbox authorization; actual tenancy/auth boundary checks are outside these lines. |
| Failures and nonlocal exits | Normal raised-error and successful-cleanup throw paths traced; combined removal-throw/primary-error defect recorded. Partial eviction and unknown inspection are explicitly unresolved. |
| Maintainability and comments | Responsibilities and state flags are local and domain-relevant. AIDEV notes explain lock order, late expiry, private seam, unknown state and native-I/O cost. No broad redesign or unsupported abstraction recommended. |
| Boundary/privacy handling | Private queue object/array/entry types are checked. Cleanup logging uses phase, error class and generated correlation, not exception messages/SQL. External bodies/env/secrets and logger implementation are unchecked. |
| Regression source: lines 7-74 | Two schedules author monitor ownership and absence-of-acquisition assertions, observe a waiting borrower, require a different adapter after rejection, and count one removal/disconnect. They assert the native disconnect is outside `M`. These are authored assertions, not observed passes. |
| Regression source: lines 76-115 | Authors expiry after observed waiter acquisition, checks zero removals/disconnects and retained registration, and calls marker/next-tenant helpers. The actual outside-monitor deadline check and helper semantics are unchecked dependencies. |
| Race-test strength | Monitor-ownership assertions are snapshots; the implementation's lexical lock region supports continuity. Helper-controlled scheduling, bounded teardown and actual real-pool behavior cannot be certified from these two test slices alone. |
| Documentation | Repair narrative documents pins, limits, authored test inventory and NOT_RUN status. The original-error preservation claim needs the defect-1 guard/regression before it covers the combined fault schedule. Root owns shared documentation and `code-reviews.md`. |
| Standards/formatting | Conformance checked for the scoped locking, boundary validation, deliberate errors, comments and test intent. Formatting belongs to linters; no style audit or lint/typecheck result is claimed. |

## Runtime status and unchecked dependencies

**Runtime NOT_RUN:** no host application test, syntax check, linter, typecheck, Docker action, SSH action, server, benchmark, dependency installation, ultrareview, child agent or commit was performed. All described interleavings are analytical. No runtime pass is inferred from code or the author's report. Only this named report was written; no application source or shared ledger/state file was modified.

Dependencies deliberately left unchecked:

- `session_writes.rb:1-65,182-206`, including any deadline/interrupt wrapper, response mapping, transaction/operation ledger and other private helpers.
- `RequestDeadline` implementation, delivery/masking of pending interrupts, and whether `within` supplies the outside-monitor deadline check used by the expiry test.
- Exact Rails 8.1.4 pool/queue/adapter implementations, reentrancy, lease locking, callback behavior and native replacement I/O; no dependency source was fetched or inspected.
- New disposition test lines 116-286, both test helpers, existing pool tests and their real PostgreSQL setup/cleanup. Names such as `assert_next_tenant_request` and `marker` do not establish their semantics or results.
- RBS/seam declarations, Steep configuration/results, DB/tenant/session/GUC isolation, real 2xx/409 integration, normal-path runtime, browser/native clients and frontend/API alignment.

Root should obtain the narrow defect-1 regression/repair, then run the pinned Docker checks and full affected real-pool suite, including the other reviewers' assigned failure paths. Preserve the accepted distinction between unresolved eviction and successful detachment, and record runtime evidence separately from this review.

**Defect accounting:** 0 CRITICAL, 0 HIGH, 1 MED, 0 LOW; total **1**. Density: `1 / 231 * 1000 = 4.33 defects/KLOC`. This assignment overlaps other reviewers' possible coverage and must not be blindly added to a unique project-wide LOC denominator. Design/runtime limitations above are not counted as additional defects.
