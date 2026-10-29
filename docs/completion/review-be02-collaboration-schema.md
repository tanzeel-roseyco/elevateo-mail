# BE-02 collaboration schema adversarial review

Review date: 2026-10-13 (Australia/Sydney). Assignment: `collaboration_schema`; run `run_5cc7ae2ab900`, task `task_9416a6df68c3`, dispatch `ctx_2718e3317ec2`. Reviewer: dispatched Codex terminal `term_fb24e479-70df-4688-8db8-692a953e43ef`.

**Result: zero confirmed defects observed in 312 unique physical lines; 0.00 defects/KLOC. One conditional rollback integration risk remains unresolved. Runtime: NOT_RUN.** This is bounded static review, not proof that the application, migrations, authorization races, or tests pass.

## Scope and evidence

Source checkout: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. All code paths below are relative to its `apps/server` directory. Physical counts include blank and comment lines. Files were counted and SHA-256 hashed before reading; a closing count/hash comparison matched all seven original values. No unassigned dependency implementation was inspected.

| Pass | File | Inclusive lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `db/be02_collaboration/down.sql` | 1-14 | 14 | `FDAF33AAAC456D3E0583AC6B3749E92E501085FDE651187FB7159D4A59BD3DBC` |
| 1 | `db/be02_collaboration/policies.sql` | 1-38 | 38 | `11C6C70800C35905329304EF5653A13223464F4C4988ED3BD22256A98A4B82C9` |
| 1 | `db/be02_collaboration/tables.sql` | 1-36 | 36 | `C51DF0E1C54C6C4D2FE85C6A0FD5D83D0477B381BCD6051510325D51864A890A` |
| 1 | `db/be02_collaboration/target_reader.sql` | 1-40 | 40 | `90EA633B5FA615554AAD73C8CA2F4866046CEB0029E5897EF9AC0F7C345A59B8` |
| 1 | `db/migrate/20261013000005_create_app_collaboration.rb` | 1-18 | 18 | `B8A0CB8790D138FBB58D47BBB56049D0DF9BE1F2231CA488C8F8F74D37A01A4A` |
| 2 | `test/be_02/collaboration_schema_test.rb` | 1-81 | 81 | `BDFAD94AFEEB1D350C193D2C7CA6FC8BB33A07D343A5541E6A630DD8C761ECEB` |
| 2 | `test/be_02/thread_notes_database_test.rb` | 1-85 | 85 | `FA9E63EF0E4F19FA125D4E022F397D8951A7FEB600DCFC68DFA2509091C17FDF` |

Pass 1: 146 LOC; pass 2: 166 LOC. Both are below 200 lines; total unique coverage is 312, below the 400-line assignment cap. A targeted reread of the 81-line schema test added no unique coverage. No source changes were made. Only this assigned report was written; the coordinator owns any aggregate `code-reviews.md` update.

Context included root/project instructions, the current state and relevant requirements in `README.md`, `state.md`, `documentation.md`, `.planning/STANDARDS.md`, planning/orchestration guidance, local-completion instructions, and these governing BE-02 documents:

- `docs/completion/be02-implementation-brief.md`.
- `docs/completion/be02-cd-contract.md`, version **1.0.0-collaboration.1**.
- `docs/completion/be02-drafts-implementation.md`.
- `docs/completion/be02-collaboration-implementation.md`.
- `docs/completion/be02-write-boundary.md`.
- `.planning/consultations/results/be-02/decisions.md`.

The later exact contract and accepted decisions govern over older illustrative endpoint or migration numbering. The full supplied adversarial rubric was applied. All nine `AIDEV-NOTE` anchors in the assigned files were inspected; none was altered.

## Confirmed findings

**None observed within the inspected scope.** Defect count: **0**. Defect density: **0 / 312 × 1,000 = 0.00 defects/KLOC**. This excludes the unresolved dependency question below and does not certify unreviewed code or unexecuted tests.

## R1 — Conditional overlap in rollback privileges

