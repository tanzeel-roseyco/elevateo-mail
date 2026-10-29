# BE02 Auth RLS compatibility repair

Status: implementation candidate ready for independent review; **tests NOT_RUN**. This worker ran no Docker, SSH, host test, linter, parser, application or database command. Source inspection and file hashing are the only verification performed here. Root owns review acceptance, frozen runtime4 evidence, documentation synchronization and Docker cleanup.

Task `task_cfba1e0ee1cd`, dispatch `ctx_d9f45a4d471f`. Scope is the eight code/test files below plus this report. Root additionally authorized the R1 assertion repair in `private-grants.sql` and the single `run.sh:90` fixture hook (`msg_647cedb6da8a`, `msg_619060b8c06d`). No application helper, API contract, upstream snapshot, `bootstrap.sql` or `fixture.sql` was edited. No commit or new agent was created.

## Evidence and accepted decision

Runtime3 failed at the old Auth grant bootstrap's RLS rejection after isolated guards passed; cleanup passed. Its old RLS-off fixture did not represent pinned Auth:

| Existing evidence | SHA256 |
| --- | --- |
| `ops/local/be02-runtime-stage-f1fd9202222a4454843f5e657356c7aa/evidence/result.json` | `1d7bbc2948e1b0e15aa0130c68c9e722785c04e2655fc7c3065b8179f44a41ba` |
| `ops/local/be02-runtime-stage-f1fd9202222a4454843f5e657356c7aa/evidence/017-auth-grants.log` | `9f072ca2aa0eed48e713893a6b402bbfb0cec08d57990fc2255b1136ad17a988` |

