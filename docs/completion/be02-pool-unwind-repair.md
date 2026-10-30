# BE02 pool removal unwind repair

Source-only repair for task `task_4dadde648127`, dispatch `ctx_a811e541425e`.
Runtime, syntax, lint, typecheck and tests: **NOT_RUN**. Root owns Docker execution and independent review.

<!-- AIDEV-NOTE: This report records authored assertions and source hashes, not runtime acceptance. -->

## Change and accepted limits

The protected checkin ensure retains its pending exception before quarantine and restores that identical object in an inner ensure. Thus a removal throw cannot replace the checkin error: quarantine first completes detachment inspection, the monitor unwinds, and existing outer disposal disconnects the proved-detached adapter before the error escapes. Without a raised primary, successful quarantine leaves the caller's valid throw untouched.

The removal attempt now distinguishes normal/rescued completion from nonlocal departure. Its ensure appends a fixed ContextError cleanup record for nonlocal departure; existing logging emits only phase, class and generated correlation. It never logs the thrown value or exception message. There remains one public removal, adapter-before-pool locking, no private pool mutation and disconnect only following positive detachment outside the monitor. Accepted unresolved partial-eviction behavior is unchanged; this is not a broader cleanup-control-flow redesign.

No signatures or dependencies changed. Existing pool helper is untouched. Coordinator message `msg_e774f3c42f33` separately authorized the two pre-checkin monitor assertions in the existing disposition test after its reviewer released ownership. These assert monitor ownership immediately before publication; continuous ownership is supported by lexical implementation, not dynamically proved by these snapshots.

## Exact source handoff

Paths are relative to the BE02 Codex project. Hashes are SHA256 over final file bytes.

| File | Changed final ranges | Final SHA256 |
| --- | --- | --- |
| `apps/server/lib/elevateo/session_writes.rb` | 103-109; 154; 158; 161; 163-166 | `515cd4a86158c37e3f6fe82faee46ed306995a11314f4864f48e0e154836a84c` |
| `apps/server/test/be_02/write_boundary_pool_unwind_test.rb` | New file, 1-85 | `eb7cc7db261d9a9caa003444eeb291ca80ae9c4306cb6b4924856610052beb86` |
| `apps/server/test/be_02/write_boundary_pool_disposition_test.rb` | 15; 82 | `99e87489420c5bd99a02e042b61f011a8d3a1a8677d0bf77426547a4ce209151` |

Before modification: session_writes SHA256 `65f7d28b75827d8cd7e30c189d8ddea930772d54d8d61511517968cf07b6cb00`; disposition test SHA256 `49525648ebeb1f0701fc1c2594d8bcf5e42965491225ab031dc4bcab8043faaf`, matching the design/schedules review pins.

## Authored regression assertions

- Real Rails 8.1.4/PostgreSQL size-one pool through the existing helper; no substitute fake pool.
- Real checkin completes, then raises a specific RuntimeError. The one real removal evicts, then throws to a matching outer catch. The identical RuntimeError must escape instead of the catch payload.
- Exactly one removal and one disconnect; removal under the monitor, disconnect outside it; both registry and queue lack the target before disconnect; original adapter becomes inactive.
- Cleanup log contains the fixed removal phase/ContextError class and excludes injected secret payloads. Committed marker remains visible; existing helper checks pool integrity and a subsequent tenant/session request.
- Separate after-checkin callback throw with no raised primary keeps its original symbol payload, performs one removal/disconnect and produces no cleanup log. Subsequent tenant/session checks remain authored.
- Existing rejected-checkin and safe-transfer schedules assert pool monitor ownership immediately before real target checkin, preserving all later waiter/monitor assertions.

These are source assertions, not observed passes. Root should include the new test file in its actual frozen Docker invocation and run the affected pool suite and type checks. No tests, builds, installs, SSH, Docker, commits, ultrareviews or subagents were run. No Docker resources were created. Shared README/state/review ledger remain coordinator-owned.

## Review accounting

This implements the design review's one MED defect (1 / 231 reviewed LOC = 4.33 defects/KLOC) and the separately authorized schedules review's one MED assertion gap (1 / 286 reviewed LOC = 3.50 defects/KLOC). These are inherited reviewer counts with overlapping coverage, not a new independent review or combined density. Independent closure and runtime acceptance are pending. Existing design simulations and Obsidian-unavailable limitation remain as recorded in the coordinator's accepted amendment; no new design decision or Obsidian result is claimed.
