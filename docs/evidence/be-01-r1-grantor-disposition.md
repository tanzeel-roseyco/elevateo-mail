# BE-01-R1 Unit A grantor and baseline-driver disposition

Disposition: the reported pinned-image result resolves R1-03's unknown-grantor prerequisite sufficiently to author the already accepted Unit A repair. It does not accept an implementation or replace its Docker regression gates. This is the actual Astra MAX design owner's bounded disposition, continuing the three-opinion [R1 synthesis](../../.planning/consultations/results/be-01-r1/synthesis.md) and [decisions](../../.planning/consultations/results/be-01-r1/decisions.md), especially R1-02 and R1-03. No application code, migration, test or execution is supplied by this document.

<!-- AIDEV-NOTE: Retire only the measured bootstrap grant; owner migration rollback must not restore legacy authority. -->

## Evidence and limits

The coordinator relayed Devin's successful execution of the unchanged 169-line script from coordinator commit `6154c20`, script SHA-256 `5c2260e4492752726f07c9470aec8e48b5372468cb2d7214bfb98a58c692338f`, during `2026-10-11T17:54:22Z`–`17:54:36Z`, exit 0. Image: `supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`; reported PostgreSQL 17.6; source `eedc43b736791e7e41656d405f10caf3d4164e01` clean; bootstrap reported success. The [probe document](be-01-r1-grantor-probe.md) preserves the script and separate failed first attempt. The successful stdout attachment was still awaiting coordinator retrieval when this disposition was authored. These are attributed remote observations, not an independent run by this agent. Preserve that attachment and its hash before claiming the evidence gate complete in the final repair record.

| Reported observation | Value |
| --- | --- |
| `session_user`, `current_user` | `supabase_admin`, `supabase_admin` |
| Bootstrap role | `supabase_admin`, OID 10; superuser, CREATEROLE and BYPASSRLS true |
| Owner / API roles | `elevateo_owner` OID 16664 / `elevateo_api` OID 16666; those three flags false |
| `elevateo_app_read` to `elevateo_api` | Grantor `supabase_admin` OID 10; ADMIN false, INHERIT true, SET true |
| `elevateo_owner` to `elevateo_migrator` | Grantor `supabase_admin`; ADMIN false, INHERIT false, SET true |

Application-role OIDs are observations, never migration constants. Resolve roles by name in catalog checks. The bootstrap name/OID must match the measured pinned-image prerequisite; an unexpected bootstrap identity stops this compatibility operation rather than guessing a replacement.

Frozen source context read: `ops/db/bootstrap.sql` 31 lines, `apps/server/lib/elevateo/tenancy.rb` 40, `apps/server/config/database.yml` 14 and `20261012000001_create_app_foundation.rb` 85: **170 lines** from `git show eedc43b:...`, not the active writer's changes. This is a design disposition of existing findings, with no new defect count or review-density claim. Obsidian remains unavailable; the scenarios below are analytical, not connected simulations.

## PostgreSQL rule applied

Role ADMIN authority permits membership management without CREATEROLE. Membership options must be explicit because omitted options can retain existing values. A non-bootstrap grantor needs ADMIN on the granted role, and its dependent grants require that ADMIN prerequisite to remain. Set the migration's current role and grantor explicitly. [PostgreSQL 17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html)

Removing an owner's edge cannot remove another grantor's surviving edge. Use explicit grantor plus `RESTRICT`; unexpected dependencies must fail instead of triggering cascading revocation. [PostgreSQL 17 REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html)

`pg_auth_members` exposes grantor and all three options; memberships are **cluster-wide**. Baseline and repair cannot be isolated merely by two databases on the same PostgreSQL instance. Use separate disposable task-owned clusters, or strictly sequential scenarios with verified reset. Never share the existing persistent database volume. [PostgreSQL 17 membership catalog](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html)

## Narrow privileged bootstrap change

Keep role/schema prerequisites in bootstrap; remove its unconditional API membership grant at old line 24. Add one atomic, fail-loud compatibility/prerequisite block. Run bootstrap with the existing privileged bootstrap identity only, never give that identity or its credentials to an API test. Keep the observed owner-to-migrator prerequisite with explicit ADMIN false, INHERIT false, SET true; this preserves the existing ability to become the NOLOGIN owner.

Before changing memberships, verify the expected role identities/attributes and inspect all direct read-role edges to API and owner. Do not normalize unknown grantors or options. The accepted API states are:

| Existing `app_read` to API edges | Bootstrap action |
| --- | --- |
| None | Leave absent: fresh installation or new migration rolled back |
| Only `supabase_admin`, false/true/true | Retire precisely this legacy edge |
| Only `elevateo_owner`, false/true/false | Preserve precisely this migration-owned edge |
| Both of those exact edges | Retire only the bootstrap edge; preserve owner edge |
| Any other grantor or options | Abort before membership changes; report fixed role names/options, no secrets |

