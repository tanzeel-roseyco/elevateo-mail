# BE-02 collaboration services adversarial review

Review completed on 2026-10-13 (Australia/Sydney). **One MED defect remains open. Runtime: NOT_RUN.** This is a bounded static review, not application acceptance or proof of race safety.

Run: `run_5cc7ae2ab900`; task: `task_0d62ae2f1639`; dispatch: `ctx_e75343c12e00`; reviewer terminal: `term_cc624fba-ee25-49a9-8e74-8a57a9fddcd2`.

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Code paths below are relative to `apps/server/`. This report is the only file written, in the explicitly assigned coordinator checkout.

## Coverage and frozen source

Physical line counts and SHA-256 hashes were obtained before reading code. Final hashes and counts were rechecked at 09:55:35 +11:00 and were unchanged. Blank lines and comments are included. No dependency, controller, SQL migration, signature or test implementation was added to review coverage.

| Pass | File | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `lib/elevateo/thread_collaboration.rb` | 1-71 | 71 | `c4abf9d245c4b1d82183166bad67ac0e6859d133f02ce23690f79282184283b0` |
| 1 | `lib/elevateo/thread_assignment.rb` | 1-80 | 80 | `9a99d0d2f11ddf7b26a9c530a2cc11294b325e133aea4e843573ab09202ab9c8` |
| 2 | `lib/elevateo/thread_read_state.rb` | 1-50 | 50 | `a05f3af1b6a163b2df8b11cf7b2b63758fa532543acc3c7543cd16d030f9e6c0` |
| 2 | `lib/elevateo/thread_notes.rb` | 1-99 | 99 | `df0cafb05e35010fbab1ed1aeb7e88bdb649aad9e6d17baefc768bc045f7041c` |

Pass 1 reviewed 151 physical lines; pass 2 reviewed 149. **Exact unique code coverage: 300 physical LOC**, below the 400-line assignment ceiling, with each pass below 200. Rechecks did not add unique lines.

| Accounting | Defects observed | Defects/KLOC |
| --- | ---: | ---: |
| Pass 1: 151 LOC | 0 | 0.00 |
| Pass 2: 149 LOC | 1 | 6.71 |
| Assignment: 300 unique LOC | **1 MED** | **3.33** |

Density is observed defects divided by reviewed physical LOC, multiplied by 1,000. Empty and oversized cursors are two triggers of one defect. Zero observed in pass 1 is not proof of correctness; implementation-author self-review findings are not counted here.

