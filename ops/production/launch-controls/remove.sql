-- AIDEV-NOTE: Explicit root-only rollback retains enrollment tombstones and disabled policy for audit/reinstallation.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_user <> 'supabase_admin' OR session_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'privileged launch operator required';
  END IF;
END $$;
UPDATE launch_controls.company_policy SET enabled = false;
DROP FUNCTION app_auth.enroll_company_identity(uuid,uuid);
DROP POLICY company_enroll_org_read ON app.organizations;
DROP POLICY company_enroll_member_read ON app.organization_memberships;
DROP POLICY company_enroll_member_insert ON app.organization_memberships;
DROP POLICY company_enroll_access_read ON app.organization_access;
DROP POLICY company_enroll_access_insert ON app.organization_access;
DROP OWNED BY elevateo_enrollment_owner;
DROP ROLE elevateo_enrollment_owner;
COMMIT;