The [pinned Auth migration](https://raw.githubusercontent.com/supabase/auth/v2.196.0/migrations/20240612123726_enable_rls_update_grants.up.sql) enables RLS on `auth.sessions`. The repair follows root's accepted three-opinion synthesis in `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/docs/completion/be02-auth-rls-decision.md`, SHA256 `dc55258802eaaadb1ab4e2cf8107d3bb76baf74658fe3344e46101d8fda74570`. Consultation identities and acceptance belong to that root record; this worker did not start those sessions.

Relevant pins remain `supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232` and `supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`. Tagged source inspection is not image execution evidence.

## Production change and trust boundary

`bootstrap-auth-grants.sql` now requires existing RLS and creates only the following policy when absent:

```sql
CREATE POLICY elevateo_private_session_select ON auth.sessions AS PERMISSIVE
  FOR SELECT TO elevateo_session_owner USING (true);
```

That role remains NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and NOREPLICATION. It cannot own or inherit/SET the Auth table owner. The only incoming membership remains the exact admin-granted owner-to-private edge with ADMIN false, INHERIT false and SET true; the private role has no parent role. API and worker cannot reach it through direct or indirect membership. The existing exhaustive Auth schema/table/column/sequence privilege checks run both before and after mutation. Grants remain schema USAGE and SELECT on exactly `id`, `user_id`, `created_at`, `not_after`; no table SELECT, fifth column, DML, grant option or default privilege is added.

The policy permits those four columns across sessions for the private role. This is intentional: actual `auth_deadline(p_user, p_session)` filters by both supplied UUIDs, and `create_session` calls it before binding the private identity GUC. `session_status` also checks the deadline before `has_membership` binds that GUC. A GUC-dependent Auth policy would hide valid sessions at these call sites and couple Auth visibility to caller-controlled placeholder state. Rails/Auth identity attestation, cookie/current-session matching and membership checks remain the existing facade's responsibility; this patch does not establish new identity proof or change helper order.

Bootstrap uses a fresh administrator connection, an explicit READ COMMITTED transaction, a separate ACCESS EXCLUSIVE table-lock statement, 5-second lock timeout, 15-second statement timeout and controlled search path. Decisive relation/type/policy/role/ACL checks occur after the lock, and role/policy/ACL checks repeat after the narrow mutation. Existing matching policy OIDs remain stable. Conflicting same-name policy tuples fail closed, including omitted USING, wrong command/mode/roles/expression or a check expression; there is no automatic DROP/ALTER repair. Other effective SELECT/ALL policies for the private role or PUBLIC fail, as does every extra policy explicitly targeting the private role. Unrelated policies, ownership and existing RLS/FORCE flags are preserved.

Policy applicability uses USAGE for inherited privileges, with a CASE for PUBLIC's zero OID. These checks follow [PostgreSQL privilege functions](https://www.postgresql.org/docs/17/functions-info.html), [policy catalog fields](https://www.postgresql.org/docs/17/catalog-pg-policy.html), and [CREATE POLICY behavior](https://www.postgresql.org/docs/17/sql-createpolicy.html). No production Auth row scan, RLS toggle, BYPASSRLS change, ownership transfer, blanket Auth grant or default-ACL mutation was introduced.

## Regression coverage supplied, all NOT_RUN

| Candidate coverage | Files / assertions |
| --- | --- |
| RLS on before initial and repeated grant bootstrap | The single `run.sh` hook loads `auth-rls-setup.sql` only in its disposable database. Three rows represent two users and two sessions for one user. |
| Actual four-column readability under RLS | `auth-rls-visibility.sql` uses real private SESSION AUTHORIZATION, asserts `row_security_active`, reads all four values from all three expected rows, and rejects empty/partial results under empty, foreign and malformed caller identity. Fifth-column, SELECT-star and UPDATE attempts must fail. FORCE and NO FORCE cases preserve the fixture setting. |
| Runtime isolation | `auth-rls-runtime-denial.sql` checks every column ACL and each direct read for both API and worker under three caller GUC values; SET ROLE private must fail. OID-based metadata checks avoid requiring the deliberately absent Auth schema USAGE. |
| Drift and rerun | `auth.sh` retains table/DML/column/delegation/sequence drift cases and adds hostile reserved policies, effective PUBLIC/private policies, private-role flags, table ownership, parent roles, direct/indirect runtime role paths, disabled RLS and same policy name on another table. |
| Exact preservation and rollback | A catalog snapshot compares policy OIDs/tuples, relation owners/flags/ACLs, schema, column ACLs and default ACLs across repeated bootstrap. A deliberate error after policy recreation and grants must leave committed catalogs unchanged in a new connection. |
| Existing session semantics under Auth RLS | `auth-rls-sessions.sql` loads the actual private SQL, exercises create/resolve with empty/foreign/malformed caller identity, verifies identity restoration and correct user/session output, rejects wrong-user/missing-session authorization and creation, and rejects existing/new sessions after not_after expiry, the 12-hour cap or Auth-row removal. A restored-row success separates expiry from the removal case. |
| R1 NULL assertion regression | `private-grants.sql` materializes own/foreign/NULL membership probes, requires TRUE/FALSE/FALSE with IS DISTINCT FROM, then runs the same assertion against an intentional NULL-returning replacement in a subtransaction. Only the expected assertion error is caught; unexpected success fails. Full function definition/catalog restoration is checked before the same normal assertion runs again. |

The private-helper mutation is a rollback-only test fixture, not a product change. Existing hostile default-privilege and API/worker facade guards remain in `private-grants.sql`.

The author walkthrough corrected one candidate test issue: the text-table overload of `has_column_privilege` resolves the schema before checking the ACL. [PostgreSQL 17.6 ACL lookup source](https://raw.githubusercontent.com/postgres/postgres/REL_17_6/src/backend/utils/adt/acl.c) and [namespace lookup source](https://raw.githubusercontent.com/postgres/postgres/REL_17_6/src/backend/catalog/namespace.c) confirm why the runtime guard now uses a catalog OID. The isolated harness can also reassert READ COMMITTED after its fixture queries when already at that level; [17.6 transaction-variable source](https://raw.githubusercontent.com/postgres/postgres/REL_17_6/src/backend/commands/variable.c) explicitly allows that idempotent setting. These are source-based conclusions, not test passes.

## Design tradeoffs and remaining evidence

These are analytical scenario comparisons, not executed simulations. No Obsidian connection was available; the requested Obsidian simulation has not been performed.

| Choice | Scenario and consequence |
| --- | --- |
| Private-role SELECT policy with constant predicate, accepted | An empty/forged caller GUC does not affect the four-column Auth lookup; explicit user/session filters and facade authorization still decide the result. This relies on strict private-role isolation and on the existing trusted Rails caller boundary. |
| Identity-GUC Auth predicate, rejected | Create and status lookup precede identity binding; legitimate sessions become invisible or require helper/API changes outside this repair. |
| Time predicate in the policy, rejected | Duplicates deadline logic and risks disagreeing with statement-time reads and post-lock wall-time writers. Existing helper semantics stay authoritative. |
| Narrow catalog mutation under table lock, accepted | Concurrent bootstrap calls serialize policy DDL and inspect a fresh snapshot after waiting. This briefly blocks Auth table access and therefore requires the accepted administrator-exclusive setup window. |
| Treat the table lock as a global privilege freeze, rejected | Role membership, schema privileges and unrelated Auth objects are outside that table lock. Repeat checks improve detection but cannot promise protection against arbitrary concurrent administrators; the exclusive setup window is required. |
| Fail on hostile drift, accepted | A conflicting policy or privilege stops setup and preserves evidence rather than replacing vendor/security state to make bootstrap pass. |

Root still needs independent bounded reviews and actual pinned-image execution of the full guards/application suite. The new scripts do **not** supply a separate two-process concurrency or held-lock timeout harness: root must capture simultaneous fresh-connection bootstrap, bounded lock-timeout failure, failed-transaction rollback and post-wait catalog visibility in its Docker acceptance evidence. Existing finite/nonfinite deadline, refresh, local-expiry and final-lock-wait suites must be rerun; this patch does not replace those cases. Bootstrap fails on timeout and does not retry automatically.

Production bootstrap must run after pinned Auth migrations finish and before API/worker consumers start. An RLS-off pinned table now fails deliberately. Native/client/visual checks and all wider BE02 completion gates remain root-owned and unchanged.

## Exact candidate manifest

Hashes are SHA256 of the current bytes; line counts include blank lines. The eight files total 803 physical lines, not 803 changed lines. The report's own hash is supplied separately to avoid a self-referential digest.

| Path | Lines | SHA256 |
| --- | ---: | --- |
| `ops/db/bootstrap-auth-grants.sql` | 147 | `2f63d116e2b23af69d7abd0452893509231e39658d298a9ad207e75a8a96fcd6` |
| `ops/tests/be02-guards/auth.sh` | 163 | `69f66bc0264109f65f31126e97115985e92028eebb8252ef51be1543e454e1ff` |
| `ops/tests/be02-guards/private-grants.sql` | 197 | `d911e107c5aa12be9be315e63d5bd6c4483a78475c2552dafc6c57e2d54a035f` |
| `ops/tests/be02-guards/run.sh` | 95 | `83b948bde7b357466d8b668c86bd1d64e5ee4f6001433c5fd5d0ad551189567d` |
| `ops/tests/be02-guards/auth-rls-setup.sql` | 9 | `d129fd361f2198b714efcbb87ef332c95df3101898c55cf086479d25fa9c91ba` |
| `ops/tests/be02-guards/auth-rls-visibility.sql` | 48 | `13fecf3856e30f63b7467bb903eac9291e6a648249270d18643fcebc6471af11` |
| `ops/tests/be02-guards/auth-rls-runtime-denial.sql` | 30 | `6fa43fefc27e3798e6dfacf4fa768034e81fd5b94a83b0cd73c0eda284246322` |
| `ops/tests/be02-guards/auth-rls-sessions.sql` | 114 | `98074b3c694cc5231e9694d76d08abd035bf6abbe075a5aaa4e498b3ea35b2e2` |

Observed protected-file hashes: `ops/db/bootstrap.sql` = `5a665cf865cf84246f38ec8819f6e64e6a49e14105768a46ba8b3ba1df15a225`; `ops/tests/be02-guards/fixture.sql` = `48f1b6cbf9d6c31989d0204d92fd7e1cb7bfcfa253317b02df111d5dbe5181d9`. This worker did not modify them; concurrent review ownership is unchanged.

## Compact review manifest for root

Each assignment stays at or below 200 code lines including the listed context. Root should pass the full mandated adversarial review rubric and standards; formatting belongs to linters. This is a proposed coverage allocation, not evidence that reviewers ran.

| Assignment | Bounded code input | Focus |
| --- | --- | --- |
| RLS production | `bootstrap-auth-grants.sql:1-147` (147) | Catalog null safety, policy command/mode/roles/expression, RLS/ownership/role graph, four-column ACL boundary, post-wait snapshot, transactional/idempotent behavior. |
| Auth case matrix | `auth.sh:1-163` (163) | Legal hostile fixtures, failure-message specificity, rerun/preservation/rollback evidence, missing cases and shell orchestration. |
| R1 and facade guard | `private-grants.sql:1-197` (197) | Same assertion's NULL mutation kill, restoration, exact facade grants and hostile defaults, real session identity and exception handling. |
| Harness and visibility | `run.sh:1-95`, `auth-rls-setup.sql:1-9`, `auth-rls-visibility.sql:1-48`, `auth-rls-runtime-denial.sql:1-30` (182) | Single hook scope, nonempty row proof, actual non-bypass identity, runtime metadata/direct denials, cleanup ownership. |
| Session regression | `auth-rls-sessions.sql:1-114`, existing `apps/server/db/be02/helpers.sql:20-55`, `apps/server/db/be02/entry.sql:1-40` (190) | Real function signatures/order, correct fixtures, identity restoration, mismatch/expiry/removal semantics. |
| Dedicated deep design | `bootstrap-auth-grants.sql:1-92`, existing `helpers.sql:20-55`, `entry.sql:1-40`, `read.sql:1-26` under `apps/server/db/be02` (194) | Private-role constant predicate versus GUC predicate, trust boundaries, identity ordering, isolation/locking limits and simplest compatible design. |

Defect accounting: two preexisting defects addressed (pinned RLS rejection and R1 NULL-blind membership assertion); their baseline defect density is not measured. The author walkthrough found one candidate test defect and corrected it before this freeze: 1 / 803 physical candidate lines = 1.25 defects per KLOC, a file-size denominator rather than changed-line or independent-review density. Independent review defect count/density remain **NOT_MEASURED**, not zero; root must record actual coverage/findings in `code-reviews.md` and replace these provisional review statuses with evidence.
