# BE02 pool unwind repair: final bounded static review

Result: **0 new defects found in 349 unique physical implementation/test lines; 0.00 defects/KLOC. Runtime: NOT_RUN.** The two prior MED findings are addressed in the assigned source. This is source-level closure, not a test pass or full-application acceptance.

<!-- AIDEV-NOTE: Frozen review scope only; coordinator owns fleet execution, shared review ledger and acceptance. -->

## Identity and scope

- Date: 2026-10-14 Australia/Sydney.
- Worker `term_45643a04-2bff-498c-b608-c923a2c9e7be`; task `task_295ca5311c06`; dispatch `ctx_ceb838342000`.
- Actual exposed execution identity: Codex `gpt-6-astra`, effort `low`. Orca worker-show requested/effective launch settings and terminal preview agree. Projection reports live; launch stage retains turn_start_unobserved. No independent provider attestation claimed.
- Read applicable project AGENTS.md and .planning/STANDARDS.md in both coordination and source roots, the supplied full review rubric, source docs/completion/be02-pool-unwind-repair.md, and coordinator review-be02-pool-design.md / review-be02-pool-schedules.md. No nested apps AGENTS.md was returned by filename discovery.
- Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
- All hashes matched supplied pins before inspection and again immediately before report creation. No source drift observed.

| Pass | Exact source range | Inspected physical LOC | Full file LOC | Verified SHA256 |
| --- | --- | ---: | ---: | --- |
| 1 | apps/server/lib/elevateo/session_writes.rb:1-180 | 180 | 219 | 515cd4a86158c37e3f6fe82faee46ed306995a11314f4864f48e0e154836a84c |
| 2 | apps/server/lib/elevateo/session_writes.rb:181-219 | 39 | 219 | 515cd4a86158c37e3f6fe82faee46ed306995a11314f4864f48e0e154836a84c |
| 3 | apps/server/test/be_02/write_boundary_pool_unwind_test.rb:1-85 | 85 | 85 | eb7cc7db261d9a9caa003444eeb291ca80ae9c4306cb6b4924856610052beb86 |
| 4 | apps/server/test/be_02/write_boundary_pool_disposition_test.rb:1-25,73-92 | 45 | 288 | 99e87489420c5bd99a02e042b61f011a8d3a1a8677d0bf77426547a4ce209151 |

Total 219 + 85 + 45 = **349** unique physical lines, including comments/blanks. Each read/review pass was at most 180 lines. No other implementation/test lines inspected; contextual reports are not additional independent source coverage.

## Numbered findings and prior-defect disposition

No new numbered defects. Defect count: 0 CRITICAL, 0 HIGH, 0 MED, 0 LOW. Density: 0 / 349 * 1000 = **0.00 defects/KLOC**. Overlapping earlier review coverage must not be added blindly to a project-wide denominator.

1. **Prior design MED: addressed statically.** session_writes.rb:103 captures the pending checkin exception before quarantine; lines 106-108 restore the same object even when removal transfers control nonlocally. Removal's ensure at 162-175 records a fixed cleanup error and still inspects detachment. The inner raise unwinds both synchronization blocks before outer ensure calls discard_connection at 116. Started disposition prevents another removal (122); positive detachment gates the single disconnect (126-128). The new test at 7-50 installs a matching outer catch and asserts identical RuntimeError, one removal, one disconnect, monitor release and both registry/queue absence before disconnect. Minimal repair remaining: none established in this scope; runtime execution remains required.
2. **Prior schedules MED: addressed statically.** disposition test lines 15 and 82 assert target monitor ownership immediately before real checkin at 16 and 83. These snapshots address the requested pre-publication assertion gap. Continuous monitor ownership is supported by the lexical implementation region at session_writes.rb:83-111, not dynamically proved by snapshots alone. No further source change recommended for this bounded requirement.

These are closure entries for inherited findings, not two new defects or evidence that the tests passed.

## Analytical control-flow checks

