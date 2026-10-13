# BE-02 collaboration design: bounded adversarial review

Review date: 2026-10-13 Australia/Sydney. Run: `run_5cc7ae2ab900`. Task: `task_acc6a13b7b2b`. Dispatch: `ctx_0f12bc3e3833`. Reviewer: independent Codex terminal `term_c48dad70-92b9-4099-b565-1d78c1340aed`.

**Result: one observed medium-severity defect in 343 unique physical code lines, or 2.915 defects/KLOC. Runtime: NOT_RUN.** The assigned concurrency design is consistent with the published guarded-transaction interfaces, subject to the limitations below. This is neither application acceptance nor proof that other defects are absent.

Source repository: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Code paths below are relative to its `apps/server/` directory. Documentation paths explicitly beginning `docs/`, `.planning/`, or a root document name are repository-relative. This report is intentionally saved in the coordinator's separate Local Completion directory.

## Scope, authority, and evidence

Governing context inspected: project `AGENTS.md`, relevant current-state sections of `README.md`, `state.md`, and `documentation.md`, `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, the local-completion instructions, and the implementation brief. The controlling feature references are `docs/completion/be02-cd-contract.md` version **1.0.0-collaboration.1**, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md` in the same directory, and accepted `.planning/consultations/results/be-02/decisions.md` D01-D08.

The full supplied review rubric was applied to the assigned surface. Formatting was excluded for linters. AIDEV anchors in the six assigned files were read and preserved. No source, tests, shared review ledger, or other workers' files were changed. The source was counted and hashed before inspection; only these six implementation files were inspected.

| Pass | File | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `db/be02_collaboration/target_reader.sql` | 1-40 | 40 | `90EA633B5FA615554AAD73C8CA2F4866046CEB0029E5897EF9AC0F7C345A59B8` |
| 1 | `lib/elevateo/thread_assignment.rb` | 1-80 | 80 | `9A99D0D2F11DDF7B26A9C530A2CC11294B325E133AEA4E843573AB09202AB9C8` |
| 1 | `lib/elevateo/thread_read_state.rb` | 1-50 | 50 | `A05F3AF1B6A163B2DF8B11CF7B2B63758FA532543ACC3C7543CD16D030F9E6C0` |
| 2 | `lib/elevateo/thread_notes.rb` | 1-99 | 99 | `DF0CAFB05E35010FBAB1ED1AEB7E88BDB649AAD9E6D17BAEFC768BC045F7041C` |
| 2 | `db/be02_collaboration/policies.sql` | 1-38 | 38 | `11C6C70800C35905329304EF5653A13223464F4C4988ED3BD22256A98A4B82C9` |
| 2 | `db/be02_collaboration/tables.sql` | 1-36 | 36 | `C51DF0E1C54C6C4D2FE85C6A0FD5D83D0477B381BCD6051510325D51864A890A` |

Physical LOC includes blank lines and comments. Pass 1: **170 LOC, zero observed defects, 0 defects/KLOC**. Pass 2: **173 LOC, one observed defect, 5.780 defects/KLOC**. Assignment: **343 unique LOC, one observed defect, 2.915 defects/KLOC**. Each pass is below 200 and the assignment is below 400; documentation is context, not additional reviewed implementation coverage. Zero observed defects in a pass is not proof of correctness. All six hashes and line counts were rechecked at 2026-10-12 23:01 UTC and matched the initial review snapshot.

## Finding CD-DES-01: wrong error code for cursor length failures

**Severity: medium. Location: `lib/elevateo/thread_notes.rb:79`, within `position` lines 77-86.**

For an authenticated current reader using a valid context and mailbox/thread, GET notes with `cursor=` reaches the cursor length check after `resource!`. The empty Ruby string is truthy, so it does not take the absent-token return. The length branch calls `WriteInput.invalid!`, the generic invalid-input path, rather than `Cursors::Invalid`. The same branch handles a 2,049-byte ASCII cursor. Against the published shared error interface, these requests produce 400 `request_invalid` instead of the required 400 `cursor_invalid`.

Contract section 3 expressly assigns invalid, expired, or mismatched cursors to `cursor_invalid`, following current authentication, context, and scope checks. Section 2 distinguishes this from generic boundary errors. The failure changes the canonical wire error and can prevent a consumer from recognizing a cursor reset condition. This is a static finding; an endpoint response was not executed. No authorization bypass was observed here.

