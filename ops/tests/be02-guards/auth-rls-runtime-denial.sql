-- AIDEV-NOTE: auth.sh supplies a real API/worker session identity before including this shared assertion.
DO $$
DECLARE caller_identity text; column_name text; auth_relation oid;
BEGIN
  IF session_user NOT IN ('elevateo_api', 'elevateo_worker') OR current_user <> session_user THEN
    RAISE EXCEPTION 'runtime Auth denial guard has the wrong execution identity';
  END IF;
  -- AIDEV-NOTE: Catalog OID lookup tests the ACL without requiring the deliberately absent auth schema USAGE.
  SELECT c.oid INTO STRICT auth_relation FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'sessions';
  FOREACH caller_identity IN ARRAY ARRAY['', '11111111-1111-4111-8111-111111111111', 'not-a-uuid'] LOOP
    PERFORM set_config('app_auth.verified_user_id', caller_identity, true);
    PERFORM set_config('app.user_id', caller_identity, true);
    FOREACH column_name IN ARRAY ARRAY['id', 'user_id', 'created_at', 'not_after', 'private_token'] LOOP
      IF has_column_privilege(current_user, auth_relation, column_name, 'SELECT') IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'runtime has forbidden Auth column privilege';
      END IF;
      BEGIN
        EXECUTE format('SELECT %I FROM auth.sessions', column_name);
        RAISE EXCEPTION 'runtime read an Auth column directly';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END LOOP;
    BEGIN
      EXECUTE 'SET ROLE elevateo_session_owner';
      RAISE EXCEPTION 'runtime reached private owner';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
