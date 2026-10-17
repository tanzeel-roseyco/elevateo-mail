# BE02 Auth RLS production review

Static review completed on 2026-10-13 UTC: **zero confirmed defects in 310 unique physical source lines (0.00 defects/KLOC)**. The assigned bootstrap is consistent with the accepted Auth RLS repair design. This result does not establish a runtime pass, complete the broader BE02 review, or authorize production activation.

## Review provenance and boundaries

- Task: `task_523c41a97ab7`; dispatch: `ctx_d381aba259ed`.
- Reviewer: Codex, actual observed model **`gpt-6-astra`**, effort **`max`**. `orca orchestration worker-show --dispatch ctx_d381aba259ed --json` reported the provider/model and live terminal preview `GPT-6-Astra max`; launch configuration fields were null/default rather than an explicit requested override. Observation request: `83a39d46-67f2-45c7-8dc7-43a39f7e9a39`.
- Read-only source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
- Applied the project instructions, `.planning/STANDARDS.md`, the supplied adversarial-review rubric, author prose `docs/completion/be02-auth-rls-repair.md` in the source checkout, and the coordinator's [accepted decision](be02-auth-rls-decision.md). Project state and orchestration documentation supplied context, not additional implementation coverage.
- Exactly two bounded source passes; no other application source was inspected. Physical line counts include comments and blank lines. No implementation, shared ledger, or commit changes were made. This report is the only file produced.
- Formatting remains with CI. The separately assigned design reviewer owns tradeoff analysis and any Obsidian simulation. This review neither substitutes for that review nor reopens the accepted architecture.

## Hash and coverage record

| Pass | Source | Physical lines | Before SHA256 | After SHA256 |
| --- | --- | ---: | --- | --- |
| 1 | `ops/db/bootstrap-auth-grants.sql` | 1–147: 147 | `2f63d116e2b23af69d7abd0452893509231e39658d298a9ad207e75a8a96fcd6` | `2f63d116e2b23af69d7abd0452893509231e39658d298a9ad207e75a8a96fcd6` |
| 2 | `ops/tests/be02-guards/auth.sh` | 1–163: 163 | `69f66bc0264109f65f31126e97115985e92028eebb8252ef51be1543e454e1ff` | `69f66bc0264109f65f31126e97115985e92028eebb8252ef51be1543e454e1ff` |

Pass 1 was hashed before review at `2026-10-13T00:03:27.1573511Z` and after review at `2026-10-13T00:08:51.0227096Z`. Pass 2 was hashed before review at `2026-10-13T00:03:59.0985693Z` and after review at `2026-10-13T00:08:51.1064127Z`. Both match the dispatched pins; **no source drift detected**. Each pass is below 200 lines, and the whole assignment is below 400 lines.

## Pass 1: bootstrap correctness and security

| Checked area | Evidence and result |
| --- | --- |
| Identity, prerequisites, bounded transaction | Lines 1–18 require the expected session and current identity, a regular sessions table, and the private role's restricted attributes. Errors are deliberate and `ON_ERROR_STOP` is enabled. Transaction-local timeouts bound waits and statement execution. |
| Fresh catalog state after waiting | Lines 20–49 put `LOCK TABLE ... ACCESS EXCLUSIVE` in its own statement before decisive catalog reads. `READ COMMITTED` is set before the first query. The next statement records the relation state and existing policies after the lock has been acquired. There is no pre-wait policy snapshot reused for the decision. |
| Null-safe catalog assertions | Lines 33–44 use `INTO STRICT`, explicit `IS DISTINCT FROM` checks, and an exact four-column/type count. Lines 70–81 distinguish absence from a malformed existing policy. Lines 135–143 reject a missing comparison row or changed preservation snapshot rather than allowing SQL null to bypass a guard. |
| Exact role graph | Lines 52–67 recheck restricted role attributes, reject table-owner authority, reject every parent membership, and require exactly the accepted incoming grant from `supabase_admin` to `elevateo_owner`, with the specified membership options. Runtime roles are checked for direct or transitive membership, usable privileges, and role assumption. |
| Exact policy tuple and expression | Lines 69–92 bind the reserved name to `auth.sessions`, SELECT, permissive mode, the singleton private-role OID array, deparsed expression `true`, null `WITH CHECK`, and the expected policy OID. An omitted `USING` fails the null-safe expression comparison. Other policies explicitly naming the private role are rejected; effective SELECT/ALL policies also consider PUBLIC and usable role privileges. The explicit CASE handles PUBLIC's OID zero without passing it to `pg_has_role`. |
| Four-column effective privilege boundary | Lines 93–117 reject table-wide privileges, column writes, SELECT delegation, an extra readable column, access to another Auth relation, schema creation/delegation, and sequence privileges for the enumerated application roles. Only the private role's four accepted session columns are exempted from the column-read rejection. The sequence CASE avoids invoking its privilege function for non-sequences. |
| Mutation, rerun, and preservation | Lines 119–147 create the exact policy only if absent, grant schema USAGE and four column SELECT privileges, then repeat the guards and verify the positive grant postcondition. Owners, RLS/FORCE flags, and unrelated session-policy catalog rows must remain unchanged. There is no revoke-and-repair behavior, default-ACL mutation, or live session-row scan. A raised error precedes COMMIT. |

PostgreSQL defines comma-separated privilege checks as testing whether any listed privilege is present; MEMBER, USAGE, and SET have different role-graph meanings. Those semantics support the bootstrap's effective-privilege checks rather than a check of direct ACL entries alone. [PostgreSQL 17 access privilege inquiry functions](https://www.postgresql.org/docs/17/functions-info.html)

