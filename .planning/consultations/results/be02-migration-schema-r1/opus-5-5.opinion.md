# Verified independent opinion: claude-opus-5-5

Task: BE02-MIGRATION-SCHEMA-R1. Requested and returned model: `claude-opus-5-5`. Session: `16786f05-eefc-47eb-bcd6-6af647c55418`. Exit: 0; structured result: success, non-error.

Common packet SHA256: `429728aa2478ff3d85581dfba7523bd83283c5c32ceb5f5798b1e211007ad910`. Input SHA256: `3c7768eff01af1aaac593342716f23b5f2bfc3a25abc04f5540e0098161fd651`. Source scope: 400 unique LOC, in slices of 148/84/168. Tools disabled; independent fresh process.

The model's advice below is preserved verbatim. Its inferences and proposals are not runtime evidence; the Astra disposition in the linked design report resolves contradictions and rejected recommendations.

---

# BE02-MIGRATION-SCHEMA-R1: independent opinion (Opus 5.5)

**Verdict: support the candidate, with adaptations.** Create `app_drafts_private` in the privileged bootstrap. Assert exact ownership and ACL in two places: in bootstrap, and at migration entry before any draft DDL. Stop dropping the schema in `down`. This is a prerequisite fix for the R3 failure, not an optional improvement.

This opinion covers only the 400 supplied lines (S1, S2 and S3), reviewed slice by slice. No SQL was executed. Everything below is analytical design and proposed tests, all **NOT RUN**.

## Root cause

- `elevateo_migrator` runs as `elevateo_owner`: it has `SET role` (S1:98–99), and `pg_has_role(..., USAGE)` is false (S1:137).
- `CREATE SCHEMA` needs database `CREATE`, which nobody in the application role set holds. S1:146 grants only `CONNECT`.
- The earlier migrations most likely succeeded because they only created objects inside `app`, `app_meta` or `app_auth`, which bootstrap already owns. This is an inference: those migrations were not supplied.
- `tables.sql:2` is therefore the first database-level DDL in the Rails lane. The failure is a boundary violation, not a bug in the migration itself.

## Recommendations

### 1. Create the schema in bootstrap (S1, before `COMMIT` at line 147, after line 144)

```sql
CREATE SCHEMA IF NOT EXISTS app_drafts_private AUTHORIZATION elevateo_owner;
REVOKE ALL ON SCHEMA app_drafts_private FROM PUBLIC;
-- then the guard from recommendation 2
```

- `IF NOT EXISTS` is acceptable here only because the guard follows immediately in the same transaction. On its own it would hide drift.
- Do **not** add `ALTER SCHEMA ... OWNER TO`. Silently transferring an unexpected owner is forbidden. A wrong owner must fail.
- Rationale: this follows the established `app_auth` pattern (S1:80–87), so it is not a new mechanism. Bootstrap already runs as verified `supabase_admin` (S1:10–13).

### 2. Guard predicate (same text in both places)

The schema is valid only if all of these hold:

- **(a) Existence:** exactly one `pg_namespace` row with `nspname = 'app_drafts_private'`.
- **(b) Owner:** `nspowner = 'elevateo_owner'::regrole`.
- **(c) ACL:** every entry of `aclexplode(coalesce(nspacl, acldefault('n', nspowner)))` has `grantee = nspowner` and `grantor = nspowner`.
  - This rejects PUBLIC (`grantee = 0`), direct grants to the API, worker, `app_read` or migrator, dangling or unknown role OIDs, and foreign grantors.
- **(d) Owner privileges present:** both `has_schema_privilege('elevateo_owner', 'app_drafts_private', 'CREATE')` and `'USAGE'` are true.
  - This fails the "owner privileges revoked" state, where an explicit ACL is present but missing `C` or `U`.
  - Do not assert `is_grantable` on the owner's own entry. The owner's grant option is implicit, and how it is represented varies.
- **(e) No default ACLs on the schema:** no `pg_default_acl` rows with `defaclnamespace` equal to this schema.
  - Without this, tables created by the migration could silently pick up grants to API or worker roles.
  - Global defaults for `elevateo_owner` (`defaclnamespace = 0`) are outside this predicate. Flag them for follow-up because bootstrap does not currently check them. The post-DDL REVOKE in `grants.sql:1` covers named roles, but not arbitrary other grantees.

How the three ACL states are handled:

