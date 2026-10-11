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
  FROM unnest(ARRAY['elevateo_owner', 'elevateo_app_read']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
SELECT format('CREATE ROLE %I LOGIN NOINHERIT', r)
  FROM unnest(ARRAY['elevateo_migrator', 'elevateo_api', 'elevateo_worker']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

-- AIDEV-NOTE: Validate before mutation; unknown membership grants/options require a design disposition.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname IN
      ('elevateo_owner', 'elevateo_app_read', 'elevateo_migrator', 'elevateo_api', 'elevateo_worker')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        OR (rolname <> 'elevateo_api' AND rolinherit)
        OR rolcanlogin <> (rolname IN ('elevateo_migrator', 'elevateo_api', 'elevateo_worker')))
  ) THEN RAISE EXCEPTION 'unexpected application role attributes'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member IN ('elevateo_api'::regrole, 'elevateo_owner'::regrole)
      AND NOT (
        (member = 'elevateo_api'::regrole AND NOT admin_option AND inherit_option
          AND ((grantor = 'supabase_admin'::regrole AND set_option)
            OR (grantor = 'elevateo_owner'::regrole AND NOT set_option)))
        OR (member = 'elevateo_owner'::regrole AND grantor = 'supabase_admin'::regrole
          AND admin_option AND NOT inherit_option AND NOT set_option)
      )
  ) THEN RAISE EXCEPTION 'unexpected elevateo_app_read membership; no changes accepted'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_owner'::regrole
      AND member = 'elevateo_migrator'::regrole
      AND NOT (grantor = 'supabase_admin'::regrole AND NOT admin_option AND NOT inherit_option AND set_option)
  ) THEN RAISE EXCEPTION 'unexpected elevateo_migrator owner prerequisite'; END IF;
END $$;

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

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION elevateo_owner;
CREATE SCHEMA IF NOT EXISTS app_meta AUTHORIZATION elevateo_owner;
REVOKE ALL ON SCHEMA app, app_meta FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM elevateo_api, elevateo_worker, elevateo_migrator;
GRANT CONNECT ON DATABASE postgres TO elevateo_migrator, elevateo_api, elevateo_worker;
COMMIT;
SELECT 'bootstrap: ok' AS status;
