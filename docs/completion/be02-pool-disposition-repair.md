# BE02 WD-DESIGN-01 pool disposition repair

Implementation handoff for independent review. Runtime: **NOT_RUN**. This is not an independent review or a certification of correctness.

<!-- AIDEV-NOTE: Root owns fleet-02 execution, independent review, shared state and the final acceptance decision. -->

The coordinator's `be02-pool-disposition-amendment.md` and independent `review-be02-write-deadline-design.md` were read before code changes. This bounded repair follows the adopted exceptional-path adapter-then-pool locking policy; it does not add live sending, activation, deployment or a general pool framework.

Execution identity: Orca dispatch `ctx_1c225981720f`, task `task_1b6e91ca0ad9`, launch receipt `ab7c204a-7b57-466e-bf78-2fbf1f382281`. `worker-show` reported requested/effective `gpt-6-astra`, reasoning effort `low`, and matching provider projection. The retained start stage was `turn_start_unobserved`; no provider session identifier was exposed. This states the available launch evidence rather than claiming stronger provider attestation.

No host test, Docker command, SSH command, commit, other agent or runtime validation is performed by this worker. Root must run the pinned Rails 8.1.4 / PostgreSQL 17.6 suite in Docker on fleet-02 and obtain independent bounded review. Obsidian was unavailable in the adopted design decision; no new simulation or consultation is claimed here.

## Implementation and evidence

`SessionWrites` establishes an `ensure` inside the adapter-then-pool protected checkin region. Rejected/partial checkin and nonlocal exits enter quarantine before that region unwinds. Pre-checkin failures use the same protected owner validation/removal path. A small request-local disposition record prevents outer cleanup from attempting removal again, including when removal throws or raises. A pre-existing foreign owner is refused without removing or disconnecting its adapter.

Fully returned checkin is accepted only with registration, nil owner and no open transaction; the handoff flag is written under the monitor before checking late expiry. The response can then be suppressed without disposing the transferred adapter. Exceptional cleanup makes one public `remove` call, records its exception, and checks current ownership plus both registration and queue absence under the same monitor. Disconnect happens outside the pool monitor only after proven detachment, including replacement failure after eviction. Original primary errors and sanitized phase/class/correlation logging are retained.

The coordinator explicitly approved the new test path and read-only private inspection in the reply to this dispatch's blocking `ask`, then updated the root amendment. The private seam is Rails **8.1.4** `ConnectionPool::Queue` / `@queue`, reached through pool `@available`. Production checks the queue class, array shape and adapter element types; unavailable, malformed or throwing inspection remains unknown. It never writes either private structure. The RBS seam returns `Object`, requiring narrowing before use. Sources: [pinned Rails queue](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool/queue.rb), [pinned Rails pool](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb).

Accepted limits remain material. An outer monitor spans exceptional replacement creation and can delay other requests during native I/O; there is no absolute cleanup deadline. A failed eviction can leave the rejected adapter queued or registered; that is logged unresolved state, not successful quarantine or a healthy reusable pool. Unknown inspection can leave a detached native connection open because disconnect cannot be justified. No fallback queue mutation, second removal attempt, automatic pool rebuild or false claim of recovery is added. The fault tests explicitly repair their own injected fixture only after asserting this unresolved outcome.

## Authored regression inventory — all NOT_RUN

| Area | Source evidence authored for root execution |
| --- | --- |
| Both old race windows | New disposition test lines 7-74: observe a real size-one waiter before checkin, inject failure after real enqueue, assert the same monitor covers nil-owner observation and subsequent removal in separate schedules, observe a different registered adapter delivered, and verify one cleanup removal/disconnect. |
| Fully safe transfer then expiry | New test lines 76-115 forces expiry after the actual waiter owns the transferred adapter; no remove/disconnect and a durable committed-409 marker. Existing pending-expiry callback test now expects registered live safe handoff rather than disposal. |
| Callback anomalies | New lines 117-170 exercise before/after owner clear crossed with unregister-and-return/error/throw, real waiters, exact primary preservation, one cleanup removal distinct from the callback's removal, and no rejected/unregistered delivery. Lines 269-285 cover throws without unregistration. Existing error callbacks without unregistration remain. |
| Eviction versus replacement | New lines 172-226 inject failure before remove, before queue deletion after registration deletion, after queue deletion, and after real remove. Existing real Rails replacement failure with observed waiter now asserts one removal and the accepted outer monitor. |
| Unknown queue seam | New lines 228-267 inject missing queue, non-array contents, invalid entry and throwing read; these must preserve the primary, log sanitized inspection evidence, and never authorize disconnect. |
| Ownership, cleanup and continuity | Existing foreign-owner test now explicitly asserts zero removes/disconnects; existing disconnect/logger failures, real 200/409, commit ambiguity, SQL/Ruby/pending expiry and next-tenant/session/GUC checks remain. New cases reuse the real PG isolation helper after successful disposition or explicit fixture repair. |
| Schedule bounds | New waiter helpers use observed pool waiting and queue arrival/release barriers, bounded joins and failure teardown. The existing polling helper sleeps only between observations of an actual condition; schedules are not selected by elapsed sleeps. |