- **Classification/severity:** unresolved integration risk, potentially **P2 / medium** if the C dependency uses the same column grants; not counted as a confirmed defect.
- **Locations:** `db/be02_collaboration/down.sql:7-8`; corresponding D grants at `target_reader.sql:2-3`; preservation assertions at `test/be_02/collaboration_schema_test.rb:38-41`.
- **Static evidence:** D unconditionally revokes the session owner's `SELECT (id, organization_id, visibility)` on mailboxes and `SELECT (organization_id, mailbox_id, user_id)` on mailbox memberships. The C handoff states that its private owner receives actor-scoped reads of existing organization/membership/mailbox/thread tables for compose checks. The assigned reversal test checks that C's table still exists, then reinstalls D before exercising further behavior; it does not call a C operation while D is absent.
- **Concrete conditional failure:** if C grants these same columns to `elevateo_session_owner`, applying D and then reverting only D removes privileges that C still needs. A subsequent C draft authorization/save can fail with a database permission error although C remains installed. A surviving table-level grant or a different C owner could invalidate this scenario; those implementations were deliberately not inspected.
- **Minimal resolution/fix:** have the coordinator correlate the already assigned C grant/owner review. If overlap exists, make D down restore the exact pre-D privilege baseline, revoking only D-exclusive privileges; avoid solving this with a broad table grant. If no overlap exists, record the concrete C owner/grant evidence and close the risk.
- **Regression:** start from B+C and record effective relevant privileges; apply D, reverse only D, and compare the effective baseline. Execute an authorized C save and an unauthorized C save using the genuine API login through the published protected-write boundary while D is absent; confirm C behavior, B state/timestamps, and narrow grants remain intact. Then reapply D and test its reader. The existing transactional probe can retain rollback cleanup.
- **Escalation evidence:** sent promptly through Orca status message `msg_09c70252581c`; no external channel was used. No answer confirming the C grant form had arrived when this report was authored.

## Review checklist and observations

| Area | Static assessment and limits |
| --- | --- |
| Forced RLS | Both new tables explicitly enable and force RLS (`policies.sql:2-5`). Assignment USING/WITH CHECK and note SELECT/INSERT policies constrain organization and the complete visible thread identity. The note INSERT policy also fixes the author to the authenticated user. Existing thread policies and role inheritance are unreviewed dependencies. |
| Least privilege | New-table grants name columns. Assignment INSERT cannot set assignee/version/time; UPDATE cannot change identity columns. Note INSERT cannot select a historical timestamp or version, and no API UPDATE/DELETE grant is introduced. No mailbox-membership DML is granted. Effective privileges across inherited roles and pre-existing permissive policies still need actual-role checks. |
| Compound identities | Assignments use `(organization_id, mailbox_id, thread_id)` as primary key; both tables reference the corresponding complete thread key. Notes use `(organization_id, id)` uniqueness, allowing the same UUID in another organization while preventing a second binding inside one organization. The schema tests probe mismatched org/mailbox references; the notes test authors an equal UUID in a second organization. |
| Bounds/nulls | Required identities and note fields are NOT NULL. Persisted notes are 1-4096 PostgreSQL characters and version 1. Assignment versions span 0-2147483647, with the null/zero initial-state invariant and finite supported timestamps; stored read versions span 1-2147483647. Nullable assignee permits clearing without erasing the version. Boundary transport validation remains external. |
| B upgrade/down preservation | Adding `read_state_version DEFAULT 1` does not rewrite the existing boolean/timestamp fields. Down removes that column and D relations without CASCADE. The test verifies B boolean/time preservation through reapply and restoration of all captured D rows after transaction rollback. Preservation of C behavior is the unresolved R1 dependency. |
| Private function authority | `collaboration_reader` is SECURITY DEFINER, pins `search_path` to `pg_catalog`, resets the private verified-user setting, calls `assert_protected_write(digest, target)` before reads, and rejects a non-ok result. It checks actor visibility before switching the verified user to the target. EXECUTE is explicitly revoked from broad/runtime roles before the API-only grant. The marker and guard implementation itself is unreviewed. |
| Revocation races | Published `SessionWrites` takes the session then sorted actor/target generation locks before business rows; the reader delegates proof of those locks to the private assertion. The reviewed reader adds no HTTP or alternate lock order. Read snapshots and membership writers must obey their separately reviewed interfaces; race correctness is not proved here. |
| Immutable notes/history | Notes expose no ordinary mutation grant after insertion. Historical author/assignee UUIDs intentionally lack membership FKs, so membership removal does not cascade history. The authored note test removes an author through the guarded fixture seam and checks retained attribution. Thread deletion still intentionally cascades its notes. |
| Replay and error ordering | Org-scoped note uniqueness supports the ledger identity, but own-visible retry/mismatch decisions are service responsibilities. The canonical rules remain 201 first creation, 200 identical own retry, 409 visible changed operation, and generic 404 for hidden scope/other author before stored-state comparison. Those service implementations and complete retry tests were not inspected. |
| Wire limits and pagination | The notes tests author 4096 emoji, escaped controls and whitespace; reject empty, 4097-character and NUL input; assert full bodies and <=64 KiB single-note responses. A 51-note same-timestamp fixture exercises 256 KiB escaped list budgeting, whole-entry pages, UUID ordering, non-repeating cursors, complete traversal, wrong-thread cursor rejection and authorization-before-cursor behavior after revocation. Serializer/cursor implementations and empty-list handling are unreviewed. |
| Genuine test roles | Constraint/DDL fixture probes explicitly use `@admin`, appropriately for schema constraint setup; this is not runtime RLS evidence. Notes behavior invokes inherited helpers and the real service interface, but the connection helper is outside scope. Its published claim to use actual API logins was not independently verified. No genuine-role execution is claimed. |
| Maintainability/performance | Modules have focused concerns and fixed migration part names; parameterized fixture inserts preserve boundaries. The notes index matches the scoped `(created_at, id)` page order. No new broad framework, repeated hot-path application loop, or obvious unnecessary abstraction was observed. Actual query plans, existing policy expansion, and contention remain unmeasured. |
| Documentation/standards | Dedicated implementation handoffs identify schema changes, integration seams and NOT_RUN evidence. Anchors explain historical identity, scope, and B compatibility rather than merely narrating syntax. Formatting is left to linters; no formatting finding was generated. Docker, runtime, and live UI publication gates remain unsatisfied by this review. |

