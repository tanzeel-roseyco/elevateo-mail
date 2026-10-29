# BE-02 collaboration database adversarial review

Status: static review complete; changes requested to the test evidence. Runtime: **NOT_RUN**.

Task `task_3a99a0eb75ab`; dispatch `ctx_1301f787f10c`; run `run_5cc7ae2ab900`.
Reviewed source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
Report destination is the coordinator's separate Local Completion checkout. No source files were changed.

## Coverage and reproducibility

Counts and SHA-256 hashes were collected before inspecting code. Each file was reviewed in its own pass; counts include comments and blank physical lines. Final source counts/hashes matched the initial values.

| Pass | Path relative to apps/server | Inclusive range | Unique physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | test/be_02/collaboration_database_helper.rb | 1-184 | 184 | DF7464DB85C2ECB3F1D9D30709339D4961D3E2F98BA393DE3ED4335A928D8BEC |
| 2 | test/be_02/collaboration_database_test.rb | 1-140 | 140 | 160FBF680F3C200B9C66D76C4DA3D2C446234F0CDB50BAD2BC7EAE234E806E83 |

Total: **324 unique physical LOC**; largest pass: **184 LOC**. Both the 200-line pass limit and 400-line assignment limit were respected. No dependency implementation was added to coverage.

Observed defects: **4**, all medium severity (P2); defect density: **4 / 324 x 1000 = 12.346 defects/KLOC**. These are defects in fixture isolation or test assertions, not claims of four proven production vulnerabilities. Zero high/critical findings observed is not proof of their absence.

Context consulted: user/local AGENTS instructions, `.planning/STANDARDS.md`, planning/orchestration guidance, current-state excerpts of README/state/documentation, `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md`, `be02-session-database-interface.md`, and `.planning/consultations/results/be-02/decisions.md`. Contract **1.0.0-collaboration.1** governs C/D. Existing AIDEV anchors in both assigned files were read and left unchanged. Formatting was excluded from this review.

## Findings

### CDB-1 — Medium: admin fixture writes change every tenant's rows

**Location:** `test/be_02/collaboration_database_test.rb:20` and `:33`; related unscoped admin observations at `:9`, `:53`, `:62`, `:74`.

The maximum-version fixtures issue `UPDATE app.thread_read_states SET read_state_version = 2147483647` and the corresponding assignment UPDATE without any WHERE clause. The documented database harness creates random fixtures and removes only its own rows; it does not establish ownership of every row in these tables. An additional tenant's pre-existing or concurrently created fixture is therefore changed by these tests. Its next legitimate mutation can unexpectedly return 503, and this case's teardown cannot restore a row owned by another test. Global counts and the unfiltered assignment-version lookup also make outcomes depend on unrelated fixtures.

**Minimal fix:** bind the owned organization, mailbox, thread, and user where applicable in the admin UPDATEs and observations; assert the intended row count. Keep admin access for fixture setup, but limit each statement to the identities created for the case.

**Regression:** seed a second organization's read-state and assignment rows with known values, run the relevant max-version scenario, and verify those rows and timestamps are unchanged. The tested case must still pass with that second fixture present. Execute this in the authorized disposable Docker database, not on the host.

### CDB-2 — Medium: nullable response assertions accept omitted fields, and the unread assertion accepts null

**Location:** `test/be_02/collaboration_database_test.rb:8`, `:16`, `:28`, `:45-46`.

`Hash#values_at` returns nil for both a missing key and an explicit JSON null. Consequently, an initial read-state response omitting `updated_at` passes line 8, and an initial assignment response containing `assignment_version: 0` but omitting both `assignee_id` and `updated_at` passes line 28. The contract requires these nullable keys to be present. Separately, `refute detail.fetch("thread").fetch("unread")` accepts `unread: null`, although the unread projection must be the boolean inverse of the actor's read state. A missing unread key does raise because this lookup uses `fetch`; the defect here is acceptance of null.

**Minimal fix:** assert required keys through `fetch` and the closed response key set, then compare values; replace the projection assertion with `assert_equal false, ...fetch("unread")`. Preserve explicit checks for initial false/version zero/null and unchanged no-op timestamps.

