-- Bootstrap owns login/schema prerequisites and retires only the measured legacy membership.
-- Runtime read membership, tables and policies belong to Rails migrations.
\set ON_ERROR_STOP on
\set migrator_pw `echo "$MIGRATOR_DB_PASSWORD"`
\set api_pw `echo "$API_DB_PASSWORD"`
\set worker_pw `echo "$WORKER_DB_PASSWORD"`

BEGIN;
DO $$ BEGIN
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin' AND oid = 10
      AND rolsuper AND rolcreaterole AND rolbypassrls
  ) THEN RAISE EXCEPTION 'unexpected bootstrap identity; stop membership compatibility step'; END IF;
END $$;

SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT', r)
  FROM unnest(ARRAY['elevateo_owner', 'elevateo_app_read', 'elevateo_session_owner', 'elevateo_send_owner']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
SELECT format('CREATE ROLE %I LOGIN NOINHERIT', r)
  FROM unnest(ARRAY['elevateo_migrator', 'elevateo_api', 'elevateo_worker']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

-- AIDEV-NOTE: Validate every touching membership edge; unknown paths/options require a design disposition.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname IN
      ('elevateo_owner', 'elevateo_app_read', 'elevateo_session_owner', 'elevateo_send_owner',
       'elevateo_migrator', 'elevateo_api', 'elevateo_worker')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        OR (rolname <> 'elevateo_api' AND rolinherit)
        OR rolcanlogin <> (rolname IN ('elevateo_migrator', 'elevateo_api', 'elevateo_worker')))
  ) THEN RAISE EXCEPTION 'unexpected application role attributes'; END IF;
  IF EXISTS (
    WITH application_roles AS (
      SELECT oid FROM pg_roles WHERE rolname IN ('elevateo_owner', 'elevateo_app_read',
        'elevateo_session_owner', 'elevateo_send_owner', 'elevateo_migrator', 'elevateo_api', 'elevateo_worker')
    ), permitted(role_name, member_name, grantor_name, admin_opt, inherit_opt, set_opt) AS (
      VALUES
        ('elevateo_app_read', 'elevateo_api', 'supabase_admin', false, true, true),
        ('elevateo_app_read', 'elevateo_api', 'elevateo_owner', false, true, false),
        ('elevateo_app_read', 'elevateo_owner', 'supabase_admin', true, false, false),
        ('elevateo_owner', 'elevateo_migrator', 'supabase_admin', false, false, true),
        ('elevateo_session_owner', 'elevateo_owner', 'supabase_admin', false, false, true),
        ('elevateo_send_owner', 'elevateo_owner', 'supabase_admin', false, false, true)
    )
    SELECT 1 FROM pg_auth_members AS membership
    WHERE (roleid IN (TABLE application_roles) OR member IN (TABLE application_roles)
        OR grantor IN (TABLE application_roles))
      AND NOT EXISTS (SELECT 1 FROM permitted
        WHERE roleid = role_name::regrole AND member = member_name::regrole
          AND grantor = grantor_name::regrole AND admin_option = admin_opt
          AND inherit_option = inherit_opt AND set_option = set_opt)
  ) THEN RAISE EXCEPTION 'unexpected application membership graph; no changes accepted'; END IF;
END $$;

-- AIDEV-NOTE: PG17 function SET clauses need this ACL; ordinary custom-GUC SET is not an identity boundary.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
    WHERE p.parname = 'app_auth.verified_user_id' AND NOT (
      a.grantor = 'supabase_admin'::regrole AND (
        a.grantee = 'supabase_admin'::regrole OR
        (a.grantee = 'elevateo_session_owner'::regrole AND a.privilege_type = 'SET' AND NOT a.is_grantable)))
  ) THEN RAISE EXCEPTION 'unexpected private identity parameter ACL; no changes accepted'; END IF;