**Minimal fix:** raise `Cursors::Invalid` for the cursor length failure at this existing position, leaving `resource!` before cursor validation. Keep the separate raw syntax/encoding checks at the transport boundary. Do not move cursor validation ahead of current authority or change the accepted cursor format.

**Required regression:** exercise the actual notes GET route with valid identity/context/resource and separately an empty cursor and a 2,049-character ASCII cursor; assert HTTP 400 and exact code `cursor_invalid`. Also assert that the same well-formed requests with an inaccessible resource return the canonical generic 404, a locally revoked session returns 401 despite stale context/cursor, and a valid session with stale context returns 409 before cursor semantics. Keep a valid cursor and absent-cursor success control. Run these in the coordinator's Docker suite.

The material finding was reported through Orca status message `msg_f2f836674d46` before this report was completed.

## Analytical interleavings and design tradeoffs

**These are analytical simulations, not executed database schedules.** Obsidian was unavailable: no Obsidian tool/connection was exposed in this worker's tool inventory. The simulations are therefore recorded locally here; no Obsidian artifact or external-model consultation is claimed. They preserve D01-D08 and assume the exact published transaction interfaces in the next section.

### 1. First assignment contention with no existing row

Two different actors submit expected version 0 with different eligible targets. After their guards, transaction A inserts the zero-version identity row. Transaction B's insert of the same composite key waits on the uniqueness conflict even though its actor/target guard set need not overlap A's. A selects the row FOR UPDATE, changes it to version 1, then commits. B's INSERT DO NOTHING finishes without inserting; its following statement in READ COMMITTED sees version 1 and returns 409 `assignment_conflict`. If A rolls back, B can insert and become the successful first writer instead. The unique row provides the missing lockable object that a SELECT FOR UPDATE on absence cannot provide.

Evidence: `lib/elevateo/thread_assignment.rb:14-24,43-66`; `db/be02_collaboration/tables.sql:6-18`. The version-zero row can also be persisted by an initial clear/no-op, but its wire state remains null/0/null. This small storage cost is justified by first-write arbitration; no advisory-lock service or new ledger is warranted. Actual waits, rollback, and the single-winner outcome remain runtime acceptance cases.

### 2. Lock order and opposing actor/target pairs

A assigns B while B assigns A. Each write first owns its own session lock and then requests the distinct actor/target generation rows in the same sorted order. One transaction waits at the common first generation key rather than each taking the other key in reverse order; only afterward may either touch an assignment row. The target-reader helper asserts the private transaction proof before querying either user's mailbox visibility. It does not establish an alternative business-before-generation ordering.

Evidence: `db/be02_collaboration/target_reader.sql:18-35`; assignment eligibility before insertion at `lib/elevateo/thread_assignment.rb:48-55`. The sorted locking and private marker are published dependencies, not inspected code. This review cannot prove the guard callback was wired, generation creation is race-safe, or every membership routine follows the order. Preserve the shared guard mechanism and verify those seams; duplicating target locks inside this service would create another ordering rule without benefit.

### 3. Target revocation, no-op, and stale expected version

If a target's membership revocation obtains its generation guard first and commits, the later assignment acquires that guard and reads the new authority: the target helper returns false and assignment returns generic 404 before comparing versions or deciding that the value is unchanged. This includes re-submitting the historical assignee with an otherwise matching expected version. If the assignment owns the guard first, revocation waits until the valid assignment commits; a later read may retain the historical UUID after revocation.

Evidence: `db/be02_collaboration/target_reader.sql:4-15,24-35`; `lib/elevateo/thread_assignment.rb:48-63`. Clearing a historical assignment uses null target and does not require the former user's readership, while still requiring current actor access and the correct version. For an eligible target, stale expected version remains 409 even when the desired target equals the stored one. These orderings match sections 2 and 6 and avoid granting authority through historical attribution.

### 4. Absent read state and two sessions of the same actor

For absent state, desired false yields false/0/null without an insert. A true write from one session and a false write from another session share the actor generation guard even though their session locks differ. The first true write inserts version 1; after it commits, the false writer reads true/version 1 and writes false/version 2. If false serializes first, it is the initial no-op and the later true write becomes version 1. Two true requests produce one change and one no-op.