**Regression:** a response missing initial `updated_at` or `assignee_id` must fail validation, as must `unread: null`; the corresponding explicit-null initial fields and boolean `unread: false` must pass. Validate these specific variants against the existing contract rather than duplicating business logic in a new abstraction.

### CDB-3 — Medium: the mismatched-thread case can pass without testing mailbox binding

**Location:** `test/be_02/collaboration_database_test.rb:102-115`, specifically the `[@thread, private_box]` pair at `:110`.

The actor has no membership in `private_box`. This pair therefore receives the expected generic 404 from mailbox visibility alone, even if a service accidentally removes its check that the thread belongs to the requested mailbox. A mutation that still checks mailbox visibility but accepts a thread from another visible mailbox can satisfy every case in this loop. This leaves the advertised mismatched-thread regression unable to distinguish the binding defect from the earlier authorization rejection.

**Minimal fix:** create a second shared mailbox readable by the same actor and pass the existing thread with that mailbox to all three write operations. Assert the exact generic 404 code/message and verify no read-state, assignment, or note was changed or created for the rejected request. Keep the private/foreign/missing cases as separate checks.

**Regression:** both mailboxes must be independently readable, while their thread/mailbox cross-pair must fail. Removing the service's thread-to-mailbox predicate should make this case fail; restoring it should pass. This finding is limited to the assigned test, not a claim that unreviewed suites have no binding checks.

### CDB-4 — Medium: the author-spoof assertion accepts unrelated database failures

**Location:** `test/be_02/collaboration_database_test.rb:131-136`.

The forged-author insert is expected to raise any `ActiveRecord::StatementInvalid`. That wrapper also covers malformed SQL, a missing column, not-null/foreign-key violations, and missing privileges. If this raw INSERT becomes invalid for one of those reasons while the author-isolation policy is broken, the test still passes and reports the spoof attempt as rejected. Rolling back the aborted transaction is correct, but the assertion does not establish the reason for rejection.

**Minimal fix:** capture the exception and verify its PostgreSQL cause/SQLSTATE is the intended authorization rejection, rather than accepting any statement failure. Add a positive control using the same INSERT columns and valid fixture references with the current actor as author, in a separate owned transaction; then change only the author to the other existing actor. Verify the forged ID was not persisted. The positive control prevents a missing INSERT grant from masquerading as successful row-policy enforcement.

**Regression:** the same-shape current-author insert succeeds, the forged-author insert fails with the expected authorization SQLSTATE (42501 for PostgreSQL insufficient privilege/RLS denial), and unrelated SQLSTATEs such as 23502, 23503, or 42601 do not satisfy the negative assertion. Assert rollback and absence of the forged row as well.

## Checklist and evidence limits