| ACL state | Effective privileges | Result |
| --- | --- | --- |
| `NULL` | Built-in default: owner `UC`, nothing for PUBLIC on schemas | Accepted |
| Explicit `{elevateo_owner=UC/elevateo_owner}` | Same as `NULL`; this is what the `REVOKE ... FROM PUBLIC` in recommendation 1 materializes | Accepted |
| Owner entry missing or partial | Owner cannot create tables | Rejected |

Inherited reachability (direct ACLs are not the whole story):

- A role reaches schema privileges through membership in `elevateo_owner`. That graph is already enforced by S1:24–52 and S1:126–140; this design relies on it rather than duplicating it.
- Add one effective check in bootstrap only: `has_schema_privilege(r, 'app_drafts_private', 'USAGE')` is false for `elevateo_api`, `elevateo_worker` and `elevateo_app_read`.
  - Migrator `USAGE` is correctly false, since it has `SET` but not `INHERIT` (S1:137).

### 3. Migration-entry guard (`tables.sql`, replacing line 2)

- Replace line 2 with a `DO` block that runs the same predicate (a)–(e), plus one migration-only check: the schema contains **no objects**.
  - Check `pg_class.relnamespace`, `pg_proc.pronamespace` and `pg_type.typnamespace` (excluding array/implicit types created with tables, which there are none of before line 5).
  - An empty schema on `up` means no stale ledger from a partial or manual run.
- Keep the line-3 `REVOKE` as defense in depth. As schema owner, the migration can issue it.
- Failure timing: the exception fires before `CREATE TABLE app.drafts`.
  - Rails wraps PostgreSQL migrations in a DDL transaction (assumed default; confirm that `disable_ddl_transaction!` is absent in follow-up).
  - Then all six `execute` calls roll back together and no `schema_migrations` row is written. Rerunning after repair is clean.

### 4. `down.sql`: retain the schema

- Delete line 7 (`DROP SCHEMA`).
- After the drops, add a guard asserting the schema still exists, is owned by `elevateo_owner`, and is empty. This guarantees `up` can run again.
- Do not re-assert the full ACL predicate on `down`: `up` owns that precondition, and failing a rollback on ACL drift would strand the migration. Owner plus empty is enough, and it is cheap.
- Never use `CASCADE`. `RESTRICT` is the PostgreSQL default and should stay that way.
- Destructive boundary: `down` irreversibly deletes `app.drafts` and the operations ledger, including retained operation IDs whose loss permits re-execution (the AIDEV note at `tables.sql:26`). Keep the S2:3 AIDEV note and state in the migration comment that down is local/disposable only.
- Bookkeeping: `down` removes the `schema_migrations` row. The bootstrap-owned schema persists, which is correct because bootstrap, not Rails, created it.

### 5. Guard duplication: justified, without a helper

- The two copies run under different authorities and tools: `psql` with superuser before Rails exists, and the Rails owner role inside the migration transaction.
- A shared SQL function would itself need an owner and a location (for example `app_meta`). That is new executable attack surface and a mini-framework, which the brief prohibits.
- A Ruby helper cannot serve `psql`.
- The predicate is about 12 lines. Keep both copies byte-identical, each with an AIDEV-NOTE naming the other file, and add a test that fails if the two diverge (recommendation 7, test P5).

### 6. Separate boundaries explicitly

| Lane | Authority | Responsibility |
| --- | --- | --- |
| Administrative bootstrap (disposable local, this fix) | `supabase_admin` | Creates and validates the schema |
| Production provisioning | Separate, not authorized here | Must provide the same schema and pass the identical predicate; record as an activation prerequisite in docs, not executed |
| App migration | `elevateo_owner` | Never creates schemas; only asserts and populates them |

### 7. Real-PostgreSQL regressions (proposed, NOT RUN)

Each case uses a disposable database, runs bootstrap, then runs the migration as the migrator.

**Positive cases**

- **P1.** Empty volume → bootstrap → migrate `up` succeeds. Afterwards, `nspowner` is `elevateo_owner`, the ACL contains only the owner, and the API and worker lack `USAGE`.
- **P2.** Rerun bootstrap on a migrated, non-empty, valid schema: it succeeds and nothing changes, comparing the ACL text and object count before and after.
- **P3.** `up` → `down` → `up` succeeds. After `down`, the schema exists, is empty and is owned by `elevateo_owner`.
- **P4.** `NULL` ACL (schema created as owner with no `REVOKE`) and the explicit owner-only ACL both pass both guards.
- **P5.** Static check: the guard predicate text in `bootstrap.sql` and `tables.sql` matches.