Context consulted: project `AGENTS.md`, current README/state/documentation checkpoints, `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, accepted BE-02 `decisions.md`, and the implementation brief, C/D contract, drafts handoff, collaboration handoff and write-boundary handoff under `docs/completion/`. The controlling wire contract is **1.0.0-collaboration.1**. Existing AIDEV anchors in all four assigned files were read and preserved. The complete supplied adversarial rubric was applied within this scope; formatting remains delegated to linters.

## Finding CS-01 — MED: note cursor size failures select the wrong error code

**Location:** `lib/elevateo/thread_notes.rb:79`, within `position` (lines 77-86), reached from `list` at lines 66-67.

**Failure scenario:** A currently authenticated reader with current context requests notes for an accessible thread and supplies `cursor=` (the empty string), or an ASCII cursor of length 2,049. Resource authorization succeeds, then the size guard calls `WriteInput.invalid!`, the shared generic request-validation path, instead of raising `Cursors::Invalid`. Under the published boundary this selects HTTP 400 `request_invalid`, while the frozen C/D contract section 3 (line 58) requires HTTP 400 `cursor_invalid` for invalid cursors after current authentication/context/scope. The adjacent decode/projection failures already use the cursor-specific exception path. A client that handles an invalid continuation by its contractual code cannot reliably identify these failures. No content disclosure or mutation is claimed.

**Minimal fix:** Raise `Cursors::Invalid` from this cursor-length guard, retaining its current location after `resource!`. Preserve the existing decoder and projection-rescue path; do not move cursor validation ahead of authority checks or widen error shapes.

**Regression:** Exercise the actual note-list controller with otherwise valid authority and query: empty cursor and a 2,049-character ASCII cursor must both return exactly 400 `cursor_invalid` in the closed collaboration error envelope. Verify omission still returns the ordinary page, and an inaccessible thread with either malformed cursor still returns the generic 404 before cursor validation. Preserve separate revoked-session 401 and stale-context 409 precedence coverage. At service level assert that both size failures raise `Cursors::Invalid` without calling the decoder or note query. These checks are recommendations, **not executed evidence**.

**Evidence and status:** Static source/control-flow finding against the published boundary; actual HTTP reproduction is NOT_RUN. Reported promptly through Orca status message `msg_3020df94ff37`. No repair was made by this reviewer.

## Review checklist and conclusions within the assigned code

| Area | Static observation | Limit or disposition |
| --- | --- | --- |
| Current authority before disclosure | All service operations call `resource!` before returning state or notes. Assignment PUT checks target eligibility before reading/comparing the business version. Note list calls `resource!` before cursor decoding. | Session/context enforcement, forced RLS and guards are inherited, unreviewed dependencies. CS-01 affects the error code, not the observed scope-before-cursor order. |
| Null, absent and empty state | Assignment absence projects null/0/null. Absent read state projects false/0/null and initial false does not insert. Empty note pages are delegated to the shared paginator. Assignee null clears; caller identity is not accepted in the closed payload keys. | Raw JSON null, malformed objects, duplicate keys, UTF-8 and raw byte limits belong to the unreviewed transport boundary. Service inputs are expected to be the documented parsed hashes. |
| First-writer assignment CAS | INSERT-on-conflict establishes a common zero-version business row, followed by SELECT FOR UPDATE and expected-version comparison. Different actors converge on the same organization/mailbox/thread key. | Depends on actual READ COMMITTED execution, unique constraints, RLS and grants. Runtime concurrency proof is NOT_RUN. |
| Stale versions and no-ops | Assignment compares the expected version before comparing the desired assignee. Both assignment and read-state call `advance!` only for a real change; the maximum version can remain a no-op and a changing operation raises 503 before its state update. | No observed defect in these branches; database behavior remains unverified. |
| Target revocation and historical UUIDs | Every non-null assignment, including a desired no-op, calls the eligibility helper. GET returns stored attribution without a new target lookup or profile fields. | Sorted actor/target guards and target membership semantics are published SQL/wrapper preconditions, not audited here. |
| Per-actor read state and B compatibility | Read-state queries include the authenticated user ID. The existing `is_read` value remains the state being written; the added version changes only with the desired boolean. | B's inverse unread projection, migrations and existing rows were not reviewed. |
| Immutable notes and binding | The organization/note-ID conflict key converges duplicates. A subsequent current-scope lookup rejects hidden/other-author collisions with 404; visible own-note content/mailbox/thread mismatch gives 409. First insert is 201; identical retry is 200. | READ COMMITTED visibility after a uniqueness wait and absence of note-update permission are unreviewed database obligations. |
| Exact plaintext and safe SQL | Body values are validated and bound as text, compared exactly on retry, and emitted without trimming, normalization or HTML evaluation in the assigned services. SQL structure is fixed and values use binds. | Exact Unicode validation and projection semantics are inherited. No UI rendering was inspected. |
| Exact envelope and byte budgets | Services construct the declared fields. Shared serialization counts generated JSON bytes with 4,096-byte default; note POST specifies 65,536. Note list supplies the complete thread/mailbox envelope and 262,144-byte budget to the paginator. | Serializer rollback and whole-entry pagination behavior require the unreviewed boundary/utilities and execution. |
| Pagination | Notes use ascending `(created_at,id)`, limit+1 rows, default 50/max 50, and a cursor scope containing actor/org/context/generation/resource/filter/order/limit. Decoded position requires ID and non-null timestamp. | Cursor signing/expiry and last-included-row byte reduction are inherited. CS-01 remains open. |
| Maintainability and performance | Four small services separate shared projection/query plumbing from each concern. Important transaction and ordering assumptions have comments. Queries are bounded with no per-note query loop or external I/O. | Indexes and query plans are outside this assignment; no performance claim. No new abstraction or refactor is recommended. |
| Documentation and tests | Collaboration/write handoffs describe these interfaces and enumerate service/controller/database/concurrency/schema suites. The eight collaboration/note test and helper paths were confirmed to exist by filename enumeration only. | Test bodies are unreviewed. Their advertised happy/failure/race coverage and assertions are not independently confirmed and no tests were run. |

## Published dependencies — explicitly unreviewed

- `V1::WriteController`, `protected_read`, `protected_write`, `SessionWrites`: published transport validation, current Auth/session/context/proof checks, read snapshot, READ COMMITTED write transaction, session then sorted generation guards, 10-second deadline, serialization before commit and rollback on raised/projection/overflow errors. No implementation lines reviewed.
- `WriteInput`: published closed-input, UUID, mathematical-integer, boolean and Unicode text validation, with generic request-invalid failures. Null/duplicate/raw-byte handling and the default text minimum are accepted interface assumptions, not independently verified implementation facts.
- `app_auth.collaboration_reader` and collaboration tables/policies/migrations: published private protected-write assertion, effective target readership, composite scope keys, forced RLS, stable attribution and restricted DML. Guard acquisition and revocation writers were not inspected.
- `Cursors`, `ReadResponse.page`, `ThreadProjection`, `WriteResponse`, `CollaborationError`: published signed expiring scoped cursors, whole-entry page sizing, validated projection, bounded JSON/error envelopes and error mapping. Their source, signatures and runtime serialization were not reviewed. In particular, this review does not independently prove cursor expiry, response headers or rollback after serialization failure.
- Controllers/routes, canonical OpenAPI/fixtures, B read implementation and all test bodies are outside the assigned code ranges. The supplied contract/handoffs serve as their published interfaces; no transitive correctness claim is made.

## Analytical scenarios and required remaining evidence

Static interleaving reasoning only: for two first assignment writers at expected version 0, the zero-row insert and row lock make one observe the other's committed version and conflict; an initial matching clear remains a logical no-op. For two read-state requests from different sessions of the same actor, the documented actor generation guard is essential when no state row yet exists. For a target revocation racing assignment, the shared sorted guards must make either the assignment precede revocation or the eligibility recheck see revocation. For concurrent identical note creation, DO NOTHING followed by a fresh READ COMMITTED statement must see the winner and return 200 rather than creating another note. These are deductions under published preconditions, not executed PostgreSQL barriers or Obsidian simulations.

Actual executed evidence consists solely of local documentation/source reads, AIDEV search, physical line counting, SHA-256 comparison, test-path enumeration and Orca messaging. **Ruby syntax, lint, typecheck, unit, integration, concurrency, SQL/RLS, serializer, migration, Docker, HTTP, native and visual checks: NOT_RUN.** No host application tests, Docker, SSH, model/agent calls, Obsidian execution, commit, frontend work or live action occurred. No Docker cleanup is owed.

The coordinator should route CS-01 for a bounded repair, add/confirm exact-code regressions, and obtain independent database/guard/paginator and actual Docker evidence before accepting the feature. This report does not replace the separately assigned design review or the coordinator-owned `code-reviews.md` integration.