| Area | Static observation / disposition |
| --- | --- |
| Actual API role | Helper establishes ActiveRecord from `BE02_API_DATABASE_URL`; service calls use that pool rather than `@admin`. The named login/role attributes are documented, not proven at runtime here. The inherited connection setup is unreviewed. |
| Minimum privileges | Tests assert FORCE RLS flags for notes/assignments, API DELETE/notes UPDATE/membership UPDATE denial, worker SELECT denial, and empty notes without claims. CDB-4 weakens the forged-author proof. Full column-grant and role-policy implementations are outside coverage. |
| Actor isolation | Read-state test compares the second actor's exact visible row after two actors change state. Admin counts are affected by CDB-1. No executed RLS evidence was produced. |
| Null, empty, and max values | Initial false/version zero/null, nil assignee, empty guarded target array, matching no-ops, stale versions, and integer ceiling are represented. CDB-2 weakens explicit-null and projection checks. This is not full external-input/schema validation coverage. |
| Error precedence | Removed assignment target is paired with stale expected version and expects `not_available`; note replay binding checks change from mismatch to hidden after access removal. Private/foreign/missing checks cover generic statuses/messages, with the mismatch weakness in CDB-3. These service fixtures bypass the HTTP authentication/context layer. |
| Revocation fixtures | `fixture_change` locks all session rows for the affected organization before generations; `member_change` locks the target user's session rows before generations. This follows the published session-before-generation fixture ordering. It can also serialize a race at the session row before generation locking is exercised; such a wait alone cannot prove the generation guard. |
| Race observation | `wait_for_lock` checks only `wait_event_type == 'Lock'`, without identifying the blocker or lock target. A caller must establish that the relevant generation guard, rather than a session or unrelated row, is responsible before claiming a generation-race proof. No callers outside the assigned test were inspected. This is an evidence limitation, not an additional counted defect. |
| Concurrent outcomes | The helper starts threads behind a queue and joins all of them before propagating unexpected errors; handled collaboration errors remain observable. CAS and note collision tests assert winner/loser outcomes. A common start signal does not itself prove overlap at the contested write. Dedicated concurrency suites and all runtime schedules remain unreviewed/NOT_RUN. |
| Teardown scope | Helper teardown removes actors by freshly generated user IDs and foreign organizations by tracked IDs, with generation guards around membership changes. This is statically scoped to its fixtures. Its inherited `super` teardown, cascades, and behavior after partial base setup are unreviewed; full cleanup is not certified. CDB-1 is a separate whole-table mutation problem. |
| Transaction failures | Fixture mutation exceptions attempt rollback and re-raise. The deliberate ActiveRecord rollback after a failed statement avoids continued SQL in an aborted transaction. Actual database/driver failure behavior was not executed. |
| Security inputs | Fixture UUIDs are generated internally; user/identity values normally enter helper SQL via bound parameters. The spoof INSERT interpolates generated fixture UUIDs, not external request input. Runtime env validation, authentication and public request sanitization are dependencies outside this assignment. |
| Maintainability and performance | Helpers centralize setup, scope and services without an unnecessary new abstraction. No application hot-path query assessment is possible from these test files. Global fixture operations are addressed by CDB-1. Formatting is delegated to linters. |
| Documentation / standards | C/D collaboration and write-boundary documents describe the intended real-role, guarded-transaction and closed-wire contracts and distinguish pending Docker evidence. This report does not elevate those authored claims into passing runtime evidence. |
| Budgets and complete wire shapes | Contract error/body budgets, 50-item note pages, full closed envelopes, status mappings, and the HTTP 401/409/404 priority cannot be certified from this bounded service/database assignment. Separate serializers/schema/controller tests are unreviewed. |

## Unreviewed dependencies and their published interfaces

- `test/be_02/database_test_helper.rb` / `SessionDatabaseTestCase`: supplies disposable admin/API/worker connections, identities, session creation/invocation, membership fixtures, and base cleanup. Its implementation was not opened.
- `lib/elevateo/tenancy.rb`: supplies a principal and the owned transaction/claims context; the helper requests read-only mode for reads. The advertised read snapshot behavior was not inspected in code.
- `lib/elevateo/thread_read_state.rb`, `thread_assignment.rb`, `thread_notes.rb`, and `thread_reads.rb`: expose the documented get/put/post/list/detail service interfaces; writes return status/JSON and expected failures expose collaboration status/code/message. Their implementations, serializers, and input validation remain unreviewed.
- `app_auth.begin_protected_write`: published to lock the session, sorted actor/target generation guards, and provide transaction-bound protected-write authority; the helper requires an `ok` result. Its actual SQL and guard enforcement are unreviewed.
- `app_auth.lock_authorization_generations` and `collaboration_reader`: documented guard and current-reader/target checks, including protected-write requirements. A plain connection's denial is not by itself a proof of every internal check.
- Schema, triggers, migrations, grants, Auth runtime, and dedicated concurrency/schema/service tests: unreviewed. No inference of suite-wide absence is made from their exclusion.

## Executed evidence and follow-up

Executed only read-only shell inspection, physical-line counting, SHA-256 hashing, Orca coordination, and creation/verification of this report. No Ruby/application tests, Docker, database queries, model/agent calls, SSH, commits, frontend work, or source edits were performed. Runtime, integration, race, linter and typecheck results are **NOT_RUN**. The SQL shown in this report was inspected as text, never executed.

Coordinator follow-up: repair or adjudicate CDB-1 through CDB-4, then run the authorized Docker tests with real API/worker roles and separately establish deterministic revocation-race evidence. In particular, do not count a generic fixture/session lock wait as proof of a generation guard. No Docker resources were created, so task-owned Docker cleanup is not applicable.