The owner ADMIN prerequisite may be absent or exactly the intended bootstrap-granted true/false/false edge; other owner-read edges/options also stop. Detect unexpected dependencies by retaining `RESTRICT`, not by building a general role reconciliation engine. Perform the preconditions, prerequisite grant, conditional retirement and catalog postconditions in the same transaction. The installation/migration sequence has one coordinator; no concurrent role-administration writer is supported.

The fixed SQL operations are:

```sql
-- Bootstrap prerequisite only: owner can administer this one role, not assume it.
GRANT elevateo_app_read TO elevateo_owner
  WITH ADMIN TRUE, INHERIT FALSE, SET FALSE
  GRANTED BY supabase_admin;

-- Execute only when the exact measured legacy edge exists.
REVOKE elevateo_app_read FROM elevateo_api
  GRANTED BY supabase_admin RESTRICT;
```

The compatibility transaction must leave zero bootstrap-granted API/read edges and must not change an existing owner-granted API edge. Repeated bootstrap must neither grant API membership nor revoke the owner's ADMIN prerequisite. No generic revoke, CASCADE, new CREATEROLE, privilege-bearing helper function, role rename or mutation of business rows is needed. A short local interval with no API read access between retirement and the new migration is accepted; halt API work during this serialized upgrade.

## One additive owner-run migration

Do not rewrite `20261012000001_create_app_foundation.rb`. Add one later migration with explicit `up` and `down`, using normal transactional Rails migration execution. Assert `session_user = elevateo_migrator`, `current_user = elevateo_owner`, the existing restricted role flags, and the exact bootstrap-granted owner ADMIN prerequisite. No privileged connection may execute or rescue this migration. A missing prerequisite or remaining legacy/unknown API membership is an error directing the operator to the bootstrap step.

```sql
-- up: the only runtime membership created by this new migration.
GRANT elevateo_app_read TO elevateo_api
  WITH ADMIN FALSE, INHERIT TRUE, SET FALSE
  GRANTED BY elevateo_owner;

-- down: remove only this migration's grant, never recreate the legacy grant.
REVOKE elevateo_app_read FROM elevateo_api
  GRANTED BY elevateo_owner RESTRICT;
```

Check catalog state before and after each direction within its transaction. `up` accepts no API edge or the already exact owner edge, and leaves exactly the owner edge; `down` accepts that exact edge (or absence) and leaves no API/read edge. Unknown topology fails; a successful SQL command alone is not proof that effective access was removed. Do not disable migration transactions. `down` retains the role/schema prerequisites and every business row; it intentionally denies API reads until `up` runs again. Roll back **only the new migration** for this test, not the old table-dropping foundation migration. Explicitly test that worker still has no business access, read-role owns no objects, and API cannot SET ROLE to read, owner, migrator or a privileged role through another path.

| Scenario | Required real PostgreSQL observation |
| --- | --- |
| Fresh bootstrap, foundation migration, new migration | Bootstrap itself gives no API/read membership; new migration gives only owner false/true/false edge; restricted authorized RLS reads work |
| Exact legacy bootstrap/foundation plus fixture rows, then repair | Legacy edge is reported and retired; owner edge appears only on new `up`; same fixture identifiers/counts/content remain |
| New migration `up`, `down`, repeated bootstrap, `up` | Exact owner edge present, absent, still absent, present; API SELECT after `down` is denied; no legacy edge returns |
| Repeat bootstrap after successful `up` | Owner edge and fixture rows unchanged; owner ADMIN prerequisite retained |
| Unknown edge/options or missing prerequisite | Precondition failure, no successful migration version recorded, no partially accepted membership state |
| Deliberate failure after grant in a disposable migration transaction | Grant and migration-version change roll back together; pre-test membership/rows retained |
| Separate connections after each committed transition | Catalog and actual API authorization agree; do not rely on an already-open API transaction |

Use administrator credentials only in the separate bootstrap/fixture/catalog tool. Restricted API assertions use actual API login; the migrator runner proves its own session/current identity. Denial can be a permission error after `down`; zero rows is not the only acceptable failure outcome. Failure injection is test-only, not a production bypass or a change to the applied migration.

## Baseline driver: three independent observations

The legacy run is meant to observe old defects, not satisfy repaired setup assumptions. Give the external regression driver an explicit `baseline` versus `repair` expectation mode; run identical behavioral scenarios on immutable source exports in distinct clusters. This switch changes expected outcomes and the known membership precondition only. It must not patch the loaded tenancy implementation, add authority, bypass RLS or accept arbitrary setup failures.

Common hard guards still apply in both modes: real `elevateo_api` login/current role, no superuser/CREATEROLE/BYPASSRLS, no owner/migrator authority or object ownership, FORCE RLS, and synthetic two-tenant fixtures created by a separate administrator process. The baseline catalog profile admits **only** the measured legacy API/read edge (false/true/true) and records it as M1's known defect; it must not require repaired SET false before T1-T3 run. The repair profile requires the owner-granted false/true/false edge and denies SET ROLE. Missing roles, failed connections, unauthorized fixture setup or unexpected memberships remain setup errors in either mode.