| Schedule | Static result |
| --- | --- |
| Checkin raises primary; real removal evicts then throws | Primary is captured before removal. Removal ensure records payload-free failure and proves detachment. Inner ensure raises that primary, replacing the cleanup throw. Pool and adapter synchronization unwind; outer disposal reacquires adapter lock, skips repeat removal and disconnects outside the pool monitor. Logging does not replace the primary when successful. |
| Valid callback throw; no raised primary; cleanup succeeds | Captured primary is nil. Removal returns normally, detachment succeeds, and failures stay empty. Neither inner ensure nor discard raises, so the original catch receives its payload. New test lines 53-83 asserts this path, one removal/disconnect and empty logs. |
| Checkin accepted then deadline expires | handed_off is set before late deadline checks. Both quarantine and outer discard exclude accepted transfers, preserving a possible waiter's ownership. |
| Removal raises normally after detachment | Removal exception is recorded, detachment inspection still runs, and a pending primary remains primary. Disconnect depends on positive detachment rather than successful removal return. |
| Partial removal or invalid queue inspection | A retained queue entry or unknown inspection prevents positive detachment and thus disconnect; started state prevents a retry. This is unresolved disposition, not a healthy-pool guarantee. |

These are manual source traces, not executable simulations or Obsidian results. Existing coordinator design review records the unavailable Obsidian connection. This review does not introduce a new design choice or claim an Obsidian run.

## Rubric and standards checklist

| Area | Assessment within coverage |
| --- | --- |
| Purpose/state coupling | The narrow error-preservation repair retains adapter-before-pool locking, one removal attempt, positive detachment and out-of-monitor disconnect. Response acceptance is separated from late expiry. |
| Null/empty/max cases | Nil checkout result after failure cannot enter disposal. Empty target arrays and valid empty availability arrays are supported by the visible operations. Non-WriteResponse and malformed metadata/queue shapes fail deliberately. guard_users assumes an internal array contract; its length cap is two and UUID mapping precedes that cap. Caller validation and maximum configured pool size were not inspected; no claim of arbitrary nil/hostile caller support. |
| Authorization and external inputs | Context/version string checks, CSRF comparison, organization match and session check calls are visible. SQL arguments use binds and target UUID validation. Actual auth/tenancy/session/UUID validator implementations are unchecked; full authorization correctness is not certified. |
| Error handling/privacy | Fixed phase strings, class names and generated correlation are logged, not exception messages or throw payloads. New regression asserts removal ContextError class and secret-payload exclusion. Logging sink exceptions retain a raised primary. General logger/disconnect nonlocal exits are not newly guaranteed by this repair. |
| Tests | New tests directly author the repaired fault schedule and preservation counterexample. Exact object identity, counts, ordering, membership and sanitization are asserted. Existing helper calls request committed marker/pool integrity/next-tenant verification but their implementations were not inspected here. No inferred pass. |
| Maintainability/comments | Local boolean removal completion and retained primary are sufficient for the bounded fix. AIDEV notes explain nonlocal unwinding and lock/disposal reasons. No new dependency, generic catch framework or duplicated domain backend. Style/formatting delegated to linters. |
| Performance | Registry/queue membership validation is linear in pool size under its monitor. Exceptional removal can perform replacement I/O while serialized; no absolute cleanup deadline follows. No measured latency or throughput claim. |
| Documentation | Repair narrative accurately distinguishes authored assertions, accepted partial-removal limits and NOT_RUN. Shared README/state and code-reviews.md remain coordinator-owned; this assignment writes only this report. |
| Strict typing | Visible Ruby type comments remain; RBS/typechecker declarations and results are outside coverage. No typecheck success claimed. |

## Design limits and remaining verification

The accepted design prioritizes ownership correctness over monitor availability during exceptional removal. Moving removal outside the monitor would reopen the nil-owner race; retaining it can block waiters during native replacement I/O. Positive proof before disconnect protects a possible borrower but may retain a native resource when inspection fails. The accepted unresolved partial-removal state can still leave the pool unusable or unsafe to reuse; this review does not upgrade it into a recovery guarantee.

Unchecked dependencies: exact Rails 8.1.4 pool/queue/adapter locking and callbacks; Ruby runtime unwind behavior in the deployed version; RequestDeadline and Tenancy internals; WriteResponse/ReadResponse, sessions, crypto, SQL function, WriteInput/AuthInput and WriteStatements implementations; test helper setup/instrumentation/teardown and all disposition test lines outside 1-25 and 73-92; RBS and type configuration; broader integration/auth/database isolation; frontend/API/native client behavior. Prior schedules review supplies helper contracts, not independently inspected helper source or runtime evidence.

**Runtime NOT_RUN:** no host application tests, syntax checks, lint/typecheck, Docker, SSH, server, installs, commits, ultrareviews or subagents. No Docker resources created. Coordinator should run the pinned Docker checks and affected real Rails/PostgreSQL suite including the new unwind file, preserving runtime evidence separately from this static closure. Only this named report was written.