The lock placement follows the accepted isolation requirement; a fresh transaction snapshot must not be assumed after a wait under a stronger isolation level. This implementation explicitly selects READ COMMITTED and separates lock acquisition from the authoritative query. Runtime concurrency remains unverified here. [PostgreSQL 17 LOCK](https://www.postgresql.org/docs/17/sql-lock.html)

The constant policy expression is intentional under the accepted design: session/user binding belongs to the private facade. The facade and its authority checks were outside this assignment and have not been independently verified here. The table lock also does not freeze all shared role or schema catalog changes; the accepted exclusive administrative setup requirement still applies.

## Pass 2: hostile fixtures and regression intent

| Checked area | Evidence and result |
| --- | --- |
| Privilege and prerequisite failures | Lines 1–36 declare table and column privilege escalation cases, the fifth column, SELECT delegation, PUBLIC DML, another Auth table, schema and sequence drift, disabled RLS, and a wrong column type. Expected diagnostics identify the relevant privilege or prerequisite guard. |
| Positive read and runtime denial entry points | Lines 38–53 declare restoration of the four-column grant, missing-policy creation, both FORCE settings, and API/worker denial checks under `SET SESSION AUTHORIZATION`. These are calls to separate SQL files, not independently reviewed proof of their assertions. |
| Policy fixture legality and error specificity | Lines 55–83 exercise restrictive mode, PUBLIC/wrong/multiple roles, false/missing/contextual predicates, wrong commands, additional SELECT/ALL policies, and a private INSERT policy. The wrong-WITH-CHECK fixtures use ALL/UPDATE; the INSERT fixture uses WITH CHECK. Expected messages name the reserved-policy or additional-policy guard. No independently identified syntax defect occurs in these assigned declarations. |
| Role and membership failures | Lines 85–103 cover prohibited role attributes, private table ownership, parent grants with INHERIT both enabled and disabled, and runtime paths through the private role or `elevateo_owner`. The parent-policy cases expect membership rejection; they should not be described as isolated proof of the later policy-applicability predicate. |
| Idempotence and preservation | Lines 105–137 include an unrelated vendor SELECT policy, PUBLIC INSERT policy, and the same reserved name on another table. The catalog snapshot covers Auth relations, schema, columns, policies including OIDs, and default ACLs. A null-safe comparison follows an explicit rerun. A separate case ensures the same policy name on another table cannot satisfy the sessions-table requirement. |
| Rollback and session-semantics entry point | Lines 139–163 take catalog snapshots using separate `psql_cmd` calls around a deliberately failing post-grant case and reject an empty or changed result. The final call delegates real-session semantics to a separate SQL file. Correct rollback execution and the delegated assertions require runtime/harness evidence. |

The hostile policy definitions agree with PostgreSQL's command-specific grammar: SELECT has no WITH CHECK clause, while ALL and UPDATE can use both expressions. Omitting USING is legal and therefore tests the null-expression guard rather than parser rejection. [PostgreSQL 17 CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html)

The production code keeps its pre/post verification in one bounded loop, with named roles and catalogs rather than live-data enumeration. No confirmed unnecessary abstraction, duplicated production verifier, swallowed error, unsafe external-input interpolation, or hot-path performance regression was identified in this scope. Important ordering, PUBLIC handling, privilege boundaries, and rollback intent have corresponding AIDEV comments. Author prose documents the repair and its outstanding runtime work.

## Defect register and acceptance limits

**Confirmed defects: 0. Reviewed denominator: 310 unique physical source lines. Defect density: `0 / 310 × 1000 = 0.00 defects/KLOC`.** There are no defect-specific reproductions, severity assignments, fixes, or acceptance tests to prescribe. This is a bounded static finding, not evidence that unreviewed dependencies or the application are defect-free.

The shell harness definitions (`run_case`, `run_file`, `psql_cmd`, fixture initialization, and construction of `auth_body`) and all included SQL files were excluded. Consequently, this review verifies their call sites and declared expected failures, not their actual error matching, transaction rewriting, rollback guarantees, or session assertions. No host tests, Docker/SSH work, provider access, other agents, frontend changes, deployment, or real mail sending were performed.

Root retains these evidence requirements:

1. Execute the pinned PostgreSQL/Auth profile and guard suite in Docker. Verify hostile fixtures reach their named guard errors rather than failing during setup or parsing; include the omitted-USING/null-expression case and catalog containing mixed relation kinds.
2. Demonstrate nonempty session reads as the actual private role, without owner/superuser/BYPASSRLS authority. Show the four-column read succeeds while the fifth column, `SELECT *`, writes, and API/worker direct access fail under both relevant FORCE states.
3. Complete the separate helper/facade and real-session tests for correct binding, missing/wrong/expired sessions, and forged GUC attempts. Those semantics cannot be concluded from a constant policy expression alone.
4. Confirm exact rerun catalog preservation and deliberate post-grant failure rollback through fresh connections, including policy OIDs, owners, RLS/FORCE flags, ACLs, unrelated policies, and unchanged default ACLs.
5. Complete the independent deterministic concurrency harness: overlapping fresh bootstrap connections, a catalog change committed during a lock wait, and held-lock timeout/rollback. Verify the later decision sees the post-wait state and no partial grants or policy survive failure.

The dispatch reports that Runtime4 stopped at syntax in a separate visibility test, with its repair and the concurrency harness active. That file was not inspected, and that reported failure is **not counted as a new defect in this review**. Root owns runtime acceptance, the separate design review, and updates to shared review ledgers.
