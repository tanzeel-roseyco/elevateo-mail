# BE-02 write guard/schema adversarial review

Review outcome: **two static defects observed: one Medium and one Low**. The assigned implementation provides a private transaction marker and narrowly exposed SQL entry points, but its duplicate-entry error path can invert guard lock order and its multidimensional-array validation can raise the wrong error. Runtime verification is **NOT_RUN**; this report is not a release approval or proof of complete correctness.

Assignment: `write_guard_schema`; task `task_0181fcac7b0e`; dispatch `ctx_d13cc1fec09f`; run `run_5cc7ae2ab900`. Reviewed source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Paths below are relative to `apps/server` unless marked repository-relative. Only this report was written; no source, other worker files, or shared review ledger were changed.

## Findings

### WG-01 — Medium: duplicate entry acquires new guards before rejecting re-entry

**Location:** `db/be02_writes/guard.sql:29-34` and `:46-48`.

The routine checks `s.write_transaction = pg_current_xact_id()` only after inserting/locking the new target set. Sorting the set within each call does not preserve transaction-wide order when an earlier call has already acquired a higher guard. This affects a second SQL entry call within one transaction; the published HTTP wrapper normally calls the entry routine once, and no ordinary handler double-call was established in this bounded review.

**Concrete failure scenario (static interleaving, not executed):** Use two committed guard rows in the same organization with UUIDs `B < A`, and two valid sessions for actor A. Transaction T1 enters with its first session and no targets, taking A's guard and recording its marker. T2 enters with the second session and target B, takes B, then waits on A. T1 calls `begin_protected_write` again for its first session, this time with target B: it waits on B before reaching the existing re-entry rejection. T1 and T2 now form a deadlock; a lock timeout or deadlock victim replaces the intended immediate `25001` rejection, potentially aborting the otherwise valid T2 request. PostgreSQL retains row locks through the transaction and detects cycles between transactions; the inference follows those documented rules. [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html)

**Minimal fix:** Move the existing current-transaction marker rejection before all generation insertion/acquisition, after the locked session's prerequisite checks. Preserve the documented authentication-error priority when placing that rejection. No new ledger, retry strategy, or lock abstraction is needed; update the adjacent AIDEV explanation to cover transaction re-entry.

**Regression:** With distinct real API connections, precreate the two ordered guard rows, let T1 enter once, and observe T2 waiting for A after acquiring B. T1's repeated entry must raise the intended `25001` without waiting for B; after T1 rolls back, T2 must complete. Also cover repeated entry with identical targets. The assigned eight-test suite has no repeated-entry case.

### WG-02 — Low: multidimensional targets can fail inside `array_position` before validation

**Location:** `db/be02_writes/guard.sql:14-16`; assigned validation tests at `test/be_02/write_boundary_database_test.rb:60-67`.

