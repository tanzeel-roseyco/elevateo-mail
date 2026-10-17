# BE-02 bounded cursor repair

Task `task_403e2fb7cb99`, dispatch `ctx_d53e701cf08a`, run `run_5cc7ae2ab900`.
Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.

## Changes and disposition

- CS-01: `ThreadNotes#position` now raises `Cursors::Invalid` for empty and oversized supplied tokens, after the existing resource visibility check. The existing C/D controller maps this exception to 400 `cursor_invalid`.
- S-01: search excludes only `cursor` from B's shared query-limit validation, preserving unknown-key and limit checks. The existing signed cursor decoder now handles empty, oversized and malformed tokens after explicit mailbox visibility. B's helper is unchanged.
- Missing cursors still request the first page. Frozen contract `1.0.0-collaboration.1`, wire shapes, signatures, SQL and authorization design are unchanged. No new dependencies or RBS changes are needed.

Two reported defects have authored repairs; runtime closure remains pending. Existing AIDEV anchors were searched and preserved, and relevant comments now explain the cursor-specific ordering/error seam.

## Regression evidence authored

`mail_search_test.rb` no longer expects generic request-invalid for an empty cursor. It checks 400 cursor-invalid for malformed, empty and 2,049-byte tokens with and without an explicit visible mailbox, and generic 404 for an inaccessible mailbox for each token form. Existing omitted-cursor and signed-continuation cases remain.

New `thread_notes_cursor_test.rb` exercises actual notes and search controllers and services through the existing collaboration controller/session harness. For each route it covers omitted-cursor first-page success; malformed, empty and 2,049-byte cursor errors; hidden-resource generic 404; revoked-session 401 ahead of both stale context and cursor invalidity; and current-session stale-context 409 ahead of cursor invalidity. Error envelopes are checked for the closed code/message/request_id shape. The harness uses real session logic with an in-memory session store and canned SQL rows: this is not real Auth, PostgreSQL, RLS, or concurrent-revocation evidence. No authentication outcome is stubbed directly.

**NOT_RUN:** syntax, lint, typecheck, unit, controller, integration, database, Docker and visual tests. The coordinator owns execution. No SSH, Docker, host application tests, agents/model calls, frontend changes, commits/pushes or root-document edits occurred. No disposable Docker resources were created.

## Exact changed source manifest and review packet

SHA-256 values cover final source bytes. Physical LOC includes blanks and comments. These are bounded packets for root's independent review, not a claim that this repair worker performed an independent adversarial review.

| Pass | Path | Inclusive lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/lib/elevateo/thread_notes.rb` | 1-100 | 100 | `161024d2d079bace051db792a30eb6a7b13f117238a72a302d478087432b3437` |
| 1 | `apps/server/lib/elevateo/mail_search.rb` | 1-39 | 39 | `59f4f97351468cf7aae61810dec2f724e374dace482e8c97177fd38ef9e45acc` |
| 2 | `apps/server/test/be_02/mail_search_test.rb` | 1-88 | 88 | `e4a0988bbbef51e464577181427a71ddaa1676137306726b362c0a310787ee2b` |
| 2 | `apps/server/test/be_02/thread_notes_cursor_test.rb` | 1-94 | 94 | `4b537a65b5624576d8330fc13737be864b92f2a7570ee44e86e17634d6229c75` |

Pass 1: 139 LOC; pass 2: 182 LOC; combined unique source: 321 LOC. Each pass is below 200 physical LOC and the combined assignment is below 400. Two inherited defects / 321 packet LOC = **6.23 defects/KLOC**; this is repair-packet accounting, not a replacement for the originating reviews' denominators. No additional defect is claimed. The fifth changed path is this report; its final hash is provided in the completion message to avoid a self-referential hash.

Review checklist: exact cursor error mapping; scope-before-cursor ordering; omitted cursor success; unknown-query and limit rejection retained; B helper untouched; real controller/session precedence; no extra SQL after a failed cursor; fixture limits versus real database evidence; unchanged contract/RBS; no unrelated writer's files changed. Dedicated independent/design review and aggregate `code-reviews.md` remain root-owned.

## Caveats and remaining work

Root must run both changed test files and relevant existing suites in Docker, including strict typechecking, before runtime closure. Existing raw transport limits and invalid URL/UTF-8 query handling remain transport validation; this change concerns syntactically parsed cursor strings. Supplied null/non-string values cannot arise from the typed C/D query parser and no new coercion is introduced. Actual database visibility and Auth revocation proofs remain separate integration requirements. `collaboration_services_test.rb`, controllers, shared B helpers and all root documents were left untouched.
