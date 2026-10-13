-- AIDEV-NOTE: Load the actual BE02 SQL under hostile named-role defaults; all defaults and objects roll back.
BEGIN;
SET LOCAL ROLE elevateo_session_owner;
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_auth GRANT EXECUTE ON FUNCTIONS TO
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_auth GRANT ALL ON TABLES TO PUBLIC,
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_auth GRANT ALL ON SEQUENCES TO PUBLIC,
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator;
\ir ../../../apps/server/db/be02/tables.sql
\ir ../../../apps/server/db/be02/helpers.sql
\ir ../../../apps/server/db/be02/generations.sql
\ir ../../../apps/server/db/be02/entry.sql
\ir ../../../apps/server/db/be02/read.sql
\ir ../../../apps/server/db/be02/refresh.sql
\ir ../../../apps/server/db/be02/revocation.sql
\ir ../../../apps/server/db/be02/pending.sql
\ir ../../../apps/server/db/be02/rate_limits.sql
DO $$ BEGIN
  IF NOT has_function_privilege('elevateo_api', 'app_auth.check_digest(text)', 'EXECUTE WITH GRANT OPTION')
    OR NOT has_function_privilege('elevateo_worker', 'app_auth.check_digest(text)', 'EXECUTE')
    OR NOT has_function_privilege('elevateo_app_read', 'app_auth.check_digest(text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'hostile defaults fixture did not grant the helper'; END IF;
END $$;
\ir ../../../apps/server/db/be02/grants.sql
DO $$
DECLARE expected record; actual_count bigint;
BEGIN
  FOR expected IN SELECT * FROM (VALUES ('elevateo_api', 16), ('elevateo_worker', 2),
      ('elevateo_owner', 2), ('elevateo_migrator', 0), ('elevateo_app_read', 0), ('public', 0))
      AS counts(role_name, allowed_count) LOOP
    SELECT count(*) INTO actual_count FROM pg_proc WHERE pronamespace = 'app_auth'::regnamespace
      AND has_function_privilege(expected.role_name, oid, 'EXECUTE');
    IF actual_count <> expected.allowed_count THEN
      RAISE EXCEPTION 'unexpected facade size for %: %', expected.role_name, actual_count;
    END IF;
  END LOOP;
END $$;

-- AIDEV-NOTE: Non-superuser owner calls must bind RLS and restore a hostile caller value after nested helpers.
DO $guard$
DECLARE original_definition text; original_catalog jsonb;
owner_assertion text := $assertion$
DO $check$
DECLARE own_membership boolean; foreign_membership boolean; null_membership boolean;
BEGIN
  PERFORM set_config('app_auth.verified_user_id', 'owner-sentinel', true);
  -- AIDEV-NOTE: Materialize every probe; boolean short-circuiting must not skip a broken helper call.
  own_membership := app_auth.has_membership('11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  foreign_membership := app_auth.has_membership('11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  null_membership := app_auth.has_membership(NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  IF own_membership IS DISTINCT FROM TRUE OR foreign_membership IS DISTINCT FROM FALSE
    OR null_membership IS DISTINCT FROM FALSE
    OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM 'owner-sentinel'
  THEN RAISE EXCEPTION 'owner helper identity or restoration failed'; END IF;
END $check$;
$assertion$;
BEGIN
  SELECT pg_get_functiondef(oid), to_jsonb(p) INTO STRICT original_definition, original_catalog
    FROM pg_proc p WHERE oid = 'app_auth.has_membership(uuid,uuid)'::regprocedure;
  EXECUTE owner_assertion;
  -- AIDEV-NOTE: The expected assertion failure rolls back this replacement before later facade checks.
  BEGIN
    EXECUTE $replacement$
      CREATE OR REPLACE FUNCTION app_auth.has_membership(p_user uuid, p_org uuid) RETURNS boolean
      LANGUAGE sql STABLE SET search_path = pg_catalog SET app_auth.verified_user_id = ''
      AS 'SELECT NULL::boolean'
    $replacement$;
    EXECUTE owner_assertion;
    RAISE EXCEPTION 'NULL helper fixture was not rejected' USING ERRCODE = '23514';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM IS DISTINCT FROM 'owner helper identity or restoration failed' THEN RAISE; END IF;
  END;
  IF (SELECT pg_get_functiondef(oid) IS DISTINCT FROM original_definition
      OR to_jsonb(p) IS DISTINCT FROM original_catalog FROM pg_proc p
      WHERE oid = 'app_auth.has_membership(uuid,uuid)'::regprocedure) IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'NULL helper fixture did not restore the definition, ACL and configuration';
  END IF;
  EXECUTE owner_assertion;
END $guard$;

-- AIDEV-NOTE: Test with runtime session identity; a superuser session using SET ROLE could reset to the owner.
RESET ROLE;
SET SESSION AUTHORIZATION elevateo_api;
DO $$
DECLARE result jsonb; forged text := '22222222-2222-4222-8222-222222222222';
BEGIN
  PERFORM set_config('app.user_id', '', true);
  PERFORM set_config('app.org_id', '', true);
  -- AIDEV-NOTE: PG17 allows placeholder SET; only the private function's bound identity may authorize its RLS.
  PERFORM set_config('app_auth.verified_user_id', forged, true);
  IF EXISTS (SELECT 1 FROM app.organization_memberships) THEN
    RAISE EXCEPTION 'runtime forged private identity authorized a table read';
  END IF;
  BEGIN
    EXECUTE 'SET ROLE elevateo_session_owner';
    RAISE EXCEPTION 'runtime reached private owner after forged SET';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  result := app_auth.create_session(repeat('1', 64), '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333', 'fixture-access', 'fixture-refresh',
    statement_timestamp() + interval '1 hour', '44444444-4444-4444-8444-444444444444', repeat('c', 32));
  IF result->>'status' IS DISTINCT FROM 'ok'
    OR result->>'organization_id' IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    OR result->>'organization_name' IS DISTINCT FROM 'Own organization'
    OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM forged
  THEN RAISE EXCEPTION 'session function trusted caller identity or failed to restore it'; END IF;
  result := app_auth.list_organizations(repeat('1', 64), '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333', NULL, 50);
  IF result->>'status' IS DISTINCT FROM 'ok' OR result->'organizations' IS DISTINCT FROM
      '[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","name":"Own organization"}]'::jsonb
    OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM forged
  THEN RAISE EXCEPTION 'read function leaked foreign identity or failed to restore it'; END IF;
  result := app_auth.list_organizations(repeat('1', 64), forged::uuid,
    '33333333-3333-4333-8333-333333333333', NULL, 50);
  IF result->>'status' IS DISTINCT FROM 'unauthorized'
    OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM forged
  THEN RAISE EXCEPTION 'forged principal bypassed session binding or early-return restoration'; END IF;
  BEGIN
    PERFORM app_auth.create_session(repeat('1', 64), '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333', 'fixture-access', 'fixture-refresh',
      statement_timestamp() + interval '1 hour', '44444444-4444-4444-8444-444444444444', repeat('c', 32));
    RAISE EXCEPTION 'duplicate fixture digest did not fail after setting private identity';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF current_setting('app_auth.verified_user_id') IS DISTINCT FROM forged
    OR EXISTS (SELECT 1 FROM app.organization_memberships)
  THEN RAISE EXCEPTION 'exception leaked private function identity or table access'; END IF;
  BEGIN
    PERFORM private_token FROM auth.sessions;
    RAISE EXCEPTION 'runtime reached Auth token after forged SET';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

DO $$ BEGIN
  IF app_auth.resolve_session(repeat('0', 64))->>'status' IS DISTINCT FROM 'unauthorized' THEN
    RAISE EXCEPTION 'API facade failed its empty-session result';
  END IF;
  BEGIN
    PERFORM app_auth.resolve_session(NULL);
    RAISE EXCEPTION 'API facade accepted a null digest';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM app_auth.check_digest(repeat('0', 64));
    RAISE EXCEPTION 'API invoked private helper';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM app_auth.claim_revocations(gen_random_uuid(), 1);
    RAISE EXCEPTION 'API invoked worker facade';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM cookie_digest FROM app_auth.sessions;
    RAISE EXCEPTION 'API read private table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION elevateo_worker;
DO $$ BEGIN
  PERFORM set_config('app_auth.verified_user_id', '11111111-1111-4111-8111-111111111111', true);
  BEGIN
    EXECUTE 'SET ROLE elevateo_session_owner';
    RAISE EXCEPTION 'worker reached private owner after forged SET';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM user_id FROM app.organization_memberships;
    RAISE EXCEPTION 'worker reached private owner RLS table after forged SET';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF app_auth.claim_revocations(gen_random_uuid(), 1) IS DISTINCT FROM '{"status":"ok","intents":[]}'::jsonb THEN
    RAISE EXCEPTION 'worker facade failed its empty-queue result';
  END IF;
  BEGIN
    PERFORM app_auth.resolve_session(repeat('0', 64));
    RAISE EXCEPTION 'worker invoked API facade';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM app_auth.check_digest(repeat('0', 64));
    RAISE EXCEPTION 'worker invoked private helper';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET SESSION AUTHORIZATION;
SET LOCAL ROLE elevateo_owner;
SELECT app_auth.lock_authorization_generations(gen_random_uuid(), NULL);
ROLLBACK;
