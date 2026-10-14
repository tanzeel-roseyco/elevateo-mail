# PERF-01 database-path inventory and baseline design

Status: inventory and proposal only. No code, migration, fixture or Docker change was made. No measurement exists yet; every number below is a row count derived from source or an explicitly marked hypothesis.

## 1. Identity and scope

- Agent name: `database-path` (PERF-01 team, lead: Fable 5.1 coordinator).
- Model as observed in my system prompt: `claude-fable-5-1` (Claude Fable 5.1).
- Started 2026-10-12 06:45:02 +11:00; finished 2026-10-12 06:59 +11:00 (see end of file).
- Base: branch `perf/fable-5-1/backend-speed`, HEAD `5785eba47f3709debb2815c8d86608f7e62d02f3` (verified with `git rev-parse`).
- Method: host-side read-only inspection (Read/Grep/Glob, `git log`). No Docker, no SSH, no application tests. Only this file was written.

## 2. Files inspected

| File | Lines | Why |
|---|---|---|
| `apps/server/db/migrate/20261012000001_create_app_foundation.rb` | 1-85 | Function, tables, PK/UNIQUE/FK, FORCE RLS, four policies, grants |
| `apps/server/db/migrate/20261012000002_restrict_api_read_membership.rb` | 1-65 | Role-membership migration pattern (migrator login, owner current role) |
| `ops/db/bootstrap.sql` | 1-90 | Roles, NOINHERIT/INHERIT, schema ownership |
| `ops/supabase/db/99-jwt.sql`, `99-roles.sql` | all | Upstream-only; no app objects |
| `ops/tests/db-fixtures.sql` | 1-16 | Tier-1 fixture (2 orgs, 3 users, 3 mailboxes, 1 private membership) |
| `ops/tests/membership-catalog.sql` | 1-29 | Admin-side fingerprinting; reusable for fixture integrity |
| `apps/server/lib/elevateo/tenancy.rb` | 1-62 | `with_context` round trips and cache handling |
| `apps/server/sig/tenancy.rbs` | 1-34 | `_TenantConnection` interface, Rollback-returns-nil note |
| `apps/server/config/database.yml`, `config/application.rb` | all | pool default 5, `schema_search_path app,app_meta`, app_meta bookkeeping |
| `apps/server/lib/elevateo/config.rb`, `app/controllers/health_controller.rb`, `config/routes.rb` | all | Confirms only `/health`, `/ready`; no business query exists |
| `apps/server/test/be_01_r1/*.rb` (8 files) | all | Existing restricted-role harness; principals and expected row sets |
| `ops/compose.r1-test.yaml`, `compose.yaml` lines 24-25 | | Postgres pin `supabase/postgres:17.6.1.136@sha256:f371b5f3...`, `R1_DB_POOL` |
| `apps/server/Gemfile` | 1-15 | `rails 8.1.4`, `pg ~> 1.6`, `puma ~> 7.0` |

AIDEV anchors relevant to this path (all preserved, none proposed for change): `tenancy.rb:4` (claims and cached rows share one owned transaction and connection), `tenancy.rb:13` (frozen UUID strings), `tenancy.rbs:21` (Rollback returns nil), `db-fixtures.sql:1` and `membership-catalog.sql:1,18` (admin fixture identity separate from restricted tests), `baseline_driver.rb:8` (never patch loaded tenancy code), `test_helper.rb:7` (test process never acquires admin authority).

## 3. Schema and index inventory (proved from migration source)

All objects live in schema `app`, owned by `elevateo_owner`; `elevateo_api` reads through membership in `elevateo_app_read` (SELECT only). `elevateo_worker` has no table access.

| Table | Columns | Indexes that exist (implied by PK/UNIQUE) |
|---|---|---|
| `organizations` | `id uuid PK`, `name text` | `(id)` PK |
| `organization_memberships` | `organization_id uuid FK→organizations CASCADE`, `user_id uuid` | `(organization_id, user_id)` PK |
| `mailboxes` | `id uuid PK`, `organization_id uuid FK CASCADE`, `address`, `visibility`, `storage_object_path` | `(id)` PK; `(organization_id, id)` UNIQUE; `(organization_id, address)` UNIQUE |
| `mailbox_memberships` | `organization_id`, `mailbox_id`, `user_id`; FK `(organization_id, mailbox_id)`→mailboxes; FK `(organization_id, user_id)`→organization_memberships, both CASCADE | `(mailbox_id, user_id)` PK |

No explicit `CREATE INDEX` exists anywhere in the repository. PostgreSQL does not create indexes on FK referencing columns, so `mailbox_memberships` has no index led by `organization_id` or `user_id`.