**Negative cases** (each asserts the specific exception message and that no `app.drafts` or `schema_migrations` row exists)

- **N1.** Schema pre-created owned by `supabase_admin` or `elevateo_migrator`: bootstrap fails, and migration `up` fails, whether bootstrap was skipped or tampered with afterwards.
- **N2.** `GRANT USAGE ON SCHEMA app_drafts_private TO PUBLIC`: both guards fail.
- **N3.** Direct `GRANT USAGE` to `elevateo_api`, and separately `CREATE` to `elevateo_worker`: both fail.
- **N4.** Grant to a throwaway role, then `DROP ROLE` with `REASSIGN` or `DROP OWNED` that leaves an unknown grantee (if PG permits the state), or a grant to an unlisted role: fails.
- **N5.** `REVOKE CREATE ON SCHEMA app_drafts_private FROM elevateo_owner`: fails because owner privilege is missing.
- **N6.** `ALTER DEFAULT PRIVILEGES FOR ROLE elevateo_owner IN SCHEMA app_drafts_private GRANT SELECT ON TABLES TO elevateo_api`: fails.
- **N7.** Schema absent and migration run directly: fails with a clear "bootstrap prerequisite" message, not `InsufficientPrivilege`.
- **N8.** Leftover table in the schema before `up`: the migration's empty-schema check fails.
- **N9.** Inherited drift: `GRANT elevateo_owner TO elevateo_worker` makes the existing S1 membership guard fail. This confirms the dependency rather than duplicating the check.
- **N10.** Confirm migrator has no database `CREATE`: `has_database_privilege('elevateo_migrator', current_database(), 'CREATE')` is false for all six application roles.

**Ordering and fixtures**

- `ops/tests/be02-guards/fixture.sql` creates `auth` and `app` objects. Whether it runs after bootstrap is unknown, so inspect it.
- If any fixture or harness creates the database without bootstrap, it will now fail at N7. That is intended; fix the ordering.
- The S3 helper's teardown `DELETE FROM app_drafts_private.operations` is unaffected.
- Uninspected: `draft_database_test.rb` beyond line 47, any existing migration up/down tests, and the be02 guard-suite expectations of schema counts.

## Strongest objection and smaller alternative

**Alternative:** put `operations` in the existing `app` schema with no grants and forced RLS. That needs zero bootstrap change.

- Tradeoff: it loses schema-level `USAGE` denial (`app` grants `USAGE` to `app_read`, as `fixture.sql:42` mirrors).
- It also renames the table across the uninspected `policies`, `scope`, `save` and `operations` SQL and the test helper. The diff is larger and the isolation weaker. **Rejected.**

**Objection:** guards in two places can still diverge in production provisioning. P5 and the documented activation prerequisite mitigate this.

## Additional finding (follow-up, not this repair)

- S1:142–143 create `app` and `app_meta` with `IF NOT EXISTS` and no owner assertion. That is the exact drift-hiding pattern this task prohibits.
- Severity: **MED**, as a separate issue. Extending predicate (a)–(c) to them is cheap, but it widens scope and could fail existing environments, so it needs its own decision.

## Repair brief for the Astra LOW writer

**Files:**

- `ops/db/bootstrap.sql`
- `apps/server/db/be02_drafts/tables.sql` (lines 2–3)
- `apps/server/db/be02_drafts/down.sql` (line 7 and a new guard)
- Migration comment only in `20261013000004_create_app_drafts_operations.rb`
- New regression file(s) beside the existing be02 guard tests

Do not touch `policies`, `scope`, `save`, `operations` or `grants` unless inspection shows they reference schema creation.

**Invariants:**

- No database `CREATE` for any application role.
- No ownership transfer.
- Owner-only schema ACL.
- No schema default ACLs.
- `down` retains the schema.

**Root acceptance:**

- A fresh disposable R4 passes `db:migrate` through 00004 and later.
- P1–P5 and N1–N10 pass in Docker on real PostgreSQL.
- Exact task-owned cleanup is reconciled.
- README, state and docs record a runtime result only if it actually ran.

## Evidence limits

- Uninspected: other migrations, policies and function SQL, the Rails DDL-transaction setting, the database config, the harness, the write-boundary helper chain, and the global default ACLs for `elevateo_owner`.
- PG17 behavior of `aclexplode` for owner grant options, and default-privilege application on `CREATE SCHEMA AUTHORIZATION`, are asserted only through post-state checks, not verified.
- No UI, native or motion surface is affected.