The validation expression calls `array_position(p_targets, NULL)` in the same OR expression as, and textually before, the dimensionality check. PostgreSQL requires a one-dimensional argument for that function and does not guarantee Boolean operand evaluation order. Consequently the validation is not safe for the malformed dimension it explicitly intends to reject. [Array function requirements](https://www.postgresql.org/docs/17/functions-array.html), [expression evaluation rules](https://www.postgresql.org/docs/17/sql-expressions.html#SYNTAX-EXPRESS-EVAL)

**Concrete failure scenario:** An API-role SQL caller supplies a two-dimensional UUID array containing one or two elements, such as `ARRAY[[valid_uuid]]::uuid[]`, with an otherwise valid digest and identity. Its cardinality does not exceed two, but evaluating `array_position` can raise its own unsupported-array error before the routine reaches the intended `invalid protected write targets` exception with SQLSTATE `22023`. This is a SQL boundary error-contract defect, not an observed authorization bypass or demonstrated HTTP request path: the published Ruby adapter supplies a flat list.

**Minimal fix:** First reject NULL, excessive cardinality, and nonempty non-one-dimensional arrays in a separate statement containing only dimension-safe operations. Only then call `array_position` in a subsequent check for NULL elements. Merely reordering terms within the same OR is insufficient.

**Regression:** Call the SQL entry point directly with one-element and two-element multidimensional arrays and assert `22023`. Include NULL array, NULL element, empty array, two valid distinct targets, and three targets. The helper's `targets.join` serializer cannot express all these SQL shapes faithfully; use parameterized SQL array literals for the malformed cases. The assigned suite currently checks the three-target limit and duplicate targets but does not cover NULL or multidimensional arrays.

## Coverage and exact source identity

Physical LOC includes blank and comment lines. Counts and SHA-256 hashes were collected before code inspection, then checked again before writing this report; all seven hashes remained unchanged. The coordinator corrected the helper basename from `write_boundary_database_helper.rb` to `write_boundary_database_test_helper.rb` before pass 2.

| Pass | File | Inclusive lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `db/migrate/20261013000003_create_protected_writes.rb` | 1-18 | 18 | `885214DE2130F5D66B638A0967435EB180FD3714F67A2D738959DDD25AA7AE81` |
| 1 | `db/be02_writes/guard.sql` | 1-53 | 53 | `A28B91E0B23016BC28AB6974DA45CCF0AF9EFBCEEBE757A1948C2D9CEA7D2FB4` |
| 1 | `db/be02_writes/grants.sql` | 1-33 | 33 | `E46F8FBF6898E91CDB1120B0C504DD2F4BCCDD6B121D97223209A7CE6CEF736D` |
| 1 | `db/be02_writes/down.sql` | 1-4 | 4 | `1D926930AEE2F32009490F5BEC09E705F73691EBA70B7D6C74DA0BAAB7D0FCB1` |
| 1 | `db/be02_writes/assertions.sql` | 1-18 | 18 | `9B4DEE564C225213135E7D16B421436D3262126E6B9F98975B4694EFEB29BA8B` |
| 2 | `test/be_02/write_boundary_database_test.rb` | 1-85 | 85 | `7CCABE361B0B626CE8B20FEEE20DFFFBE307488DCE47AE5AEA29EEA62512DCD9` |
| 2 | `test/be_02/write_boundary_database_test_helper.rb` | 1-58 | 58 | `18AB547DBAE75FE148DD483E3CF5E54EFDBBB8B48D23C9C207CCE647227C0124` |

Pass 1: **126 LOC**. Pass 2: **143 LOC**. Entire assignment: **269 unique physical LOC**, within the 200-per-pass and 400-per-assignment limits. **Defects: 2; defect density: 2 / 269 × 1,000 = 7.43 defects/KLOC** across the complete assigned source/test denominator. No additional defect was counted for an unverified dependency or missing runtime evidence; zero observed defects in an area does not establish that the area is defect-free.

## Review checklist and conclusions

| Area | Static assessment and limits |
| --- | --- |
| Private proof; forged GUCs and claims | Reviewed. Marker is stored on a private session row and matched to the current xid8; actor/organization GUCs are consistency checks, not the marker. Assertion checks marker presence, actor inclusion, exact requested target, and claims. Assigned tests cover denied private access, wrong identity/org, pre-entry assertion, and prior-transaction replay. These are source observations, not executed proofs. |
| Null, empty, maximum inputs | Reviewed. Empty target list still yields actor guard; DISTINCT removes duplicates; more than two supplied targets is rejected. NULL-target assertion is explicitly denied. WG-02 identifies unsafe dimensional validation; malformed digest and session-row behavior depend on unreviewed base helpers. |
| Lock order and revocation | Reviewed. First entry takes the session before sorted actor/target guards and inserts then locks each tuple; authorization is checked again after guard acquisition. WG-01 affects repeated entry. Membership routine participation and actual racing transactions are outside this source assignment and NOT_RUN. |
| Transactions and state rollback | Reviewed. Marker and idle refresh are transactional; assertion refuses absent or earlier-transaction markers. The assigned rollback test checks missing tombstone insertion and idle activity rollback. Session/guard pair constraint is present. Savepoint and cross-transaction race behavior were not executed. |
| ACL and direct membership DML | Reviewed. New functions revoke PUBLIC and named-role access, then expose only entry to API and assertion to owner. Migration checks effective function rights, grant options, private-table/column rights, and API membership INSERT/UPDATE/DELETE privileges. Test attempts direct membership UPDATE and private state access. This does not certify the unreviewed bootstrap role graph or all preexisting privileges, including membership TRUNCATE. |
| Ownership and true roles | Reviewed creation intent: migration switches to session_owner; both functions use SECURITY DEFINER with fixed pg_catalog search_path and qualified tables. Actual ownership, LOGIN/SUPERUSER/BYPASSRLS/INHERIT/SET ROLE properties, and the identities behind @api/@admin remain unverified. They are established outside assigned code; owner-seam tests use @admin rather than locally asserting its role. |
| Migration order, rerun, down | Reviewed. Up executes guard, assertions, then grants; down removes assertion, entry, then constraint/columns without CASCADE. Published downstream C/D/membership migrations must be rolled back first. Raw up SQL is intentionally not idempotent; Rails migration bookkeeping and actual migrate/no-op/down/up execution were not verified. |
| Purpose, statuses, wire shape, budgets | Compared with the frozen contract. This slice returns bounded-status/metadata interfaces and does not define complete HTTP responses. Exact 401/409/404 priority, error envelopes, CSRF/origin, 10-second request deadline, projection budgets, and only-2xx/terminal-409 commit policy remain caller/base-helper responsibilities, unreviewed here. Findings do not propose wire or status redesign. |
| Tests and isolation | Eight test methods cover a successful guard, wrong claims, private SQL denial, marker replay, target inclusion/deduplication, max/isolation rejection, rollback, and upstream Auth expiry. Helpers parameterize SQL, track target cleanup, and provide lock-wait observation/timeout assertions. Their superclass, fixtures, connection roles, and separately documented concurrency/deadline suites were not opened. Test named local-or-Auth expiry exercises Auth not_after in this file; local/access-expiry coverage cannot be inferred repo-wide. |
| Simplicity and performance | Bounded target cardinality limits guards to at most actor plus two targets. No unbounded collection traversal or unnecessary abstraction observed in these files. Repeated status checks serve authorization revalidation. The proposed repairs are local ordering changes; design tradeoffs were analyzed statically, with no model, agent, or Obsidian calls in this assignment. |
| Comments, names, documentation | Read assigned AIDEV anchors. They explain private authority, snapshot choice, lock order, grants, and wait observation. Published write-boundary/draft/collaboration docs describe prerequisites and deferred evidence. WG-01 requires the lock-order comment to remain aligned with its repair. Formatting and style are delegated to linters and were not reviewed as defects. |

## Published interfaces used as context; implementations unreviewed

Repository-relative governing context consulted: `AGENTS.md`, `README.md`, `state.md`, `documentation.md`, `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, `LOCAL_BUILD_PROMPT.md`, and `docs/local-completion-plan.md`. Feature context: `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md` in that same directory, and `.planning/consultations/results/be-02/decisions.md`. Review uses frozen contract **1.0.0-collaboration.1**, accepted D01-D08, and the supplied full adversarial rubric.

- `app_auth.check_digest`, `session_status`, and `session_metadata`: documented digest validation, cookie-bound local/upstream-auth/session/org checks, and safe metadata projection. Their source is outside coverage. Whether each nil/missing row and every expiry precedence is correct depends on those implementations.
- `V1::WriteController#protected_write` and SessionWrites: documented boundary validation, independent authentication before SQL, context/CSRF checks, bounded targets, READ COMMITTED transaction, deadline, serialization budget, and commit/rollback policy. No controller/service source was read.
- C `app.save_draft` and D collaboration/member routines: documented calls to the private assertion with the actor/target, business authorization, row locks, and shared generation/tombstone discipline. No business routines, downstream migrations, or RLS policies were reviewed.
- `test/be_02/database_test_helper.rb` / SessionDatabaseTestCase: supplies actual connections, fixtures, base cleanup and role setup. Source unreviewed; @api/@admin variable names alone are not runtime role evidence.

## Executed evidence and remaining work

Executed evidence consists of read-only documentation/source inspection, AIDEV searches, file count/hash collection and recheck, PostgreSQL documentation lookup, and Orca coordination. A read-only PowerShell manifest recheck initially had a pipeline parse error; its corrected run succeeded and produced the hashes above. No application execution resulted from that bookkeeping error.

**Runtime: NOT_RUN.** No Docker, host application tests, migrations, linters, model calls, subagents, SSH, commits, frontend actions, or live sends were performed. The lock interleaving is reasoning, not a reproduced runtime result. The coordinator should repair/triage WG-01 and WG-02, then obtain the authorized Docker evidence for real-role privileges, both regressions, migrate/down/up/no-op rerun, revocation ordering, and the already documented integration suites. The separate design review and integration-wide coverage remain coordinator-owned. No shared `code-reviews.md` update was made because this dispatch permits only the assigned report; its coverage and defect metrics are ready for coordinator aggregation.