Policy predicates mapped to indexes:

| Policy (table) | Predicate | Served by |
|---|---|---|
| `own_org_membership` (organization_memberships) | `user_id = ctx(user) AND organization_id = ctx(org)` | PK `(organization_id, user_id)` exact |
| `member_organization` (organizations) | `id = ctx(org) AND EXISTS(m: m.organization_id = organizations.id AND m.user_id = ctx(user))` | PK on organizations; PK on memberships |
| `own_mailbox_membership` (mailbox_memberships) | `user_id = ctx(user) AND organization_id = ctx(org)` | **No index** (PK is led by `mailbox_id`); seq scan + filter |
| `visible_mailbox` (mailboxes) | `organization_id = ctx(org) AND EXISTS(m …) AND (visibility='shared' OR EXISTS(mm: mm.mailbox_id = mailboxes.id AND mm.organization_id = … AND mm.user_id = ctx(user)))` | UNIQUE `(organization_id, …)` for outer; memberships PK; `mm` lookup is PK `(mailbox_id, user_id)` exact |

Indexes that do not exist and that a policy could use: only `mailbox_memberships (organization_id, user_id)`. It would serve direct scans of `mailbox_memberships` under `own_mailbox_membership` and the FK cascade from `organization_memberships` deletions. It is not needed by the `visible_mailbox` subquery, which already hits the PK with both columns. Every other policy predicate and EXISTS subquery is fully served by an existing PK/UNIQUE index.

Provable second-order fact: subqueries inside policy expressions are themselves subject to the referenced table's policies (this is why PostgreSQL has policy-recursion detection and why B01-04 demands acyclic policies). So reading `mailboxes` evaluates `visible_mailbox`, plus `own_org_membership` on `m`, plus `own_mailbox_membership` on `mm`. That adds two to four more `app.context_uuid` calls per inner row scanned.

## 4. RLS policy cost analysis: `app.context_uuid`

Proved from source (`20261012000001`, lines 7-13): `LANGUAGE plpgsql STABLE SET search_path = pg_catalog`, argument `text`, returns `uuid`; NULL or `''` returns NULL; anything else is cast with `::uuid` so malformed values raise `22P02`. Default `COST` for a non-C function is 100.

How many evaluations per row (facts about the PostgreSQL executor, plan shape itself is a hypothesis until EXPLAIN):

- STABLE is not constant-folded at plan time; only IMMUTABLE is. The executor never caches STABLE results across rows.
- When the call lands in an index condition (`organization_id = app.context_uuid(...)` on an index scan) it is a runtime key, evaluated once per scan start or rescan.
- When it lands in a `Filter` (seq scan, or a non-indexable qual) it is evaluated once per candidate row.
- Each correlated EXISTS that remains a SubPlan re-executes per outer row; the inner table's own policy quals are evaluated per inner row if that inner scan is a seq scan.
- With one-page tables the planner commonly chooses Seq Scan, so the per-row path is the likely one. Worst-case shape for `SELECT id FROM app.mailboxes` at the tier-2 size (9 mailboxes, ~11 memberships): roughly 9 x (1 + 11 x 3) plus private-row `mm` lookups, i.e. a few hundred plpgsql calls per statement. Best-case shape (semi-join or index keys): a few dozen. This range is a hypothesis; `pg_stat_xact_user_functions` gives the exact count (section 8).
- Qual ordering: PostgreSQL sorts AND quals by estimated cost, so the COST 100 function tends to run after cheap column comparisons, which reduces calls. OR arms are not reordered; `visibility = 'shared'` short-circuits the `mm` EXISTS for shared rows.

Does `SET search_path` force a per-call plan? No. Proved from PostgreSQL design: a function with a `SET` clause (non-null `proconfig`) is dispatched through the `fmgr_security_definer` wrapper, which saves and restores GUC state on every call. That is per-call overhead, not replanning. plpgsql caches its simple-expression plans (`current_setting(...)`, `raw::uuid`) per session, and because the function's `search_path` is identical on every call those cached plans stay valid. Magnitude of the wrapper overhead is a hypothesis (literature reports low microseconds per call); the microbenchmark in section 8 measures it directly.

Semantics-preserving alternatives, assessed adversarially:

1. `LANGUAGE sql` with a SQL-standard body (`BEGIN ATOMIC` / `RETURN`, PostgreSQL 14+), STABLE, no `SET` clause, body `pg_catalog.nullif(pg_catalog.current_setting(setting, true), '')::pg_catalog.uuid`. Semantics: NULL and `''` give NULL, valid text gives the uuid, malformed text raises `22P02` exactly as now (only the error context line differs; `tenancy_test.rb:167` asserts `StatementInvalid`, not message text). Security: a standard body is parsed at `CREATE` time, so object resolution is fixed at definition and caller `search_path` cannot hijack it; schema qualification is belt-and-braces. This is the only form the planner can inline (planner `inline_function` refuses SECURITY DEFINER, set-returning and non-null `proconfig` functions). After inlining the policy quals contain the built-in `current_setting`, removing both the plpgsql call and the GUC save/restore. Still STABLE, so generic prepared plans remain correct across principals. This is the only candidate worth a design gate, and only if section 8 shows the function is a meaningful share of statement time.
2. `IMMUTABLE` in any language: rejected, not semantics-preserving. The planner would fold the first principal's claim into the plan, and Rails prepared statements (default on, generic plan after five executions) would then reuse that folded value for other principals. This is a cross-tenant authorization defect, not an optimization.
3. Keep plpgsql, drop `SET search_path`, schema-qualify: removes the GUC wrapper but keeps the plpgsql call and weakens the documented protection in a runtime-parsed language. Dominated by option 1; rejected.
4. Change nothing: correct and currently the default recommendation pending evidence.

## 5. Tenancy round-trip analysis (`tenancy.rb:26-60`)

Per outer `with_context`, steady state on a warm connection:

| Step | DB round trips | Required by invariant? |
|---|---|---|
| `clear_query_cache` (line 37) | 0 (Ruby) | Defensive; cheap |
| `uncached(dirties: true)` (line 38) | 0 (Ruby) | Yes: tenant rows must never enter the executor query cache (`tenancy.rb:4`, T3 scenario) |
| `connection.transaction` + first statement | 1 (`BEGIN`, materialized lazily by Rails) | Yes: `set_config(..., true)` outside a transaction block lasts only for that statement, so claims need a real transaction |
| `exec_query SELECT set_config($1), set_config($2)` | 1 (prepared statement; first use on a connection adds one `PREPARE` round trip) | Yes: parameterized, transaction-local claims (B01-04) |
| caller work | N | n/a |
| `COMMIT` or `ROLLBACK` | 1 | Yes: ends the transaction so claims vanish before the connection returns to the pool |
| `ensure` marker reset + `clear_query_cache` (line 57) | 0 (Ruby) | Yes for cache: `test_executor_query_cache_does_not_reuse_rows_across_principals` requires a clean, re-enabled cache after commit or exception |

Fixed cost: 3 round trips plus N. All three carry data the invariants require. Reduction ideas and why I reject each for this slice:

- Pipelining `BEGIN` with the `set_config` statement (pg gem pipeline mode): saves one round trip but bypasses Rails' transaction manager, which `active_frame?` relies on through `current_transaction`. New mechanism, touches the security boundary, no measured need. Reject.
- `BEGIN; SET LOCAL app.user_id = ...` as one simple-protocol string: cannot bind parameters; violates "no interpolation". Reject.
- Folding `set_config` into the first business query via a CTE: evaluation order of volatile `set_config` versus policy `current_setting` within one statement is not guaranteed. Unsafe. Reject.
- Dropping the first `clear_query_cache`: given `uncached`, it is probably redundant for this connection, but Rails 8.1 scopes the query cache per pool and thread (hypothesis; not verified in gem source here) and the clear costs microseconds with zero DB traffic. Removing a defensive line on a security boundary for no measurable gain is a bad trade. Reject.
- `dirties: true` is already the Rails default; passing it explicitly documents intent and costs nothing.

Conclusion: nothing in `with_context` can be removed without changing semantics or adding a new mechanism. The useful outcome is to measure its fixed cost so later BE-02 request budgets are honest. One-time per-connection costs (`SET search_path` from `database.yml`, `PREPARE` of the claims statement) are not per-request costs.

## 6. Cardinality reality check

Product scale: 1-2 organizations, ~10 users, 9 addresses. Table sizes: organizations <= 2 rows, organization_memberships <= ~12, mailboxes 9, mailbox_memberships realistically <= ~10 (only private mailboxes have rows). Every table fits in one 8 KB heap page and one index page.

Consequences stated plainly:

- No index addition can have a measurable effect at product scale. Seq scan and index scan on a one-page table are both a single buffer hit; the planner will usually prefer the seq scan anyway.
- The only DB-side costs that can register at this scale are (a) the number and unit cost of `app.context_uuid` calls, (b) planning time for queries carrying three nested security quals (amortized by Rails prepared statements after five executions per connection), and (c) the fixed round trips in section 5. Each of these is likely dominated by network and Rails overhead; whether that holds is exactly what the baseline must show.

