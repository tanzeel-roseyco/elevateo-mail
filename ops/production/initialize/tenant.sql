-- AIDEV-NOTE: Operator-only transaction; no email lookup, fixture identity, password or public runtime enrollment.
\set ON_ERROR_STOP on
\getenv org INIT_ORGANIZATION_ID
\getenv usr INIT_USER_ID
\getenv name INIT_NAME
\getenv role INIT_ROLE
\getenv receipt INIT_RECEIPT
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('initialize.org', :'org', true), set_config('initialize.user', :'usr', true),
  set_config('initialize.name', :'name', true), set_config('initialize.role', :'role', true),
  set_config('initialize.receipt', :'receipt', true);
-- Serialize operator initializations, including two different users racing to become the first owner.
SELECT pg_advisory_xact_lock(62817, 1);
DO $$
DECLARE
  org uuid := current_setting('initialize.org')::uuid;
  usr uuid := current_setting('initialize.user')::uuid;
  org_name text := current_setting('initialize.name');
  grant_role text := current_setting('initialize.role');
  receipt text := current_setting('initialize.receipt');
BEGIN
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'privileged tenant operator required';
  END IF;
  IF org = '00000000-0000-0000-0000-000000000000'::uuid
    OR usr = '00000000-0000-0000-0000-000000000000'::uuid
    OR length(org_name) NOT BETWEEN 1 AND 200 OR org_name <> btrim(org_name)
    OR org_name ~ '[[:cntrl:]]' OR grant_role NOT IN
      ('owner','admin','operator','sales_manager','sales','auditor','associate')
    OR length(receipt) NOT BETWEEN 16 AND 200 OR receipt !~ '^[A-Za-z0-9._:/-]+$' THEN
    RAISE EXCEPTION 'invalid verified enrollment arguments';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['app.organizations','app.organization_memberships',
      'app.organization_access','app.organization_enrollment_receipts']) AS required(name)
    LEFT JOIN pg_class c ON c.oid = to_regclass(required.name)
    WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR c.relowner <> 'elevateo_owner'::regrole) THEN
    RAISE EXCEPTION 'reviewed ownership and forced RLS required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('elevateo_api','elevateo_worker','elevateo_migrator')
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
    RAISE EXCEPTION 'unsafe runtime/migrator role';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN
      ('elevateo_api','elevateo_worker','elevateo_migrator')) <> 3 OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'elevateo_owner' AND NOT rolcanlogin
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
    RAISE EXCEPTION 'reviewed restricted role roster required';
  END IF;
  -- Lock the actual Auth row through commit so deletion/ban cannot race the identity check.
  PERFORM 1 FROM auth.users WHERE id = usr AND email_confirmed_at IS NOT NULL
    AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= clock_timestamp()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'existing confirmed active Auth UUID required'; END IF;
  PERFORM 1 FROM auth.identities WHERE user_id = usr AND provider = 'google' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'existing Google identity required'; END IF;
  PERFORM app_auth.lock_authorization_generations(org, usr);
  PERFORM 1 FROM app.organizations WHERE id = org FOR UPDATE;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM app.organizations WHERE id = org AND name = org_name) THEN
      RAISE EXCEPTION 'organization name conflict';
    END IF;
  ELSE
    IF grant_role <> 'owner' THEN RAISE EXCEPTION 'first enrollment must be owner'; END IF;
    INSERT INTO app.organizations(id, name) VALUES (org, org_name);
  END IF;
  -- Existing membership without its exact receipt is not authority to elevate a user.
  IF EXISTS (SELECT 1 FROM app.organization_memberships WHERE organization_id = org AND user_id = usr) THEN
    IF NOT EXISTS (SELECT 1 FROM app.organization_access a JOIN app.organization_enrollment_receipts r
      USING (organization_id, user_id) WHERE a.organization_id = org AND a.user_id = usr
        AND a.role = grant_role AND r.role = grant_role AND r.receipt_ref = receipt) THEN
      RAISE EXCEPTION 'existing membership conflicts with approved enrollment';
    END IF;
  ELSE
    INSERT INTO app.organization_memberships(organization_id, user_id) VALUES (org, usr);
    IF (grant_role = 'owner') = EXISTS (
      SELECT 1 FROM app.organization_access WHERE organization_id = org AND role = 'owner'
    ) THEN
      RAISE EXCEPTION 'owner enrollment order violated';
    END IF;
    -- AIDEV-NOTE: Existing definer cannot lock organizations under forced RLS; keep this operator-only, not a new API.
    INSERT INTO app.organization_access(organization_id, user_id, role) VALUES (org, usr, grant_role);
    INSERT INTO app.organization_enrollment_receipts(organization_id, user_id, role, receipt_ref)
      VALUES (org, usr, grant_role, receipt);
  END IF;
END $$;
COMMIT;
