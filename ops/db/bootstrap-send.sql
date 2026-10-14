-- AIDEV-NOTE: Additive privileged bootstrap; migrate as NOLOGIN owners without runtime role inheritance.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'send bootstrap requires privileged fixture/operator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateo_send_owner') THEN
    CREATE ROLE elevateo_send_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateo_send_owner' AND
      (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'elevateo_send_owner'::regrole)
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_send_owner'::regrole AND NOT (
      member = 'elevateo_owner'::regrole AND grantor = 'supabase_admin'::regrole
      AND NOT admin_option AND NOT inherit_option AND set_option)) THEN
    RAISE EXCEPTION 'send owner role boundary drift';
  END IF;
END $$;
GRANT elevateo_send_owner TO elevateo_owner WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY supabase_admin;
CREATE SCHEMA IF NOT EXISTS app_send_private AUTHORIZATION elevateo_send_owner;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_send_private'
      AND nspowner = 'elevateo_send_owner'::regrole)
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api','elevateo_worker','elevateo_app_read']) r
      WHERE pg_has_role(r, 'elevateo_send_owner', 'USAGE, SET, MEMBER')) THEN
    RAISE EXCEPTION 'send private schema/runtime boundary drift';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
      aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    WHERE n.nspname = 'app_send_private' AND NOT (
      a.grantor = 'elevateo_send_owner'::regrole AND (a.grantee = n.nspowner OR
      (a.grantee = 'elevateo_owner'::regrole AND a.privilege_type IN ('CREATE','USAGE') AND NOT a.is_grantable)))) THEN
    RAISE EXCEPTION 'send private schema ACL drift';
  END IF;
END $$;
SET LOCAL ROLE elevateo_send_owner;
REVOKE ALL ON SCHEMA app_send_private FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA app_send_private TO elevateo_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