Run T1, T2 and T3 in separate test cases/processes or fully reset pool/executor scopes, so one failure cannot suppress the remaining results. Roll back only each case's transactions, release its checked-out connections, clear its test-owned query cache and verify no tenant claims remain. Use two checked-out connections for T2; retain the same physical connection within T1/T3. Bound waits and fixtures; emit scenario IDs, identity assertions and synthetic row IDs, not credentials or raw environments.

| Case | Concrete stimulus and baseline observation | Repair acceptance |
| --- | --- | --- |
| T1: ambient transaction | Start an ordinary transaction on API connection C and materialize it with an ActiveRecord query before calling `with_context(A)`. Confirm A's authorized read inside the yielded block. After return but before outer rollback, inspect claims and perform an uncached read outside the wrapper. A's surviving claims and rows reproduce the escaped savepoint lifetime. | Reject the outermost wrapper before yielding or setting claims. The ambient transaction retains its prior empty context; an uncached outside read sees no tenant rows. Also prove normal top-level use succeeds. |
| T2: different connection | Check out distinct C1/C2. In a real C2 transaction establish synthetic B claims with a parameter-bound test setup query, without entering the wrapper. In A's wrapper on C1, attempt same-principal nested entry using C2. Record whether it yields, C2's unchanged B context and its B rows. Old code yielding C2 reproduces the unchecked connection boundary. | Reject before nested yield. C1's A context and C2's independent B transaction remain unchanged. Same-principal/same-connection/same-transaction nesting still works. The manual C2 claims are test stimulus, not an approved application entry point. |
| T3: cached tenant rows | Run with the real Rails executor/query cache enabled and one physical API connection. Establish cache operation with a repeated harmless query, then clear once before the scenario. Execute byte-identical ActiveRecord mailbox SELECT/binds under A, under B and after leaving the wrapper. Observe `sql.active_record` cached flags and database context without clearing/invalidation between these transitions. A rows reused under B or outside context with a cache-hit event reproduce T3. | Exact results are A rows, B rows and no-context denial/empty rows. The wrapper disables cache use within its protected block, clears tenant entries at entry/exit, and restores the prior enabled flag. Exercise normal and exception exits and connection return/recheckout; no stale tenant result survives. |

For T1 and T3, confirm a positive authorized read and actual database claim state before asserting a leak. A lazy transaction that never established claims, empty/missing fixtures, inactive cache, a connection change, or zero queries executed is an invalid reproduction setup. Do not manufacture a T3 pass by globally disabling cache. Raw PostgreSQL inspection may corroborate claim state but does not replace the ActiveRecord cache path. If a positive cache control fails, record the error and investigate rather than calling the code secure or vulnerable.

Legacy source defines `Elevateo::Tenancy::ContextError`; it does **not** define `MissingContextError`. Do not reference a new exception constant while evaluating a legacy assertion. Baseline observations are block-yield/context/row/cache facts; repaired rejection assertions use the approved repaired error contract (the existing ContextError family where applicable). NameError, load error, unexpected exception and a guard failure are harness/setup errors, never successful vulnerability proof. Each case reports `REPRODUCED` with its observable evidence, `NOT_REPRODUCED`, `SETUP_ERROR`, or a repaired assertion result. The aggregate runner attempts all three cases and reports all results. Security assertions fail on reproduced baseline defects and pass repaired behavior; any missing expected reproduction, setup error or failed repair assertion also prevents acceptance. A baseline report may say reproduction was expected, but must not call this a passing security test. Nonzero exit alone proves nothing.

## Tradeoff and dispatch limits

Analytically, granting ADMIN only on the read group lets the NOLOGIN owner manage the single necessary runtime membership without CREATEROLE. It remains a privileged migration capability, so runtime logins must never inherit/become owner and owner ADMIN cannot be casually removed while its API grant depends on it. Retiring the verified bootstrap edge once is preferable to guessing that a later owner revoke can remove it. Reversible runtime membership plus retained prerequisites makes rollback deny access without deleting data or resurrecting the defect.

The baseline mode preserves a known historical defect for observation while keeping all unrelated security guards. Separate result categories prevent setup defects from becoming false security evidence. Independent cases add a small bounded fixture/runtime cost and make T1-T3 diagnosable; a general role manager, transaction ancestry framework or expanded foundation implementation is unnecessary.

This resolves the existing R1-03 design condition; no new product behavior or replacement consultation is introduced. The Astra LOW writer may implement the accepted Unit A changes and bounded driver adaptations. Preserve source/diff hashes, then obtain the required <=200-line adversarial review assignments, dedicated design review, and actual Docker regressions before acceptance. Coordinator retains evidence ingestion, budget/execution authorization and shared-document updates. Real Auth/Storage, remaining BE-01 foundation work and Unit B/C acceptance are unaffected and remain separately tracked.
