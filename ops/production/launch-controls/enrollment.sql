-- AIDEV-NOTE: Root-only installation, never application startup; no provider calls or production identity defaults.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_user <> 'supabase_admin' OR session_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'privileged launch operator required';
  END IF;
  CREATE ROLE elevateo_enrollment_owner NOLOGIN NOINHERIT;
END $$;
CREATE SCHEMA IF NOT EXISTS launch_controls;
REVOKE ALL ON SCHEMA launch_controls FROM PUBLIC;
CREATE TABLE IF NOT EXISTS launch_controls.company_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  organization_id uuid REFERENCES app.organizations(id),
  verified_owner_id uuid,
  verified_owner_subject text,
  CHECK (NOT enabled OR (organization_id IS NOT NULL AND verified_owner_id IS NOT NULL
    AND length(btrim(verified_owner_subject)) > 0 AND verified_owner_subject IS NOT NULL))
);
-- AIDEV-NOTE: One-shot install; use remove.sql before reinstall. Rollback preserves tombstones and disables policy.
ALTER TABLE launch_controls.company_policy ADD COLUMN IF NOT EXISTS verified_owner_subject text;
INSERT INTO launch_controls.company_policy DEFAULT VALUES ON CONFLICT DO NOTHING;
UPDATE launch_controls.company_policy SET enabled = false;
-- AIDEV-NOTE: No membership FK: removal must not erase the tombstone and silently permit automatic rejoining.
CREATE TABLE IF NOT EXISTS launch_controls.company_enrollments (
  user_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA launch_controls FROM PUBLIC;
GRANT USAGE ON SCHEMA launch_controls, auth, app, app_auth TO elevateo_enrollment_owner;
GRANT SELECT ON launch_controls.company_policy, launch_controls.company_enrollments TO elevateo_enrollment_owner;
GRANT UPDATE (singleton) ON launch_controls.company_policy TO elevateo_enrollment_owner;
GRANT INSERT ON launch_controls.company_enrollments TO elevateo_enrollment_owner;
GRANT SELECT ON app_auth.authorization_generations TO elevateo_enrollment_owner;
GRANT SELECT (id,email,email_confirmed_at,deleted_at,banned_until) ON auth.users TO elevateo_enrollment_owner;
-- FOR SHARE/UPDATE also needs UPDATE privilege; the definer never performs identity writes.
GRANT UPDATE (id) ON auth.users TO elevateo_enrollment_owner;
GRANT SELECT (user_id,provider,identity_data) ON auth.identities TO elevateo_enrollment_owner;
GRANT UPDATE (user_id) ON auth.identities TO elevateo_enrollment_owner;
GRANT SELECT (id,user_id,created_at,not_after) ON auth.sessions TO elevateo_enrollment_owner;
GRANT UPDATE (id) ON auth.sessions TO elevateo_enrollment_owner;
GRANT SELECT ON app.organizations, app.organization_memberships, app.organization_access TO elevateo_enrollment_owner;
GRANT INSERT ON app.organization_memberships, app.organization_access TO elevateo_enrollment_owner;
-- AIDEV-NOTE: UPDATE permits the admission table lock; no UPDATE RLS policy permits membership mutation.
GRANT UPDATE ON app.organization_memberships TO elevateo_enrollment_owner;
CREATE POLICY company_enroll_org_read ON app.organizations FOR SELECT TO elevateo_enrollment_owner USING (true);
CREATE POLICY company_enroll_member_read ON app.organization_memberships FOR SELECT TO elevateo_enrollment_owner USING (true);
CREATE POLICY company_enroll_member_insert ON app.organization_memberships FOR INSERT TO elevateo_enrollment_owner
  WITH CHECK (true);
CREATE POLICY company_enroll_access_read ON app.organization_access FOR SELECT TO elevateo_enrollment_owner USING (true);
CREATE POLICY company_enroll_access_insert ON app.organization_access FOR INSERT TO elevateo_enrollment_owner
  WITH CHECK (role = 'associate');
GRANT EXECUTE ON FUNCTION app_auth.lock_authorization_generations(uuid,uuid) TO elevateo_enrollment_owner;
CREATE FUNCTION app_auth.enroll_company_identity(p_user uuid, p_session uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE policy launch_controls.company_policy%ROWTYPE; email_address text;
BEGIN
  IF p_user IS NULL OR p_session IS NULL THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  -- Lock policy to serialize disabling, and identity to serialize concurrent callbacks for the same user.
  SELECT * INTO policy FROM launch_controls.company_policy WHERE singleton FOR SHARE;
  IF NOT FOUND OR NOT policy.enabled OR policy.verified_owner_subject IS NULL
    OR length(btrim(policy.verified_owner_subject)) = 0 THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  -- AIDEV-NOTE: Sorted identity locks and tenant generations serialize owner bans/revocations before revalidation.
  PERFORM 1 FROM auth.users WHERE id IN (p_user,policy.verified_owner_id) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM auth.identities WHERE user_id IN (p_user,policy.verified_owner_id)
    ORDER BY user_id,provider FOR SHARE;
  -- AIDEV-NOTE: Hold session through admission commit so concurrent deletion/expiry cannot win after validation.
  PERFORM 1 FROM auth.sessions WHERE id = p_session AND user_id = p_user FOR SHARE;
  PERFORM app_auth.lock_authorization_generations(policy.organization_id, NULL);
  -- AIDEV-NOTE: Serialize rare admissions globally so privileged provisioning cannot insert a cross-tenant phantom.
  LOCK TABLE app.organization_memberships IN SHARE ROW EXCLUSIVE MODE;
  SELECT lower(email) INTO email_address FROM auth.users WHERE id = p_user
    AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
    AND (banned_until IS NULL OR banned_until <= clock_timestamp());
  IF NOT FOUND OR email_address IS NULL OR email_address !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@elevateoco[.]com$'
    OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session AND user_id = p_user
      AND created_at + interval '12 hours' > clock_timestamp()
      AND (not_after IS NULL OR not_after > clock_timestamp()))
    OR NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = p_user AND provider = 'custom:authentik'
      AND length(btrim(identity_data->>'sub')) > 0
      AND identity_data->'email_verified' = 'true'::jsonb AND lower(identity_data->>'email') = email_address)
  THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  -- AIDEV-NOTE: Root attests Tanzeel independently and pins UUID plus immutable IdP subject; names grant nothing.
  IF NOT EXISTS (SELECT 1 FROM app.organization_access a JOIN auth.users u ON u.id = a.user_id
      WHERE a.organization_id = policy.organization_id AND a.user_id = policy.verified_owner_id AND a.role = 'owner'
        AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until <= clock_timestamp())
        AND lower(u.email) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@elevateoco[.]com$'
        AND EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'custom:authentik'
          AND i.identity_data->>'sub' = policy.verified_owner_subject
          AND i.identity_data->'email_verified' = 'true'::jsonb AND lower(i.identity_data->>'email') = lower(u.email)))
  THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM app.organization_memberships WHERE user_id = p_user
      AND organization_id <> policy.organization_id) THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM app.organization_memberships WHERE user_id = p_user
      AND organization_id = policy.organization_id) THEN
    INSERT INTO launch_controls.company_enrollments(user_id,organization_id) VALUES (p_user,policy.organization_id)
      ON CONFLICT DO NOTHING;
    RETURN '{"status":"ok"}'::jsonb;
  END IF;
  -- AIDEV-NOTE: Existing authorization history also fences revoked members predating this installer.
  IF EXISTS (SELECT 1 FROM app_auth.authorization_generations WHERE user_id = p_user)
  THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  IF EXISTS (SELECT 1 FROM launch_controls.company_enrollments WHERE user_id = p_user)
  THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  INSERT INTO app.organization_memberships(organization_id,user_id) VALUES (policy.organization_id,p_user);
  INSERT INTO app.organization_access(organization_id,user_id,role) VALUES (policy.organization_id,p_user,'associate');
  INSERT INTO launch_controls.company_enrollments(user_id,organization_id) VALUES (p_user,policy.organization_id);
  RETURN '{"status":"ok"}'::jsonb;
END $$;
ALTER FUNCTION app_auth.enroll_company_identity(uuid,uuid) OWNER TO elevateo_enrollment_owner;
REVOKE ALL ON FUNCTION app_auth.enroll_company_identity(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_auth.enroll_company_identity(uuid,uuid) TO elevateo_api;
COMMIT;
