# BE02 pool schedules: bounded adversarial review

Date: 2026-10-14. Task: task_281864a8ce18; dispatch: ctx_54150148a208.
Reviewer: Codex, actual dispatched model `gpt-6-astra`, effort `low`, confirmed by coordinator from Orca dispatch metadata. No alternate model or subagent used.

## Scope and evidence

Source: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/apps/server/test/be_02/write_boundary_pool_disposition_test.rb`.
SHA256 before inspection and after both passes: `49525648ebeb1f0701fc1c2594d8bcf5e42965491225ab031dc4bcab8043faaf` (matches supplied pin).
Pass 1: lines 1-170, 170 physical LOC. Pass 2: lines 171-286, 116 physical LOC. Total: 286 unique implementation/test LOC, including comments and blanks. No other implementation/test source inspected.
Context: root AGENTS.md and .planning/STANDARDS.md read. Large combined README/state/documentation context output was truncated; no claim of full documentation audit. This assignment permits only this report modification.
Runtime: **NOT_RUN**. No host application tests, Docker, SSH, web server, installs, commits, subagents or ultrareviews. Formatting delegated to linters; not evaluated here.

## Numbered defects

1. **MEDIUM — protection before checkin is not deterministically asserted.** Lines 14-20 call the real checkin before raising; monitor ownership is only asserted later at owner observation (27) or removal (37). Likewise, the clean-transfer wrapper at 80-83 does not assert monitor ownership before `original.call`. A regression that publishes the adapter outside the protective monitor and reacquires the monitor before inspecting ownership can pass when the request thread wins scheduling against the waiting thread. A waiter-count barrier proves a queued waiter, not that this waiter actually crossed the publication/observation window. Thus the named before/after schedules do not deterministically catch loss of the coordinator-required pre-checkin protection. Minimal repair: assert `@pool.mon_owned?` for the target immediately before calling real checkin in the relevant wrappers; retain current waiter and later monitor assertions. If continuous monitor ownership is part of the acceptance claim, add a bounded explicit interleaving or monitor-transition observation to distinguish release/reacquire from continuous protection. This is a regression-test coverage defect, not proof that the uninspected implementation is wrong.

Defect count: **1** (MEDIUM). Defect density: **3.50 defects/KLOC** (1 / 286 * 1000). Findings are static, not runtime failures.

## Checklist and assertion strength

- Real waiter schedules: lines 50-51 and 99-100 request a waiter and wait for pool waiting count 1; acquisition is bounded at this call site by `Queue#pop(timeout: 2)`. Actual one-slot setup and helper implementation are outside scope.
- Owner safety: rejected-checkin tests assert nil owner while holding the pool monitor, replacement adapter identity, one remove/disconnect, inactive original, and preserved marker (25-62). This verifies endpoint observations but has the pre-checkin gap above.
- Safe completed transfer: lines 89-92 force expiry only after checkin and outside the monitor, require the exact target to have transferred, and require a foreign owner. Lines 96-108 expect AuthError, zero remove/disconnect, retained registration, and committed marker. This is synthetic deadline expiry, not evidence of native timeout interruption.
- Error and nonlocal exit: six combinations of before/after checkin callbacks and normal callback completion/error/throw (117-169) assert exact primary exception or throw payload, owner phase, replacement lease, one cleanup remove, inactive/unregistered target, and secret exclusion. Additional throw cases without callback removal appear at 269-284. The `:return` case is normal lambda completion, not an enclosing-method nonlocal Ruby return test.
- Partial removal: lines 172-225 cover failure before removal, before queue deletion, after queue deletion and after removal, asserting single cleanup removal, disconnect discrimination, primary preservation and redacted logs. Registration-only removal is distinguished from queue detachment. Test-only fixture repair is explicitly documented and occurs after assertions.
- Null/malformed boundaries: lines 228-266 cover missing available queue, nil queue array, invalid entry and inspection exception; all forbid disconnect on unknown detachment and preserve business error identity.
- Disconnect ordering: this file checks monitor release at disconnect (44), counts, eventual activity and membership. It does not directly assert both registration and queue absence inside every disconnect hook. Full ordering proof depends on implementation review and helper semantics, not just these endpoint checks.
- State isolation: each callback is removed in ensure and selected monkeypatches restored. Correct waiter teardown and remaining instrumentation lifecycle depend on helpers. No independent claim of leak-free cleanup.
- Security: injected secret-payload exclusion is asserted. Authorization and external application-input validation are outside this test file.
- Maintainability/performance: small scenario matrices are appropriate; no hot-path database-loop claim follows from test loops. Existing AIDEV notes explain intent. No style findings.
- Documentation and standards: real PostgreSQL and deterministic failure schedules are the stated standard; actual runtime and backing setup remain unverified by this bounded assignment.

## Design limits and unchecked dependencies

Monitor protection trades a short serialized pool bookkeeping section for safe ownership/disposition. Disconnect outside the monitor limits blocking other pool users; unknown detachment correctly requires conservative non-disconnect assertions. These are analytical observations against supplied intent, not executed simulations or Obsidian evidence. No Obsidian connection was used or claimed.

Uninspected: `write_boundary_pool_test_helper`, actual write boundary/disposition/deadline implementation, Rails pool and callbacks, adapter implementation, pinned Ruby Queue timeout behavior, database setup, fleet tests and documentation beyond available context. Consequently native checkout timeout duration/error propagation, actual one-slot setup, target selection, wait_until deadline, finish/stop waiter cleanup bounds, restoration of instrumentation, and queue integrity helper strength require coordinator-provided contracts or another bounded assignment. Coordinator contract request was sent through orchestration ask; completion addendum below records the response when available.


## Coordinator contract addendum

The coordinator answered the existing orchestration question before completion. These are supplied contracts, not extra reviewed source or runtime evidence:

- Setup uses a separate real Rails 8.1.4 API pool, size one, checkout_timeout 1 second, reaping disabled; verifies API role/task database and checks in the original adapter.
- protected_call selects that pool and captured logger, invoking SessionWrites.transaction with actual identity/context/version/CSRF metadata and the supplied deadline.
- wait_until has a monotonic 2-second bound with 5ms polling. pool_waiter performs native checkout(3), verifies registry membership/current ownership, publishes the adapter, then waits on release with a 3-second timeout. It checks active state and SELECT 1, and checks in via ensure.
- finish_pool_waiter releases, asserts join within 3 seconds and invokes waiter.value to propagate failures. stop_pool_waiter releases, joins for 3 seconds, kills if alive, then joins for 1 second. Termination success after the final join was not supplied as an asserted guarantee; no leak-free runtime claim is made.
- instrument preserves a bound original Method and forwards arguments/keywords/block. Restoration is performed by test ensures rather than an independently verified automatic registry.
- assert_pool_integrity checks at most one registered connection and no availability entries absent from registry while holding the monitor. assert_next_tenant_request checks residual thread tenancy/deadline, fresh org/session SQL claims, owner/no-transaction state, integrity and one PostgreSQL backend.

These contracts support genuine pool waiting and bounded native checkout, but no assigned scenario intentionally exhausts that native checkout timeout and verifies its exception/cleanup. The two-second acquisition pop is an observer timeout, and the synthetic deadline exception is not a native database/pool timeout. Reported coverage must keep those distinctions. The contracts do not resolve defect 1: a waiting thread need not win scheduling before the request thread reacquires the monitor.

The coordinator separately identified an out-of-scope design-review concern involving a nonlocal remove throw replacing a primary checkin error. It is not counted as an independently discovered defect in this file, and no extra source was inspected to adjudicate it. Full-project integration and runtime acceptance remain outside this assignment.