END $$;
GRANT SET ON PARAMETER app_auth.verified_user_id TO elevateo_session_owner;
DO $$ BEGIN
  IF NOT has_parameter_privilege('elevateo_session_owner', 'app_auth.verified_user_id', 'SET')
    OR has_parameter_privilege('elevateo_session_owner', 'app_auth.verified_user_id',
      'SET WITH GRANT OPTION, ALTER SYSTEM')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker', 'elevateo_app_read',
      'elevateo_owner', 'elevateo_migrator']) runtime_role
      WHERE has_parameter_privilege(runtime_role, 'app_auth.verified_user_id', 'SET, ALTER SYSTEM'))
  THEN RAISE EXCEPTION 'private identity parameter privilege postcondition failed'; END IF;
END $$;

-- AIDEV-NOTE: Only the migration owner can assume this private function owner; runtime roles cannot inherit it.
ALTER ROLE elevateo_session_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT elevateo_session_owner TO elevateo_owner
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY supabase_admin;
CREATE SCHEMA IF NOT EXISTS app_auth AUTHORIZATION elevateo_session_owner;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_auth'
    AND nspowner = 'elevateo_session_owner'::regrole) THEN
    RAISE EXCEPTION 'unexpected private schema owner';
  END IF;
END $$;
REVOKE ALL ON SCHEMA app_auth FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE elevateo_session_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- AIDEV-NOTE: Auth grants run separately after Auth migrations; initial bootstrap must work on an empty volume.

ALTER ROLE elevateo_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE elevateo_app_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE elevateo_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_pw';
ALTER ROLE elevateo_api LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_pw';
ALTER ROLE elevateo_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_pw';

-- Migrator acts only as the NOLOGIN owner; runtime logins never receive it.
GRANT elevateo_owner TO elevateo_migrator WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY supabase_admin;
ALTER ROLE elevateo_migrator SET role = 'elevateo_owner';

-- AIDEV-NOTE: Retain owner ADMIN so its dependent API grant survives; rollback never restores the legacy edge.
DO $$
DECLARE owner_api_before bigint;
BEGIN
  SELECT count(*) INTO owner_api_before FROM pg_auth_members
    WHERE roleid = 'elevateo_app_read'::regrole AND member = 'elevateo_api'::regrole
      AND grantor = 'elevateo_owner'::regrole;
  GRANT elevateo_app_read TO elevateo_owner
    WITH ADMIN TRUE, INHERIT FALSE, SET FALSE GRANTED BY supabase_admin;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_api'::regrole AND grantor = 'supabase_admin'::regrole) THEN
    REVOKE elevateo_app_read FROM elevateo_api GRANTED BY supabase_admin RESTRICT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_api'::regrole AND grantor = 'supabase_admin'::regrole)
    OR owner_api_before <> (SELECT count(*) FROM pg_auth_members
      WHERE roleid = 'elevateo_app_read'::regrole AND member = 'elevateo_api'::regrole
        AND grantor = 'elevateo_owner'::regrole)
    OR NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_owner'::regrole AND grantor = 'supabase_admin'::regrole
      AND admin_option AND NOT inherit_option AND NOT set_option)
  THEN RAISE EXCEPTION 'membership compatibility postcondition failed'; END IF;
END $$;

-- AIDEV-NOTE: Check effective reachability too; NOINHERIT alone does not prevent SET ROLE through a chain.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker']) AS runtime_role
    CROSS JOIN unnest(ARRAY['elevateo_owner', 'elevateo_migrator', 'elevateo_session_owner', 'elevateo_send_owner']) AS owner_role
    WHERE pg_has_role(runtime_role, owner_role, 'SET, USAGE, MEMBER WITH ADMIN OPTION')
  ) OR EXISTS (
    SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker']) AS runtime_role
    WHERE pg_has_role(runtime_role, 'elevateo_app_read', 'SET, MEMBER WITH ADMIN OPTION')
  ) OR pg_has_role('elevateo_worker', 'elevateo_app_read', 'USAGE')
    OR NOT pg_has_role('elevateo_migrator', 'elevateo_owner', 'SET')
    OR NOT pg_has_role('elevateo_migrator', 'elevateo_session_owner', 'SET')
    OR pg_has_role('elevateo_migrator', 'elevateo_owner', 'USAGE')
    OR pg_has_role('elevateo_owner', 'elevateo_session_owner', 'USAGE')
  THEN RAISE EXCEPTION 'application membership effective privilege postcondition failed'; END IF;