Workload tiers needed to show anything:

| Tier | Contents | Purpose | Source |
|---|---|---|---|
| 0 empty | migrations only, no rows | fixed costs, empty-context denial | existing |
| 1 small | `ops/tests/db-fixtures.sql` unchanged | matches existing harness expectations | existing |
| 2 representative | 2 orgs; 10 users (one in both orgs); 9 mailboxes (org A 5: 3 shared, 2 private; org B 4: 2 shared, 2 private); ~6 private memberships; deterministic UUIDs in the `1000…/2000…/3000…` pattern | product-scale plan shape and call counts | new file, owned by benchmark-runner |
| 3 stress (diagnostic, not representative) | `generate_series` e.g. 50 orgs, 2,000 users, 5,000 mailboxes, 20,000 mailbox memberships | makes plan shape and the missing `(organization_id, user_id)` index visible; must be labelled non-product | new file, owned by benchmark-runner |

## 7. Proposed bounded slice (PROPOSAL; everything below needs the design gate)

P1, evidence only, no code change (recommended default deliverable): run section 8 on tiers 0-2 (tier 3 optional), record plans, buffer counts, planning versus execution time, exact `context_uuid` call counts and self-time, and the microbenchmark ratio. If `context_uuid` self-time is below roughly 20% of statement execution time at tier 2 and below about 0.2 ms absolute, report a truthful no-change conclusion for the database path.

P2, candidate only if P1 crosses that threshold (needs design gate and the three independent opinions): migration `apps/server/db/migrate/20261012000003_inline_context_uuid.rb` running as migrator/owner, `CREATE OR REPLACE FUNCTION app.context_uuid(setting text) RETURNS uuid LANGUAGE sql STABLE RETURN pg_catalog.nullif(pg_catalog.current_setting(setting, true), '')::pg_catalog.uuid;` with `down` restoring the plpgsql body verbatim. `CREATE OR REPLACE` keeps the OID, ACL and the four dependent policies (a `DROP` would be refused by the dependency). Acceptance requires: EXPLAIN VERBOSE showing the inlined `current_setting` in the policy Filter, unchanged results for valid, other-user, denied and empty principals, malformed claim still raising `22P02`, re-run of `tenancy_test.rb`, and candidate-versus-baseline numbers on identical fixtures. No grant, role, policy or table change.

P3, not recommended now: `CREATE INDEX ON app.mailbox_memberships (organization_id, user_id)`. Only tier 3 could show an effect; no production query reads `mailbox_memberships` directly today. Revisit in BE-02 when a real per-user mailbox-membership query exists.

## 8. Test requests for benchmark-runner (exact SQL)