## Unreviewed interfaces and required follow-through

These are dependency descriptions from the published handoffs, not claims about inspected implementation:

- `app_auth.assert_protected_write(text, uuid)` is owner-only and must verify the private transaction marker, session authority, actor/target generation guards, and matching selected context. Public GUCs cannot stand in for proof. `SessionWrites` supplies ordered guards and serialization-before-commit semantics.
- Existing B `app.threads`, `app.thread_read_states`, `app.context_uuid`, tenant policies, and the role graph supply visibility to the new policies. C's `app.save_draft` and compose-reader privileges are shared rollback dependencies. Existing permissive policies must be considered together with these additive policies.
- `CollaborationDatabaseCase` supplies fixtures, `scope`, `state`, `assignment`, `note`, `member_change`, and actual connection identities. `Collaboration`, `Cursors`, and response projection/serialization supply authorization precedence, scoped replay, pagination, and byte budgets. Their source and other tests were not opened.

The coordinator should correlate existing bounded reviews and run the already authored suites in its permitted Docker harness before adding duplicate tests. Required evidence includes genuine API/worker/PUBLIC denials, FORCE RLS under the actual role graph, forged/missing/expired transaction-marker and wrong-target guard rejection, before/after-revocation write ordering, own/foreign/hidden note replay, empty lists, upper-version no-op/overflow behavior, and B+C+D up/down compatibility. These are outstanding evidence requirements, not claims that the unassigned suite lacks these cases.

## Executed evidence

Executed: read-only PowerShell file counting and SHA-256 hashing before review and at close; bounded source reads; `rg` anchor/document searches; source working-state inspection; Orca mailbox checks, progress reporting and heartbeat; creation of this report. No application or database command was executed.

**NOT_RUN:** SQL/migration execution, Docker, host application tests, lint, typechecks, unit/integration/concurrency tests, actual-role login checks, browser/UI validation, benchmarks, and live services. No subagents/model calls, SSH, commits, source edits, dependency installs or Docker resources were created. Consequently no Docker cleanup was required. Static review completion does not authorize publication or assert integrated acceptance.