END $$;

-- AIDEV-NOTE: Private schema lifecycle is privileged bootstrap work; migrations never receive database CREATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_drafts_private') THEN
    CREATE SCHEMA app_drafts_private AUTHORIZATION elevateo_owner;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_drafts_private')
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: missing schema'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_drafts_private'
      AND nspowner = 'elevateo_owner'::regrole)
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: wrong owner'; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'app_drafts_private'
        AND (a.grantee <> n.nspowner OR a.grantor <> n.nspowner))
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: foreign ACL'; END IF;
  IF NOT (has_schema_privilege('elevateo_owner', 'app_drafts_private', 'CREATE')
      AND has_schema_privilege('elevateo_owner', 'app_drafts_private', 'USAGE'))
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: owner privilege loss'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker', 'elevateo_app_read']) role_name
      WHERE has_schema_privilege(role_name, 'app_drafts_private', 'CREATE')
        OR has_schema_privilege(role_name, 'app_drafts_private', 'USAGE'))
  THEN RAISE EXCEPTION 'draft private schema bootstrap prerequisite failed: runtime access'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_owner', 'elevateo_migrator',
      'elevateo_api', 'elevateo_worker', 'elevateo_app_read']) role_name
      WHERE has_database_privilege(role_name, current_database(), 'CREATE'))
  THEN RAISE EXCEPTION 'unexpected application database CREATE privilege'; END IF;
END $$;

-- AIDEV-NOTE: Private schema lifecycle is privileged bootstrap work; migrations never receive database CREATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_connector_private') THEN
    CREATE SCHEMA app_connector_private AUTHORIZATION elevateo_owner;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_connector_private')
  THEN RAISE EXCEPTION 'connector private schema bootstrap prerequisite failed: missing schema'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_connector_private'
      AND nspowner = 'elevateo_owner'::regrole)
  THEN RAISE EXCEPTION 'connector private schema bootstrap prerequisite failed: wrong owner'; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'app_connector_private'
        AND (a.grantee <> n.nspowner OR a.grantor <> n.nspowner))
  THEN RAISE EXCEPTION 'connector private schema bootstrap prerequisite failed: foreign ACL'; END IF;
  IF NOT (has_schema_privilege('elevateo_owner', 'app_connector_private', 'CREATE')
      AND has_schema_privilege('elevateo_owner', 'app_connector_private', 'USAGE'))
  THEN RAISE EXCEPTION 'connector private schema bootstrap prerequisite failed: owner privilege loss'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker', 'elevateo_app_read']) role_name
      WHERE has_schema_privilege(role_name, 'app_connector_private', 'CREATE')
        OR has_schema_privilege(role_name, 'app_connector_private', 'USAGE'))
  THEN RAISE EXCEPTION 'connector private schema bootstrap prerequisite failed: runtime access'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_owner', 'elevateo_migrator',
      'elevateo_api', 'elevateo_worker', 'elevateo_app_read']) role_name
      WHERE has_database_privilege(role_name, current_database(), 'CREATE'))
  THEN RAISE EXCEPTION 'unexpected application database CREATE privilege'; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION elevateo_owner;
CREATE SCHEMA IF NOT EXISTS app_meta AUTHORIZATION elevateo_owner;
REVOKE ALL ON SCHEMA app, app_meta FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM elevateo_api, elevateo_worker, elevateo_migrator;
GRANT CONNECT ON DATABASE postgres TO elevateo_migrator, elevateo_api, elevateo_worker;
COMMIT;
SELECT 'bootstrap: ok' AS status;
