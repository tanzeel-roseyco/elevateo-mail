-- AIDEV-NOTE: Included inside a rollback case; three real rows prevent an empty RLS result from passing.
SET SESSION AUTHORIZATION elevateo_session_owner;
DO $$
DECLARE caller_identity text; observed_ids uuid[]; observed record;
expected_ids uuid[] := ARRAY['33333333-3333-4333-8333-333333333333',
  '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777']::uuid[];
BEGIN
  IF current_user <> 'elevateo_session_owner' OR session_user <> 'elevateo_session_owner'
    OR row_security_active('auth.sessions') IS DISTINCT FROM TRUE
    OR has_table_privilege(current_user, 'auth.sessions', 'SELECT') THEN
    RAISE EXCEPTION 'Auth visibility must use active RLS and only column privileges';
  END IF;
  FOREACH caller_identity IN ARRAY ARRAY['', '22222222-2222-4222-8222-222222222222', 'not-a-uuid'] LOOP
    PERFORM set_config('app_auth.verified_user_id', caller_identity, true);
    observed_ids := '{}'::uuid[];
    FOR observed IN SELECT id, user_id, created_at, not_after FROM auth.sessions ORDER BY id LOOP
      observed_ids := array_append(observed_ids, observed.id);
      -- AIDEV-NOTE: Parentheses keep each SQL CASE's THEN separate from the enclosing PL/pgSQL IF delimiter.
      IF observed.user_id IS DISTINCT FROM (CASE WHEN observed.id = expected_ids[2]
          THEN '22222222-2222-4222-8222-222222222222'::uuid
          ELSE '11111111-1111-4111-8111-111111111111'::uuid END)
        OR observed.created_at IS NULL OR NOT isfinite(observed.created_at)
        OR (CASE WHEN observed.id = expected_ids[2]
          THEN observed.not_after IS DISTINCT FROM observed.created_at + interval '6 hours'
          ELSE observed.not_after IS NOT NULL END) THEN
        RAISE EXCEPTION 'Auth RLS returned unexpected four-column values';
      END IF;
    END LOOP;
    IF observed_ids IS DISTINCT FROM expected_ids THEN
      RAISE EXCEPTION 'Auth RLS hid or changed required rows under caller identity';
    END IF;
  END LOOP;
  BEGIN
    PERFORM private_token FROM auth.sessions;
    RAISE EXCEPTION 'private token read unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM auth.sessions;
    RAISE EXCEPTION 'Auth SELECT star unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE auth.sessions SET not_after = NULL;
    RAISE EXCEPTION 'Auth write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET SESSION AUTHORIZATION;