Evidence: `lib/elevateo/thread_read_state.rb:8-23,32-47`. The guard is necessary: row locking alone cannot serialize two readers of an absent row. The accepted actor guard is coarser than a per-thread guard, but reusing it keeps the authorization and state order aligned. Throughput consequences require measurement; this review does not recommend another lock system. B's unread projection remains an explicitly unreviewed integration seam.

### 5. Version ceilings and null states

Assignment compares expected version before its no-op decision. A matching same-value assignment at 2,147,483,647 requires no increment; a differing value calls the shared ceiling check before UPDATE. Read state similarly checks the ceiling only for a differing boolean. Assignment's missing state is null/0/null, and read state's missing state is false/0/null. Stored assignment checks tie zero version to null assignment/time, and stored read-state versions begin at 1.

Evidence: `lib/elevateo/thread_assignment.rb:57-78`; `lib/elevateo/thread_read_state.rb:39-47`; `db/be02_collaboration/tables.sql:3-18`. Boundary validation, the ceiling helper's exact 503 mapping, and precommit response validation are unreviewed dependencies. Required integration cases include same-value maxima, changing maxima, stale assignment maxima, existing B rows upgraded to version 1, and unchanged timestamps for no-ops.

### 6. Immutable notes, retries, and hidden-ID collisions

Two exact same-author requests for one organization/note UUID cannot both insert because the primary key arbitrates them. After a first insert commits, the second DO NOTHING result falls back to a fresh READ COMMITTED SELECT and returns 200 only for exact author/mailbox/thread/body equality; first creation returns 201. If the first writer rolls back, the waiting insert can create the note and return 201. The body is not normalized, so distinct whitespace remains a meaningful mismatch.

A collision with an ID in a currently hidden thread produces no SELECT-visible row and returns generic 404. A currently visible note by another author also returns 404. Only an own currently visible note with different body or binding returns 409 `operation_mismatch`. Resource authorization occurs before attempting replay, and INSERT DO NOTHING never overwrites the conflicting record.

Evidence: `lib/elevateo/thread_notes.rb:12-17,38-53`; `db/be02_collaboration/policies.sql:17-26,33-35`; `db/be02_collaboration/tables.sql:22-36`. This uses the note itself as immutable replay evidence and preserves D08's minimal design; adding a draft-style operation ledger would not solve a demonstrated need. Runtime must establish RLS-filtered collision behavior and both commit/rollback schedules, not merely mock a missing row.

### 7. Historical UUID attribution and current authority

Removing an organization/mailbox membership does not delete or rewrite an old assignee/author UUID. The reviewed schema deliberately retains those UUID values without membership-linked foreign keys; the composite thread relationship still scopes the records to their organization and mailbox. Note SELECT and assignment access use current thread visibility; target eligibility independently checks current organization membership and effective private/shared mailbox readership.

Evidence: `db/be02_collaboration/tables.sql:6-36`; `db/be02_collaboration/policies.sql:7-26`; `db/be02_collaboration/target_reader.sql:4-15`; assignment/note projections. The retained UUID is attribution only: neither response projects names/emails nor derives access from authorship or assignment. Retention is accepted D08 behavior, not a missing cascade. Thread deletion remains a separate documented cascading relationship.

### 8. Current authority, read snapshot, and cursor precedence

For otherwise valid requests, revoked local session wins with 401 over stale context; a valid stale context wins with 409; current inaccessible scope wins with generic 404 over cursor or business information. The notes service calls `resource!` before `position`, preserving the last of these orderings. An authorized valid scope then exposes the length error in CD-DES-01.

Under D05, a read snapshot S sees a revocation committed before S and denies access. A revocation after S may permit one coherent earlier-snapshot response within the canonical ten-second request deadline. Re-reading generation in the same snapshot cannot observe the newer commit and is not a proposed fix. Authentication, snapshot setup, and the deadline are outside the inspected implementation, so this is an interface-based conclusion.

### 9. Bounded pages and work

Notes fetch at most limit+1 rows, with canonical limit 1..50, ordered by created_at/id and supported by the matching organization/mailbox/thread/order index. Scope passed to the cursor utility includes actor, organization, context/version, thread/mailbox filter, ordering, and effective limit. Projection emits note ID, author ID, exact bounded plaintext, version 1, and timestamp. The list calls the shared page serializer with 262,144 bytes, while POST uses 65,536 bytes.

