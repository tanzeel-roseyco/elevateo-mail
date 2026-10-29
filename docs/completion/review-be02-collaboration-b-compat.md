# BE-02 collaboration B compatibility review

Outcome: **zero observed defects in 327 unique physical code lines reviewed statically**. Runtime verification is **NOT_RUN**. This result is limited to the assigned test and runner; it is not proof that their dependencies or the complete C/D implementation work.

## Review identity and authority

- Assignment: `collaboration_b_compat`.
- Run: `run_5cc7ae2ab900`; task: `task_50922602e58b`; dispatch: `ctx_d6b31a88e022`.
- Reviewer: independent Codex worker, terminal `term_73cc5adf-8ff5-4cc8-a168-b66ca5b0caa6`.
- Review date: 2026-10-13 Australia/Sydney.
- Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
- Recorded source HEAD: `5785eba47f3709debb2815c8d86608f7e62d02f3`. File hashes below identify the actual reviewed working-tree contents; HEAD alone is not a claim of a clean worktree.
- Output authority: this report only, in the coordinator's Local Completion directory. No source edits, application tests, Docker calls, agents/model calls, commits, or frontend work were performed.
- Reporting used the [orchestration skill](C:/Users/Tanzeel/.agents/skills/orchestration/SKILL.md) and the active dispatch's Orca mailbox.

## Scope, counts, and hashes

Counts include blank lines and comments. Files were counted and hashed before code inspection. Each pass remained within 200 physical lines; total unique coverage remained below 400.

| Pass | Repository-relative file | Inclusive range | Physical LOC |
| --- | --- | --- | ---: |
| 1 | `apps/server/test/be_02/thread_database_test.rb` | 1-200 | 200 |
| 2 | `apps/server/test/be_02/thread_database_test.rb` | 201-301 | 101 |
| 2 | `ops/tests/be02/test-suites.sh` | 1-26 | 26 |
| Total | Two files, no overlapping coverage | | **327** |

Pass totals: **200** and **127** physical LOC. No unassigned dependency implementation was inspected as code.

Raw-byte SHA-256 hashes, unchanged on the pre-report verification:

- `apps/server/test/be_02/thread_database_test.rb` (301 lines): `DFEE8C750CB2AED03BD45166BA4012DD18457A1BAE119A889A670FF95F392700`.
- `ops/tests/be02/test-suites.sh` (26 lines): `0CA742E604204566315D293CFC61C102AB793DF7B2886529DDCBD7541CB17557`.

Range SHA-256 hashes use UTF-8 text formed by joining the selected `ReadAllLines` entries with LF and appending one final LF:

- Thread test 1-200: `D902F0F075C8CC5DD879011DCDE6B25638F6E523F5A693B1CCC28726FCC8621A`.
- Thread test 201-301: `6E4AD7136510A8F82CC8D9951ABD80492B69F01AEF3ED9A22EC9A8318A2BC77C`.
- Runner 1-26: `0CA742E604204566315D293CFC61C102AB793DF7B2886529DDCBD7541CB17557`.

## Governing context

The review used the supplied AGENTS instructions, root `AGENTS.md`, `.planning/STANDARDS.md`, relevant current-state material in `README.md`, `state.md`, and `documentation.md`, and the project planning/orchestration instructions. Feature context was read from:

- `docs/completion/be02-implementation-brief.md`.
- `docs/completion/be02-cd-contract.md`, version **1.0.0-collaboration.1**.
- `docs/completion/be02-drafts-implementation.md`.
- `docs/completion/be02-collaboration-implementation.md`.
- `docs/completion/be02-write-boundary.md`.
- `.planning/consultations/results/be-02/decisions.md`.

Existing `AIDEV` anchors were read at thread-test lines 12, 151, 189, 241, and 284, and runner line 2. Their intent was considered without changing them. Formatting and style enforcement remain the linters' responsibility.

The full C/D contract leaves A/B behavior intact. Consequently the existing B library's `NotAvailable` message is not assessed against the new C/D HTTP error wording. The post-snapshot revocation case is assessed against the documented permission to finish the old read snapshot, rather than an invented requirement to observe later revocation within the same snapshot.

## Findings and defect density

**Defects observed: 0. Defect density: 0 / 327 × 1,000 = 0.00 defects/KLOC.**

There are no confirmed findings requiring a severity, failure scenario, fix, or regression recommendation. This is a bounded static result, not a runtime pass or a claim that defects do not exist. The limitations below are evidence boundaries, not additional defects hidden from the count.

## Review checklist and static observations

