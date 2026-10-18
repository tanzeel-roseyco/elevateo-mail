# REV874 Corin repair source review

Reviewed exact Corin commit `d4a34f45fe7a48fa885de5d12b3c5db1e163f513` in `completion-corin-mail819`, source only. Actual reviewer: Theo, Orca task `task_9bb6f241c3c0` / dispatch `ctx_20de00472465`, Codex `gpt-6-sol` per active worker projection (billing tier unverified). No Docker, app tests, database operations, live credentials, or mail operations were run. The earlier `e9ead71` isolated thread-read receipt (8 runs/90 assertions PASS) is historical evidence for another SHA and does not prove this database rollback or strict static check.

## Exact source-read ledger

Each read was at most 100 lines. **346 unique versioned LOC** were inspected, below the 350 task cap and hard 400. The exact diff was read first; overlapping diff context below is counted once.

| Source at `d4a34f4` | Inclusive lines | Unique LOC |
| --- | --- | ---: |
| `apps/server/lib/elevateo/read_response.rb` | 1–94 | 94 |
| `apps/server/lib/elevateo/thread_reads.rb` | 125–153 | 29 |
| `apps/server/sig/read_response.rbs` | 1–15 | 15 |
| `apps/server/test/be_02/thread_database_test.rb` | 205–285 | 81 |
| `apps/server/lib/elevateo/inbound/imap_sync.rb` | 1–68 | 68 |
| `apps/server/test/be_02/read_response_test.rb` | 50–85 | 36 |
| `apps/server/db/migrate/20261015000011_create_isolated_inbound.rb` | 20–35 | 16 |
| `apps/server/db/migrate/20261015000012_create_held_imap_ingress.rb` | 24, 27 | 2 |
| `apps/server/db/be02_collaboration/tables.sql` | 15, 34 | 2 |
| `apps/server/db/be02_threads/tables.sql` | 27, 40 | 2 |
| `apps/server/db/be02_drafts/tables.sql` | 18 | 1 |

The six assigned source/test/RBS files contain **73 changed LOC** (70 additions, 3 removals), **1 confirmed P2 finding**, **13.70 defects/KLOC changed**. Exact blobs include `read_response.rb` `9717dbbd7aacedbc3c4538cfb6c4d494a3fac417`, `thread_reads.rb` `120f5d73716328714bbf4f0ef14e31003d8508fc`, and `thread_database_test.rb` `0d8fc771a02106f84a045f622c26a6366abf543f`. Other thread SQL, attachment schema/policy definitions, IMAP RBS and full integration tests were excluded by the cap.

## Finding sent to root for Corin

**P2 — rollback fixture silently detaches future foreign keys on allowlisted tables.** `thread_database_test.rb:249–260` selects every FK whose child is one of four later tables and whose parent is drafts, threads or messages. It never checks constraint names against the intended later-feature dependency set before `detach_later_thread_foreign_keys` executes each generated `DROP CONSTRAINT`. A new or altered FK on one of these tables can therefore be removed and the B/C/D down/reapply probe can pass without the test explicitly acknowledging the new dependency. The final equality assertion confirms rollback restored the same catalog definitions, but cannot detect this scope drift. Pin expected constraint identities/definitions or fail on unexpected matches before detaching, and retain the rollback equality check. This is test-fixture scope, not a production migration weakening; all DDL is inside the rollback-only transaction. Root received the finding while Corin had no active dispatch.

## Other rubric checks and limits

`ReadResponse.single` validates a Hash and 1–2 MiB integer budget, uses the existing recursive JSON type/encoding checks, serializes once with `allow_nan: false`, and bounds final bytes. The direct-message path still obtains its row through scoped SQL and `ThreadProjection.message`; the repair removes a call to the private `dump` method without altering the projected payload. The source test checks control-character JSON round trip, precise byte overflow, over-max budget and invalid UTF-8; it does not exercise a real direct-message HTTP response or maximum-size attachment projection. JSON escapes control bytes; plain-text HTML safety ultimately depends on the client rendering boundary and is not established by this source test. `ImapSync#run` now types nullable `session` before `claim` and continues closing it in `ensure`; no transport or cursor behavior changed.

The down/reapply test snapshots business state, later FK definitions and one named attachment policy, executes original scripts under a local owner role, rolls back, then compares restored state and performs a read. Optional absent later tables are handled by `to_regclass` nulls. The named policy is detached only if found, but its actual creation definition and other possible later policies were outside this review. No new unbounded loops, hot-path queries, broad production grants, or duplicated runtime algorithms were found in these changed lines. Names and AIDEV comments mostly explain the intent. Runtime database rollback, strict Steep/RuboCop and integrated direct-message behavior remain Soren fleet work on the exact integrated SHA, not claims from this source review.