Evidence: `lib/elevateo/thread_notes.rb:18-23,56-73,89-97`; `db/be02_collaboration/tables.sql:36`. Whole-entry shrinking, exact escaped-envelope accounting, next-cursor creation from the last included row, signature/expiry checks, and route binding depend on the shared cursor/page implementations. They are not proven by passing a budget number. Verify empty pages, 50/51 rows, tied timestamps, hostile JSON-escaping and non-BMP maxima in Docker. No unbounded loop or query-per-note pattern was observed in these assigned files; no query plan or performance SLO was measured.

## Published dependencies that remain unreviewed

| Dependency | Published interface used in this analysis | Review limit |
| --- | --- | --- |
| `V1::WriteController`, protected-write foundation and guards | Validates raw transport/proofs, validates upstream identity outside locks, locks session then sorted actor/target generation guards, runs business logic in one READ COMMITTED transaction, validates/serializes before commit, rolls back errors. Assignment callback supplies normalized non-null target; actor is always included. | Implementation, controller callback, all wrapper tests and exception mappings unreviewed. |
| `assert_protected_write` and guarded membership mutations | Private transaction marker proves the session/actor/target guards; mutations take the same generation guards before changing authority. | Definitions, role setup, default grants, guard creation, and membership implementation unreviewed. |
| `ThreadCollaboration`, `WriteInput`, `ThreadProjection`, `WriteResponse` | Current resource check, bound SQL execution, closed typed inputs, bounded versions, canonical projections/errors/envelopes and response serialization. | Implementations and signatures unreviewed. Generic invalid-input versus cursor-invalid behavior is assessed against this published interface. |
| Protected reads, cursors and `ReadResponse.page` | Current session/context/scope at one read-only repeatable-read snapshot; signed expiring bound cursors; complete serialized-byte accounting and whole-entry pagination. | Implementations and read-controller wiring unreviewed. No claim that a second version read observes revocation. |
| B schema/projections, migration loader/down script | Existing actor read state and forced visibility; D installs after the write foundation and C; existing B rows become version 1. | B implementation, migration execution/reversal, unread counters and route/type consumer integration unreviewed. |
| Auth facade, session policy, CSRF/origin checks, client consumers | Existing accepted D01-D08 authority, transport and client invalidation boundaries. | Unassigned; no live credentials, sends, frontend work, or external runner calls. |

## Review checklist and validation disposition

| Area | Disposition |
| --- | --- |
| Purpose, canonical statuses, exact projected fields | Assigned surface checked against collaboration.1; CD-DES-01 remains open. Shared envelope/error implementations are unreviewed. |
| Nulls, absent rows, empty lists, no-ops and maximum versions | Analytically checked; runtime edge cases remain pending. |
| State coupling, first-write contention, target revocation, lock order | Interleavings recorded above; conditional on unreviewed guard/wrapper implementation. |
| Current authority, RLS, hidden note IDs and historical attribution | Assigned SQL/services inspected; actual privileges, RLS execution and revocation barriers NOT_RUN. |
| Boundary validation and plaintext handling | Assigned validators/projections and database checks inspected; parser, encoding, shared validation and endpoint byte gates unreviewed. |
| Maintainability, duplication, function responsibilities, names and comments | No additional material defect observed; existing anchors explain non-obvious contention, ordering and attribution choices. No speculative refactor recommended. |
| Bounded work and query pattern | Bounded note fetch and matching index observed; query plans and load behavior NOT_RUN. |
| Happy path and failure regression tests | Handoff documents claim service/controller/schema/database/concurrency suites; their source was outside this assignment and was not inspected. Existence of adequate assertions is not independently established here. |
| Relevant documentation | Contract, decisions and collaboration/write-boundary handoffs provide interfaces and honestly mark pending runtime checks. Coordinator must incorporate this review and the eventual fix into its owned ledger/state documentation. |
| Formatting, lint, typechecks, unit/integration tests, migrations, actual UI | NOT_RUN; prohibited or outside this bounded static assignment. Formatting remains with linters. |

Executed evidence consists only of documentation/source inspection, file counts and SHA-256 measurements, and Orca coordination. No Docker, host application tests, model/agent calls, SSH, commits, publishing, or source mutations occurred. The coordinator must fix CD-DES-01 and run the existing and requested Docker regressions before claiming runtime acceptance. The review ledger should record **one observed defect / 343 unique physical LOC = 2.915 defects/KLOC**, deduplicating it if another assigned reviewer reports the same branch.
