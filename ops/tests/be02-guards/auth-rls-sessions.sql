-- AIDEV-NOTE: Exercise real private helpers with Auth RLS active; all fixture mutations roll back.
BEGIN;
DO $$ BEGIN
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'auth.sessions'::regclass) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Auth session semantics require an RLS-enabled fixture';
  END IF;
END $$;
SET LOCAL ROLE elevateo_session_owner;
\ir ../../../apps/server/db/be02/tables.sql
\ir ../../../apps/server/db/be02/helpers.sql
\ir ../../../apps/server/db/be02/generations.sql
\ir ../../../apps/server/db/be02/entry.sql
\ir ../../../apps/server/db/be02/read.sql
\ir ../../../apps/server/db/be02/refresh.sql
\ir ../../../apps/server/db/be02/revocation.sql
\ir ../../../apps/server/db/be02/pending.sql
\ir ../../../apps/server/db/be02/rate_limits.sql
\ir ../../../apps/server/db/be02/grants.sql
RESET ROLE;

-- AIDEV-NOTE: SESSION AUTHORIZATION removes the superuser fallback during actual facade calls.
SET SESSION AUTHORIZATION elevateo_api;
DO $$
DECLARE fixture record; result jsonb;
BEGIN
  FOR fixture IN SELECT * FROM (VALUES ('a', ''), ('b', '22222222-2222-4222-8222-222222222222'),
      ('c', 'not-a-uuid')) AS cases(digest_char, caller_identity) LOOP
    PERFORM set_config('app_auth.verified_user_id', fixture.caller_identity, true);
    result := app_auth.create_session(repeat(fixture.digest_char, 64),
      '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
      'fixture-access', 'fixture-refresh', statement_timestamp() + interval '1 hour',
      '44444444-4444-4444-8444-444444444444', repeat('c', 32));
    IF result->>'status' IS DISTINCT FROM 'ok'
      OR result->>'organization_id' IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM fixture.caller_identity THEN
      RAISE EXCEPTION 'Auth RLS create depended on caller identity or leaked function identity';
    END IF;
    result := app_auth.resolve_session(repeat(fixture.digest_char, 64));
    IF result->>'status' IS DISTINCT FROM 'ok'
      OR result->>'user_id' IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'
      OR result->>'auth_session_id' IS DISTINCT FROM '33333333-3333-4333-8333-333333333333'
      OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM fixture.caller_identity THEN
      RAISE EXCEPTION 'Auth RLS resolve depended on caller identity or returned the wrong session';
    END IF;
  END LOOP;
  FOR fixture IN SELECT * FROM (VALUES
      ('22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333333'::uuid),
      ('11111111-1111-4111-8111-111111111111'::uuid, '55555555-5555-4555-8555-555555555555'::uuid))
      AS cases(user_id, auth_session_id) LOOP
    result := app_auth.authorize_session(repeat('a', 64), fixture.user_id, fixture.auth_session_id, NULL, NULL);
    IF result->>'status' IS DISTINCT FROM 'unauthorized' THEN
      RAISE EXCEPTION 'Auth RLS authorization accepted a mismatched identity or current session';
    END IF;
    result := app_auth.create_session(repeat('d', 64), fixture.user_id, fixture.auth_session_id,
      'fixture-access', 'fixture-refresh', statement_timestamp() + interval '1 hour',
      '44444444-4444-4444-8444-444444444444', repeat('c', 32));
    IF result->>'status' IS DISTINCT FROM 'unauthorized' THEN
      RAISE EXCEPTION 'Auth RLS create accepted a mismatched identity or missing session';
    END IF;
  END LOOP;
END $$;

-- AIDEV-NOTE: Only the disposable fixture administrator changes Auth state; the API still has no direct Auth ACL.
RESET SESSION AUTHORIZATION;
UPDATE auth.sessions SET not_after = statement_timestamp() - interval '1 minute'
  WHERE id = '33333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION elevateo_api;
DO $$ BEGIN
  IF app_auth.resolve_session(repeat('a', 64))->>'status' IS DISTINCT FROM 'unauthorized'
    OR app_auth.create_session(repeat('d', 64), '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333', 'fixture-access', 'fixture-refresh',
      statement_timestamp() + interval '1 hour', '44444444-4444-4444-8444-444444444444',
      repeat('c', 32))->>'status' IS DISTINCT FROM 'unauthorized' THEN
    RAISE EXCEPTION 'Auth not_after expiry no longer denies existing and new private sessions';
  END IF;
END $$;

RESET SESSION AUTHORIZATION;
UPDATE auth.sessions SET not_after = NULL, created_at = statement_timestamp() - interval '13 hours'
  WHERE id = '33333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION elevateo_api;
DO $$ BEGIN
  IF app_auth.resolve_session(repeat('a', 64))->>'status' IS DISTINCT FROM 'unauthorized'
    OR app_auth.create_session(repeat('d', 64), '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333', 'fixture-access', 'fixture-refresh',
      statement_timestamp() + interval '1 hour', '44444444-4444-4444-8444-444444444444',
      repeat('c', 32))->>'status' IS DISTINCT FROM 'unauthorized' THEN
    RAISE EXCEPTION 'Auth twelve-hour cap no longer denies existing and new private sessions';
  END IF;
END $$;

RESET SESSION AUTHORIZATION;
UPDATE auth.sessions SET created_at = statement_timestamp()
  WHERE id = '33333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION elevateo_api;
DO $$ BEGIN
  IF app_auth.resolve_session(repeat('a', 64))->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'restored Auth fixture must be readable before the removal regression';
  END IF;
END $$;
RESET SESSION AUTHORIZATION;
DELETE FROM auth.sessions WHERE id = '33333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION elevateo_api;
DO $$ BEGIN
  IF app_auth.resolve_session(repeat('a', 64))->>'status' IS DISTINCT FROM 'unauthorized'
    OR app_auth.create_session(repeat('d', 64), '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333', 'fixture-access', 'fixture-refresh',
      statement_timestamp() + interval '1 hour', '44444444-4444-4444-8444-444444444444',
      repeat('c', 32))->>'status' IS DISTINCT FROM 'unauthorized' THEN
    RAISE EXCEPTION 'removed Auth row no longer denies existing and new private sessions';
  END IF;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
