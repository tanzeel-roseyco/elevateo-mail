-- AIDEV-NOTE: privileged, task-owned bootstrap creates only the restricted gateway LOGIN.
-- The attachment migration owns the one schema/function grant; no runtime role membership.
\set ON_ERROR_STOP on
\set gateway_pw `echo "$ATTACHMENT_GATEWAY_DB_PASSWORD"`
BEGIN;
DO $$ BEGIN
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'gateway bootstrap requires privileged fixture/operator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elevateo_attachment_gateway') THEN
    CREATE ROLE elevateo_attachment_gateway LOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elevateo_attachment_gateway'
      AND (NOT rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members
      WHERE member='elevateo_attachment_gateway'::regrole
         OR roleid='elevateo_attachment_gateway'::regrole)
    OR pg_has_role('elevateo_attachment_gateway','elevateo_api','MEMBER')
    OR has_database_privilege('elevateo_attachment_gateway',current_database(),'CREATE')
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='app_auth'
      AND has_schema_privilege('elevateo_attachment_gateway','app_auth','USAGE,CREATE'))
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='app_drafts_private'
      AND has_schema_privilege('elevateo_attachment_gateway','app_drafts_private','USAGE,CREATE'))
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='app_send_private'
      AND has_schema_privilege('elevateo_attachment_gateway','app_send_private','USAGE,CREATE'))
    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('auth','storage')
      AND has_schema_privilege('elevateo_attachment_gateway',n.oid,'USAGE,CREATE'))
    OR (to_regclass('app.inbox_attachments') IS NOT NULL AND
      has_table_privilege('elevateo_attachment_gateway','app.inbox_attachments','SELECT'))
  THEN RAISE EXCEPTION 'gateway role boundary drift; no credential rotation'; END IF;
END $$;
ALTER ROLE elevateo_attachment_gateway PASSWORD :'gateway_pw';
ALTER ROLE elevateo_attachment_gateway SET search_path=pg_catalog;
GRANT CONNECT ON DATABASE postgres TO elevateo_attachment_gateway;
COMMIT;
SELECT 'gateway bootstrap: restricted login ok' AS status;