| Area | Result | Evidence within the assigned scope |
| --- | --- | --- |
| Fixture roles and lifecycle | STATIC CHECKED | Lines 18-43 establish the API connection, check its login role, track additional fixture identities, and remove/roll back fixture resources. Base-helper behavior remains unreviewed. |
| Empty/null and maximum-value cases | STATIC CHECKED | Lines 45-89 cover empty conversations, nullable values, non-BMP text truncation, message/thread ordering, and cursor termination. Lines 167-183 exercise foreign keys, invalid JSON shapes, recipient/attachment bounds, and a non-finite timestamp. |
| Read state does not mutate business data | STATIC CHECKED | Lines 91-106 compare business snapshots around reads and check per-user read/unread behavior. The snapshot includes whole rows, so it also captures newly added metadata values. |
| Scope isolation and inaccessible items | STATIC CHECKED | Lines 108-126 check foreign, private, missing, and mismatched resources through the B service interface without exposing a different B exception message. |
| Revocation timing | STATIC CHECKED | Lines 128-141 distinguish a membership removal after a read snapshot has begun from a fresh read after removal, and also exercise organization-membership loss. This is sequential snapshot evidence expressed by tests, not an executed C/D write race. |
| Narrow D metadata compatibility | STATIC CHECKED | Lines 143-165 retain forced-RLS and restricted-column expectations while allowing D's read-state metadata columns. A seeded read-state row precedes the no-claims checks, avoiding an empty-table-only assertion. |
| Claims-free DML has no effects | STATIC CHECKED | Lines 152-156 assert an empty metadata read, zero rows affected by an `updated_at` update, and equality of before/after business snapshots. They do not merely accept successful SQL execution as isolation evidence. |
| Forbidden identity/data mutations | STATIC CHECKED | Lines 157-164 retain restrictions on user/organization reassignment and thread subject updates while checking scoped access with transaction-local claims. |
| Dependency-aware rollback/reapply | STATIC CHECKED | Lines 185-208 remove D, then C, then B; retain mailboxes, sessions, and mailbox membership revisions; reapply B, C, then D; and roll back the enclosing transaction. The final business snapshot and thread-detail assertion check restoration of B fixture behavior. |
| Helper intent, bounds, and cleanup | STATIC CHECKED | Lines 210-301 use parameterized fixture values, lock session rows before authorization generations, bound page traversal to 20 iterations, roll back local claim transactions, and order snapshot aggregation deterministically. |
| Required draft request suite | STATIC CHECKED | Runner line 8 fails if `test/requests/drafts_test.rb` is absent; lines 9-16 include it through the request-test glob. Its existence was separately verified as filesystem metadata only. |
| All BE-02 suites and failure propagation | STATIC CHECKED | Runner lines 5-7 require the named baseline suites; line 9 discovers all matching BE-02 and request suites. Lines 11-26 run suites separately, impose timeouts, accumulate nonzero results, run Steep/RuboCop, and return failure when any check fails. |
| Maintainability and unnecessary complexity | STATIC CHECKED | The assigned changes remain within fixture compatibility and suite execution. No concrete over-engineering, harmful duplication, new hot-path database loop, or misleading touched anchor was identified. |
| Documentation/interface alignment | STATIC CHECKED | Published C/D ownership, read-state metadata, snapshot, and migration dependency descriptions agree with the expectations visible here. This does not verify every documentation claim about unassigned implementation code. |
| Full C/D HTTP priorities, wire shapes, budgets, and write races | OUT OF SCOPE / NOT_RUN | These are requirements for their dedicated implementation and request/concurrency suites. Neither the B service assertions nor runner discovery proves them. |
| Runtime, lint, typecheck, integration, visual QA | NOT_RUN | Execution was explicitly prohibited for this review assignment. Merely seeing those checks in the runner is not evidence of successful execution. |

## Published dependencies, not reviewed implementations

- `test/be_02/database_test_helper.rb`: the base fixture/test interface supplies administrative/API/worker connections, disposable organization/user state, membership fixtures, and teardown. The assigned test explicitly verifies the API login name, but this review did not audit the helper's connection setup, fixture preparation, or cleanup implementation.
- `Elevateo::ThreadReads`, `Elevateo::ThreadReads::Cursors`, and tenancy helpers: the tests call list/detail with identity, session, cursor, and connection inputs, consume serialized B JSON, and expect `NotAvailable` for inaccessible resources. The published tenancy interface supplies transaction-local identity and a repeatable-read, read-only snapshot. Their implementations, SQL, serialization budgets, and authentication enforcement were not reviewed.
- `db/be02_threads`: the test consumes validation/tables/policies fragments and the B down script. Actual table definitions, grants, RLS predicates, and down-script effects were not reviewed.
- `db/be02_drafts`: the published C migration comprises tables, policies, scope, save, operations, and grants fragments plus reversal. It owns author-scoped drafts and operation state and relies on the protected write foundation. The test invokes its fragments but does not establish C data preservation or HTTP behavior; the SQL implementation was not reviewed.
- `db/be02_collaboration`: the published D migration comprises tables, policies, target-reader support, and reversal. It adds read-state version metadata while retaining B read/unread meaning; the published standalone reversal retains B state and C data. The assigned test checks the combined D/C/B reversal sequence inside a transaction, not an independently committed D-only rollback, migration-wrapper operation, or complete C/D data/grant audit.
- Protected write foundation and mailbox membership revisions: the published lock order is session first, then sorted authorization-generation locks, then business state. C/D depend on the foundation; mailbox-only revisions remain outside the B reversal. Only the assigned fixture's ordering and retention assertions were reviewed, not the production write boundary or concurrent revocation enforcement.
- Runner caller and tooling: `test-suites.sh` expects the server working directory, configured database environment, complete migration sequence, Bundler, GNU `timeout`, Steep, and RuboCop. The caller, environment, schema preparation, other test files, and tooling configurations were not inspected as code.

## Executed evidence and remaining verification

Executed evidence consists of filesystem line counts, whole-file and range SHA-256 calculations, scoped text/anchor inspection, a metadata-only existence check for `apps/server/test/requests/drafts_test.rb`, and Orca dispatch checks/reporting. Both reviewed whole-file hashes were unchanged when checked again before report creation.

**Runtime: NOT_RUN.** No Ruby tests, Bash runner execution, syntax/lint checks, typechecks, database statements, Docker workloads, host application tests, or UI checks were executed by this worker. No disposable Docker resources were created, so this assignment required no Docker cleanup.

The coordinator still needs actual containerized execution of the complete suite runner and the relevant migration/rollback and C/D request/concurrency checks. Successful suite discovery in this static review does not substitute for that evidence. Unassigned implementations and any remaining dedicated design review belong to their separately bounded assignments.
