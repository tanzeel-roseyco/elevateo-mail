# Verified independent opinion: claude-fable-5-1

Task: BE02-MIGRATION-SCHEMA-R1. Requested and returned model: `claude-fable-5-1`. Session: `b67105a8-1dea-4825-86fa-566699c2500d`. Exit: 0; structured result: success, non-error.

Common packet SHA256: `429728aa2478ff3d85581dfba7523bd83283c5c32ceb5f5798b1e211007ad910`. Input SHA256: `bdababdb0c082e55176458df2b4df7ef27869518f9d6f9a5f33e67ba5c140263`. Source scope: 400 unique LOC, in slices of 148/84/168. Tools disabled; independent fresh process.

The model's advice below is preserved verbatim. Its inferences and proposals are not runtime evidence; the Astra disposition in the linked design report resolves contradictions and rejected recommendations.

---

I'll give the single Fable 5.1 opinion on BE02-MIGRATION-SCHEMA-R1, analytical only, no runtime claims.

**Verdict: support the candidate with adaptations.** Move only `app_drafts_private` creation into bootstrap next to the existing `app`/`app_meta` lines, replace the migration's `CREATE SCHEMA` with a strict entry assertion, and stop dropping the schema on down. This matches the existing precedent at `ops/db/bootstrap.sql:80-86`, where bootstrap creates `app_auth` with an exact-owner assertion and migration 00001 populates it. The failure is fully explained by the supplied slices: bootstrap grants only CONNECT at line 146, the migrator runs as `elevateo_owner` through line 99, and `CREATE SCHEMA` needs database CREATE. No grant to the owner/migrator/API/worker is needed or acceptable.

## Recommendations

1. **Bootstrap creates and asserts the schema.** After line 143 add `CREATE SCHEMA IF NOT EXISTS app_drafts_private AUTHORIZATION elevateo_owner;`, add it to the line 144 `REVOKE ... FROM PUBLIC`, then add one DO block asserting the full state in the next table. Rationale: `IF NOT EXISTS` alone hides a wrong owner, as the cited docs confirm, so the assertion is what makes the line safe. Do not auto-repair a foreign grant in bootstrap. Raise and stop, consistent with every other bootstrap guard.

2. **Migration entry assertion replaces `tables.sql:2`.** Keep line 3's revoke as an idempotent no-op that documents intent. The assertion runs before any CREATE TABLE, inside the migration's DDL transaction, so a missing or drifted schema fails with a deliberate message, leaves no partial objects, and leaves `schema_migrations` without 20261013000004.

3. **One predicate text, used in both places.** The proposed predicate, written so NULL ACL and the explicit owner-only ACL are equivalent:

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_drafts_private')
  THEN RAISE EXCEPTION 'app_drafts_private missing; run bootstrap first'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    WHERE n.nspname = 'app_drafts_private'
      AND (n.nspowner <> 'elevateo_owner'::regrole
        OR a.grantee <> n.nspowner OR a.grantor <> n.nspowner OR a.is_grantable))
    OR NOT has_schema_privilege('elevateo_owner', 'app_drafts_private', 'CREATE, USAGE')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_app_read','elevateo_api','elevateo_worker']) r
      WHERE has_schema_privilege(r, 'app_drafts_private', 'CREATE') OR has_schema_privilege(r, 'app_drafts_private', 'USAGE'))
    OR EXISTS (SELECT 1 FROM pg_default_acl WHERE defaclnamespace = 'app_drafts_private'::regnamespace)
  THEN RAISE EXCEPTION 'app_drafts_private owner/ACL drift; no changes accepted'; END IF;