Root must run syntax/lint, strict RBS/Steep and the full affected Docker suites on fleet-02, including the new `write_boundary_pool_disposition_test.rb`. No local syntax check, typecheck, linter, unit/integration test or runtime experiment was run. Implementation reading is not an adversarial review assignment. WD-DESIGN-01 remains pending independent re-review and runtime evidence: historical finding **1 HIGH / 295 reviewed LOC = 3.39 defects/KLOC**; post-repair defects/density **not measured**, not zero. Root owns `code-reviews.md` and shared state updates.

## Source manifest and bounded review handoff

Physical LOC includes blank/comment lines, measured with `ReadAllLines`; SHA-256 is over exact file bytes. Paths below are relative to this BE02 workspace. These files were edited without committing; pre-existing concurrent work was not reverted.

| File | Physical LOC | SHA-256 |
| --- | ---: | --- |
| `apps/server/lib/elevateo/session_writes.rb` | 206 | `65f7d28b75827d8cd7e30c189d8ddea930772d54d8d61511517968cf07b6cb00` |
| `apps/server/sig/session_writes.rbs` | 29 | `30d8a476926f983d3d897bb926afbcb436f1e7b8d800f28d1740b7b82f696d54` |
| `apps/server/sig/rails_seams.rbs` | 162 | `634de9e85515e003254c31cbb1c3d9a91427ee69e3a8064a5c1acdf129b37cc7` |
| `apps/server/test/be_02/write_boundary_pool_test.rb` | 419 | `c167c5af5018e28f34122845c15da1fb646a8e214b0fa3a23ff8299fd0f320a8` |
| `apps/server/test/be_02/write_boundary_pool_test_helper.rb` | 155 | `434e753e3b600d04092cd3424c9931681350fc89d9a89771745945e94e9d95d5` |
| `apps/server/test/be_02/write_boundary_pool_disposition_test.rb` | 286 | `49525648ebeb1f0701fc1c2594d8bcf5e42965491225ab031dc4bcab8043faaf` |
| `apps/server/test/be_02/write_boundary_test_helper.rb` | 125 | `5d5cda9b3a642c45a3bdc5fd2517419355b2a90cb692cc58a9daab4f392c1fa2` |

Suggested **fresh** reviewers below are a handoff, not spawned or completed reviews. Each listed pass is at most 200 physical lines; each reviewer totals at most 400. Provide the full user adversarial rubric, root amendment and standards as context; do not count this implementation as its own independent review. Formatting belongs to root's lint pipeline.

| Reviewer | Ordered passes (one slice per pass) | Total source LOC |
| --- | --- | ---: |
| Lifecycle and types | `session_writes.rb:1-113`; `session_writes.rb:114-206`; `sig/session_writes.rbs:1-29`; `sig/rails_seams.rbs:1-162` | 397 |
| New adversarial schedules | `write_boundary_pool_disposition_test.rb:1-170`; `write_boundary_pool_disposition_test.rb:171-286` | 286 |
| Existing failures and real-pool helper | `write_boundary_pool_test.rb:1-143`; `write_boundary_pool_test.rb:144-214`; `write_boundary_pool_test_helper.rb:1-155` | 369 |
| Existing deadlines and harness | `write_boundary_pool_test.rb:215-353`; `write_boundary_pool_test.rb:354-419`; `write_boundary_test_helper.rb:1-125` | 330 |
| Dedicated deep design tradeoffs | `session_writes.rb:66-181`; `write_boundary_pool_disposition_test.rb:1-115` | 231 |

The dedicated design pass should challenge lock ordering, nonlocal unwind, single-attempt disposition, the fail-closed proof seam, healthy-transfer expiry, unresolved eviction and native replacement latency against the accepted amendment. No fresh consultation or Obsidian simulation is claimed. Documentation may be reviewed separately as a sub-200-line pass.
