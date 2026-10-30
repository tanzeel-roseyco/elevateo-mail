-- PERF-01: EXPLAIN runs for the existing RLS-protected reads, executed by perf-sql as elevateo_api inside owned
-- transactions with transaction-local claims (the same set_config(..., true) shape as Elevateo::Tenancy).
-- Read-only evidence over the synthetic fixtures in ops/tests/db-fixtures.sql. No schema or policy is changed.
-- Row counts accompany each plan so visibility (valid / denied / no claims) is checked, not just timing.
\set ON_ERROR_STOP on
\pset footer off
\echo === session identity (must be the restricted API role)
SELECT session_user, current_user, current_setting('search_path') AS search_path, version();
SELECT rolname, rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = current_user;

\echo === app relation statistics (planner inputs)
SELECT c.relname, c.reltuples, c.relpages, s.n_live_tup, s.n_dead_tup, s.last_analyze, s.last_autoanalyze
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
 WHERE n.nspname = 'app' AND c.relkind = 'r' ORDER BY c.relname;

\echo === readiness statement (HealthController#ready database check)
EXPLAIN (ANALYZE, FORMAT TEXT) SELECT 1;

\echo === valid principal: user ...0001 inside org ...0001 (member; private mailbox ...0002 visible)
BEGIN;
SELECT set_config('app.user_id', '20000000-0000-0000-0000-000000000001', true),
       set_config('app.org_id', '10000000-0000-0000-0000-000000000001', true);
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT) SELECT id, name FROM app.organizations;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT) SELECT organization_id, user_id FROM app.organization_memberships;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT) SELECT id, organization_id, address, visibility FROM app.mailboxes;
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT) SELECT organization_id, mailbox_id, user_id FROM app.mailbox_memberships;
SELECT (SELECT count(*) FROM app.organizations) AS organizations,
       (SELECT count(*) FROM app.organization_memberships) AS organization_memberships,
       (SELECT count(*) FROM app.mailboxes) AS mailboxes,
       (SELECT count(*) FROM app.mailbox_memberships) AS mailbox_memberships;
ROLLBACK;

\echo === valid principal without private membership: user ...0002 inside org ...0001 (shared mailbox only)
BEGIN;
SELECT set_config('app.user_id', '20000000-0000-0000-0000-000000000002', true),
       set_config('app.org_id', '10000000-0000-0000-0000-000000000001', true);
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id, organization_id, address, visibility FROM app.mailboxes;
SELECT count(*) AS mailboxes_visible FROM app.mailboxes;
ROLLBACK;

\echo === denied principal: user ...0003 (org B member) claiming org A; expect zero rows everywhere
BEGIN;
SELECT set_config('app.user_id', '20000000-0000-0000-0000-000000000003', true),
       set_config('app.org_id', '10000000-0000-0000-0000-000000000001', true);
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id, name FROM app.organizations;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id, organization_id, address, visibility FROM app.mailboxes;
SELECT (SELECT count(*) FROM app.organizations) AS organizations,
       (SELECT count(*) FROM app.mailboxes) AS mailboxes;
ROLLBACK;

\echo === no claims (NULL context); expect zero rows everywhere
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT id, name FROM app.organizations;
SELECT (SELECT count(*) FROM app.organizations) AS organizations,
       (SELECT count(*) FROM app.mailboxes) AS mailboxes;
ROLLBACK;

\echo === claims do not leak past the transaction
SELECT current_setting('app.user_id', true) AS user_id_after, current_setting('app.org_id', true) AS org_id_after;
