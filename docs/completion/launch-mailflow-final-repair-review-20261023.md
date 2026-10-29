# Launch mailflow final repair review

Review date: 2026-10-24. Task `task_c3ab5cf8c567`, dispatch `ctx_60c5a9267d34`.
Read-only adversarial source review against the supplied full rubric and project standards;
only this report was written. No tests, builds, application execution, production action,
formatting pass, nested review or broad architecture review was performed.

## Exact coverage and receipts

Physical lines, including comments and blank lines, are counted conservatively.
Each file is a separate packet below 200 lines. Actual current lengths differ from
the dispatch estimates of 199 and 108; no additional source was substituted.

| File under apps/server/test/support/launch_mailflows/ | Reviewed inclusive slice | Lines | SHA-256 of complete file |
| --- | --- | ---: | --- |
| app_chain_test.rb | 1-180 (entire file) | 180 | 528e9cb6e38ac45e538dac43cc84df7936bb23c64aa550a2eee1fe13d37e9766 |
| http_chain.rb | 1-104 (entire file) | 104 | 535553c74f9de3980be2491b801fd4d965c56f2ae89bcdd99dc257f90040ef7f |
| cleanup.rb | 1-16 (entire file) | 16 | 8c469492b4cdd4ba2b67a290b553ffe6daf074b38996356cfb7259a4e7d20ef9 |
| cleanup_test.rb | 1-24 (entire file) | 24 | 37af0d57c450cbf766063fd57fede6666368c80eb47c68e81f7d6b58a773b5e2 |

Total unique reviewed source: **324 lines**, below the hard 400-line limit.
Cleanup coverage is 40 lines, below its 93-line allocation. All four hashes match
the receipts in `docs/completion/launch-mailflows-20261023.md`, read as evidence context only.

## Findings

**Zero actionable defects found; defect density 0 / 324 x 1000 = 0 defects/KLOC.**
This is bounded repair-source acceptance, not whole-application acceptance or independent runtime verification.

- CSRF: `http_chain.rb:44-56` sends a nonempty 56-character wrong token with otherwise
  current session/context/origin headers, requires exactly HTTP 400 and `request_invalid`,
  and independently queries SQL for zero rows at the attempted draft ID before the valid
  create. Subsequent authenticated writes require HTTP 200 and persisted version 2.
  The persistence oracle establishes rejection of a new draft without creation; it does
  not test a wrong-token update against an already existing draft.
- Authenticated mailbox denial: `http_chain.rb:31-38,62-73,84-102` establishes organization
  membership/operator role before granting the private mailbox. With that authenticated
  session, inbox exclusion, exact 404/`not_available` on reply creation and SQL absence
  are asserted. The same actor receives the mailbox grant afterward and successfully
  sees the imported thread and writes its own draft. This is stronger than an anonymous
  rejection check; direct thread-detail denial is not asserted by this packet.
- Original sender and threading: `app_chain_test.rb:80-106,119-158` submits the initial
  message, waits for persisted IMAP import, checks actual worker acceptance, and reads
  the reply at the original sender's mailbox. It requires the original receiving mailbox
  as From, the imported original RFC ID as In-Reply-To, and References equal to that ID.
  `Array(...)` handles scalar and array parser results without weakening the expected
  identity. The fixture tests one original message, not preservation of a preexisting
  multi-ancestor References chain.
- Retrieval bounds: `app_chain_test.rb:137-159` advances a UID cursor through batches
  of at most 50, tolerates empty batches, closes opened sessions with ensure and has a
  monotonic wait deadline. Adapter-level ordering, UID validity and individual call
  timeout enforcement are dependencies outside this review; no claim is made about them.
- Independent cleanup: `app_chain_test.rb:59-66` supplies receipt deletion, account
  deletion, private credential-directory removal and superclass cleanup as distinct
  callbacks. `cleanup.rb:5-14` catches each StandardError and continues before raising
  the first failure with the second as cause. `cleanup_test.rb:7-22` covers ordered
  success and simultaneous SQL/filesystem failures with the parent still attempted.
  Empty callbacks are naturally a no-op; malformed callbacks fail explicitly. Fatal
  exceptions outside StandardError and retention of more than two failure diagnostics
  are not promised. Actual superclass cleanup behavior is outside the reviewed source.
- State and boundaries: `http_chain.rb:75-82` restores the original SQL actor/session
  fields through ensure, including when approval/delivery raises. SQL values use bound
  parameters in these packets. HTTP error assertions withhold response bodies, and the
  private rewritten credential bundle is created with mode 0600. Null/missing synthetic
  fixture data generally fails loudly via fetch or required setup rather than silently
  converting a failed fixture into acceptance. These are isolated harness assumptions,
  not a replacement for product boundary validation.

## Evidence limits and remaining coverage

The context report records attempt x passing 80 units/526 assertions, strict types,
targeted lint, migrations, 26 database cases/182 assertions, four real protocol cases/424
assertions, and one application case/41 assertions, followed by exact cleanup and
independent absence. Those are the implementation lane's recorded results; this reviewer
did not inspect remote logs, execute Docker, or independently replay them. Matching
working-tree receipts establish source correspondence to the documented receipts only.

No source remains unreviewed within the four assigned files. Unreviewed dependencies
include HTTP support/CSRF validation, inherited database setup/approval/teardown,
production authorization and transport code, IMAP ordering/timeout behavior, fleet
resource cleanup and orchestration scripts. No source outside the 324-line manifest
was inspected for this review. No new claim is made for browser acceptance, HTTP
approval, scheduler execution, outbound revocation on the wire, controls-lane inventory,
caps/warmup, production readiness or release. Dedicated design review and its ownership
remain with the coordinator; this dispatch did not simulate tradeoffs or write Obsidian.