END $$;
```

Superuser grants are recorded as granted by the owner, so the grantor check is sound. `has_schema_privilege` follows INHERIT membership, which covers `elevateo_api` inheriting from `elevateo_app_read` at `fixture.sql:44` and bootstrap line 39. The existing reachability guard at lines 126-140 already closes SET ROLE paths; this check does not repeat it.

4. **Down retains the schema and checks emptiness.** Delete `down.sql:7`. After the two DROP TABLE lines, add a DO block raising if any `pg_class` or `pg_proc` row remains in `app_drafts_private`. The old `DROP SCHEMA` defaulted to RESTRICT and so detected stray objects for free; removing it loses that detection unless replaced. Because the migration is transactional, that raise rolls the drops back.

5. **Assert the acting user in `tables.sql`.** Add `current_user = 'elevateo_owner'` to the same DO block. A migration run under admin credentials would create tables owned by a superuser and the drafts ledger would silently escape the owner model. This is one line, not a framework.

6. **Do not add `app`/`app_meta` owner assertions in this task,** but record them as a follow-up: lines 142-143 use `IF NOT EXISTS` without the line 81-86 guard. Same defect class, separate bounded issue.

7. **Root should grep the other be02 SQL directories for `CREATE SCHEMA` before implementation.** The git status lists collaboration, memberships, threads and writes directories I did not inspect. If any creates a schema, the same failure recurs at 00005 or later. Fix each as a listed line in bootstrap, not with a loop or generic helper.

## State and ACL schedule

| Schema state | Bootstrap outcome | Migration up outcome |
| --- | --- | --- |
| Absent | Created, asserted, PUBLIC revoked | Raise "missing" before any DDL |
| Valid, empty or nonempty | IF NOT EXISTS no-op; assertion passes; tables untouched | Passes; CREATE TABLE proceeds |
| Wrong owner | Raise; whole bootstrap transaction rolls back | Raise before DDL |
| Direct grant to app_read/api/worker | Raise | Raise |
| PUBLIC grant | Raise. Grantee 0 differs from owner | Raise |
| Unknown-role grant | Raise | Raise |
| Owner self-revoked USAGE or CREATE | Raise on has_schema_privilege | Raise; without it CREATE TABLE would fail mid-script |
| NULL ACL vs explicit `{elevateo_owner=UC/elevateo_owner}` | Both accepted via acldefault | Both accepted |
| Schema-scoped default ACL present | Raise | Raise |

Timing: the bootstrap assertion fails after role setup inside one BEGIN/COMMIT, so a drifted database blocks bootstrap entirely. That is fail-closed and acceptable for a disposable runtime. The migration assertion fails before DDL, so bookkeeping and data are unchanged.

## Rollback, bookkeeping, boundaries

Down remains data-destructive: it drops `app.drafts` and the seven-day operations ledger that `tables.sql:26` says prevents re-execution. The AIDEV-NOTE at `20261013000004...rb:3` already labels rollback explicit and destructive. Keep that. Down should not assert schema owner as a prerequisite; DROP TABLE requires table or schema ownership anyway and the acting-user check belongs to up. After down the schema persists empty under bootstrap ownership, so up re-passes the assertion. Administrative bootstrap on the disposable runtime is not production provisioning: any production environment needs the same schema line in its separately reviewed DDL. Record that in docs, not in code.

## Alternatives considered

- **GRANT CREATE ON DATABASE to elevateo_owner.** Rejected. It lets any migration create arbitrary schemas and is excluded by the task.
- **Place the ledger in `app_meta.draft_operations`.** Smallest diff and no bootstrap change. Privacy would rest on `grants.sql:1` plus FORCE RLS, which is sufficient for the table itself. Rejected because `app_meta`'s purpose and ACL were not supplied, the AIDEV-NOTE at `tables.sql:1` ties the ledger to a dedicated private namespace, and any later private object would need the same decision again. Viable only if root inspects `app_meta` grants and accepts the mixed namespace.
- **SECURITY DEFINER schema-creation function owned by admin.** Rejected. New privileged code path with its own ACL to defend.
- **`CREATE SCHEMA IF NOT EXISTS` kept in the migration.** Rejected. Still needs database CREATE when absent and hides drift when present.

## Guard duplication

Duplicating the predicate at bootstrap and migration entry is justified. They run as different users, through different tools, with a time gap in which drift can occur, and the migration actor cannot repair anything. A SQL helper function would be a new object with its own owner and ACL to guard, and a Ruby helper cannot serve psql. Keep the text identical, add an AIDEV-NOTE in each file naming the other location, and let a test diff the two blocks so they cannot diverge silently.

## Regressions, proposed and not run

Positive, real PostgreSQL:

1. Fresh bootstrap: `app_drafts_private` exists, owner is `elevateo_owner`, `nspacl` explodes to exactly one grantee equal to owner with USAGE and CREATE, `pg_default_acl` has no row for the schema.
2. Bootstrap rerun on a nonempty schema: create `app_drafts_private.probe` as `elevateo_owner` first; rerun ends `bootstrap: ok`; probe survives.
3. `db:migrate` applies 00004; then `SET ROLE elevateo_api` fails on `SELECT 1 FROM app_drafts_private.operations` with schema permission denied; same for worker and app_read.
4. Down then up: after down the schema remains with the same owner and zero relations; `schema_migrations` lacks the version; up re-applies and records it.

Negative, each inside a transaction that is rolled back, executed as the migration actor against the `tables.sql` guard:

5. Drop the schema beforehand: guard raises "missing", no `app.drafts` exists afterwards.
6. `ALTER SCHEMA app_drafts_private OWNER TO supabase_admin`: raises drift.
7. `GRANT USAGE ON SCHEMA app_drafts_private TO elevateo_app_read`: raises, and additionally assert `has_schema_privilege('elevateo_api', ..., 'USAGE')` is true before the guard, proving inherited reachability is a real leak path.
8. `GRANT USAGE ... TO PUBLIC`: raises.
9. `CREATE ROLE drift_probe; GRANT CREATE ON SCHEMA ... TO drift_probe`: raises; CREATE ROLE is transactional and rolls back.
10. `REVOKE USAGE ON SCHEMA app_drafts_private FROM elevateo_owner`: raises on missing owner privilege.
11. `ALTER DEFAULT PRIVILEGES FOR ROLE elevateo_owner IN SCHEMA app_drafts_private GRANT SELECT ON TABLES TO elevateo_app_read`: raises.
12. Down with a stray object: create `app_drafts_private.stray` as owner, run down, expect raise, then assert both tables still exist.
13. Bootstrap rerun negatives: apply case 6 drift, rerun bootstrap, expect the exception and unchanged catalog. Bootstrap wraps its own BEGIN/COMMIT, so this cannot nest in a transaction; run these last on the disposable runtime, restore ownership, and prove a final clean rerun before cleanup.

## Repair brief for the Astra LOW writer

- **Files:** `ops/db/bootstrap.sql` lines 142-144 plus one DO block; `apps/server/db/be02_drafts/tables.sql` lines 1-3; `apps/server/db/be02_drafts/down.sql` line 7 plus one DO block; one new test file under `ops/tests/be02-guards/` or `apps/server/test/be_02/` matching the existing harness; README, state.md and documentation.md sync per AGENTS.md; code-reviews.md coverage entry.
- **Invariants:** no role gains database CREATE; no ownership transfer; no new roles, helpers or loops; both guard texts byte-identical; migration remains transactional with no `disable_ddl_transaction!`.
- **Ordering:** bootstrap, then `be02-guards/fixture.sql`, then migrations, then draft tests. The fixture at S3 does not create this schema, so any lane that applies `tables.sql` without bootstrap will now fail by design; root must confirm no such lane exists.
- **Existing tests:** `draft_database_test_helper.rb:20` teardown deletes from the ledger as admin and is unaffected. `membership-catalog.sql` is modified in the tree and uninspected; if it enumerates schemas it needs the new row.
- **Cleanup:** negative cases roll back; case 13 must restore ownership and be followed by a clean bootstrap rerun; no retained volumes are touched.
- **Root acceptance:** fresh disposable run passes bootstrap, 00004 and the thirteen cases above, with independent cleanup reconciliation as before. If 00005 or later fails for a different reason, report it separately rather than folding it into this repair.

## Evidence limits

I reviewed only the four supplied slices, each under 200 LOC, and did not inspect policies, scope, save, operations SQL, the write-boundary helper chain, migrations before or after 00004, database configuration, the test runner, other fixtures or the membership catalog. The claim that migrations are transactional rests on the default `ActiveRecord::Migration` behavior and on root's report that 00001 through 00003 succeeded through the same multi-statement `execute` path. All SQL above is analytical and unexecuted. Obsidian was unavailable; the schedules are reasoning, not simulation.