Run inside the task-owned disposable r1 stack, from a psql container on the internal `runtime` network, as `elevateo_api` (`psql -h db -U elevateo_api -d postgres`, password from the task's generated ignored secrets; never in evidence). Use fully qualified names; the psql session's `search_path` is not `app`.

Prerequisite (admin, disposable DB only, benchmark-only, must not enter `bootstrap.sql`): `track_functions` is superuser-settable, so as `supabase_admin` run `ALTER DATABASE postgres SET track_functions = 'all';` then open new sessions. Record `SELECT version(); SHOW track_functions; SHOW plan_cache_mode;`.

Catalog confirmation (proves section 3 against the live database):

```sql
SELECT indexrelid::regclass, indrelid::regclass, indisprimary, indisunique, pg_get_indexdef(indexrelid)
  FROM pg_index WHERE indrelid::regclass::text LIKE 'app.%' ORDER BY 2, 1;
SELECT polrelid::regclass, polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) FROM pg_policy ORDER BY 1, 2;
SELECT proname, prolang::regproc, provolatile, prosecdef, proconfig, procost FROM pg_proc WHERE proname = 'context_uuid';
SELECT relname, relrowsecurity, relforcerowsecurity, relpages, reltuples FROM pg_class
  WHERE relnamespace = 'app'::regnamespace AND relkind = 'r' ORDER BY 1;
```

Principal block (repeat for each principal and each tier; tier-1 UUIDs below, tier-2 analogues chosen by the runner):

| Principal | `app.user_id` | `app.org_id` | Expected on tier 1 |
|---|---|---|---|
| valid A | `20000000-0000-0000-0000-000000000001` | `10000000-0000-0000-0000-000000000001` | mailboxes `…0001`, `…0002` |
| valid A_OTHER | `20000000-0000-0000-0000-000000000002` | `10000000-0000-0000-0000-000000000001` | mailboxes `…0001` |
| denied FOREIGN (wrong org) | `20000000-0000-0000-0000-000000000001` | `10000000-0000-0000-0000-000000000002` | no rows on every table |
| empty context | (no `set_config`) | | no rows on every table |

```sql
\timing on
BEGIN;
SELECT set_config('app.user_id', '20000000-0000-0000-0000-000000000001', true),
       set_config('app.org_id',  '10000000-0000-0000-0000-000000000001', true);   -- omit for empty context
SELECT funcname, calls, self_time FROM pg_stat_xact_user_functions;                   -- read after EVERY statement; use deltas
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT id FROM app.mailboxes ORDER BY id;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT id FROM app.mailboxes WHERE visibility = 'shared' ORDER BY id;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT id, name FROM app.organizations;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT organization_id, user_id FROM app.organization_memberships;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) SELECT organization_id, mailbox_id, user_id FROM app.mailbox_memberships;
SELECT funcname, calls, total_time, self_time FROM pg_stat_xact_user_functions;
COMMIT;
```

Malformed claim (own transaction; expect SQLSTATE `22P02` on the SELECT, then `ROLLBACK`):

```sql
BEGIN;
SELECT set_config('app.user_id', 'malformed', true), set_config('app.org_id', '10000000-0000-0000-0000-000000000001', true);
SELECT id FROM app.mailboxes;
ROLLBACK;
```

Prepared-statement plan behaviour (mirrors Rails; execute at least six times, the sixth normally shows the generic plan):

```sql
PREPARE perf01_mb(text) AS SELECT id FROM app.mailboxes WHERE visibility = $1 ORDER BY id;
BEGIN; SELECT set_config('app.user_id', '20000000-0000-0000-0000-000000000001', true), set_config('app.org_id', '10000000-0000-0000-0000-000000000001', true);
EXPLAIN (ANALYZE, BUFFERS) EXECUTE perf01_mb('shared');   -- x6
COMMIT;
```

Function unit-cost microbenchmark (inside a valid-principal transaction; a microbenchmark, not application speed):

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT app.context_uuid('app.user_id') FROM generate_series(1, 100000);
EXPLAIN (ANALYZE, BUFFERS) SELECT pg_catalog.nullif(pg_catalog.current_setting('app.user_id', true), '')::pg_catalog.uuid FROM generate_series(1, 100000);
```

Round-trip fixed cost (psql `\timing`, 30+ repetitions each, record spread): `SELECT 1;` versus `BEGIN; SELECT set_config(...), set_config(...); SELECT 1; COMMIT;`. Rails-level equivalents (`with_context { select 1 }` versus bare `select 1`, with `sql.active_record` event counts to confirm exactly BEGIN, set_config, work, COMMIT) belong to benchmark-runner scripts, not to this file.

## 9. Risks and invariants that must not change

- `app.context_uuid` stays STABLE. IMMUTABLE is an authorization defect under plan caching, not a tuning knob.
- Any body change keeps: NULL/empty gives no authority, malformed raises, definition-time or schema-qualified object resolution, same signature and OID (`CREATE OR REPLACE` only), same grants (`EXECUTE` to `elevateo_app_read` only).
- FORCE RLS on all four tables, the four policies, acyclic dependency order, read-only API grants and no worker access are unchanged by every proposal here.
- `with_context` keeps BEGIN, parameterized `set_config(..., true)`, owned-transaction frame checks, `uncached`, both cache clears and COMMIT/ROLLBACK. No connection-global or process-global principal state.
- `track_functions` and any benchmark GUC live only in the disposable task database; no role attribute or grant changes for measurement.
- Fixture tiers are synthetic UUIDs only; tier 3 results must be labelled non-representative.

## 10. Open questions for the lead

1. Is P2 worth queuing for the design gate before P1 numbers exist, or hold until benchmark-runner reports the `context_uuid` share?
2. Confirm benchmark-runner owns the tier-2 and tier-3 fixture SQL files; I have specified shape only and will review them read-only.
3. Is `ALTER DATABASE postgres SET track_functions = 'all'` on the disposable DB acceptable under the "no role/privilege change" rule? It is a statistics GUC, not a privilege, but it needs the admin fixture identity.
4. Should the Rails-level round-trip count and timing be assigned to request-path or benchmark-runner? SQL-level timing excludes adapter overhead.
5. Do you want me to verify the Rails 8.1 query-cache scope (pool/thread) from the vendored gem source in Docker? It changes nothing in the recommendation (keep both clears).

Finished 2026-10-12 06:59 +11:00.
