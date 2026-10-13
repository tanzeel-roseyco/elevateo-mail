-- AIDEV-NOTE: Enumerate runtime entrypoints; helpers and private composite row types never become public APIs.
-- AIDEV-NOTE: Named-role default ACLs survive PUBLIC revocation; clear their function grants before the allowlist.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_auth FROM PUBLIC,
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator;
REVOKE ALL ON ALL TABLES IN SCHEMA app_auth FROM PUBLIC,
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_auth FROM PUBLIC,
  elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator;
GRANT USAGE ON SCHEMA app_auth TO elevateo_api, elevateo_worker, elevateo_owner;

DO $$
DECLARE permission record; entrypoint regprocedure;
BEGIN
  FOR permission IN SELECT * FROM (VALUES
    ('elevateo_api', ARRAY[
      'app_auth.create_session(text,uuid,uuid,text,text,timestamptz,uuid,text)'::regprocedure,
      'app_auth.resolve_session(text)'::regprocedure,
      'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)'::regprocedure,
      'app_auth.touch_session(text,uuid,uuid)'::regprocedure,
      'app_auth.list_organizations(text,uuid,uuid,uuid,integer)'::regprocedure,
      'app_auth.switch_organization(text,uuid,uuid,uuid,uuid,text,uuid,bigint)'::regprocedure,
      'app_auth.claim_refresh(text,uuid)'::regprocedure,
      'app_auth.publish_refresh(text,uuid,bigint,uuid,uuid,text,text,timestamptz)'::regprocedure,
      'app_auth.fail_refresh(text,uuid,bigint)'::regprocedure,
      'app_auth.revoke_session(text,text)'::regprocedure,
      'app_auth.stage_entry(text,text,text)'::regprocedure,
      'app_auth.claim_entry(text,uuid)'::regprocedure,
      'app_auth.verify_entry(text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure,
      'app_auth.fail_entry(text,uuid,boolean)'::regprocedure,
      'app_auth.complete_entry(text,uuid,text,uuid,text)'::regprocedure,
      'app_auth.consume_entry_limits(text,text)'::regprocedure]),
    ('elevateo_worker', ARRAY['app_auth.claim_revocations(uuid,integer)'::regprocedure,
      'app_auth.finish_revocation(bigint,uuid,boolean)'::regprocedure]),
    ('elevateo_owner', ARRAY['app_auth.lock_authorization_generations(uuid,uuid)'::regprocedure,
      'app_auth.bump_authorization_generation()'::regprocedure]),
    ('elevateo_app_read', ARRAY[]::regprocedure[]),
    ('elevateo_migrator', ARRAY[]::regprocedure[]),
    ('public', ARRAY[]::regprocedure[])
  ) AS allowed(role_name, entrypoints) LOOP
    FOREACH entrypoint IN ARRAY permission.entrypoints LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', entrypoint, permission.role_name);
    END LOOP;
    -- AIDEV-NOTE: Effective checks include inherited/PUBLIC grants and reject column or grant-option drift.
    IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'app_auth'::regnamespace
        AND (has_function_privilege(permission.role_name, oid, 'EXECUTE')
              IS DISTINCT FROM (oid = ANY(permission.entrypoints))
          OR has_function_privilege(permission.role_name, oid, 'EXECUTE WITH GRANT OPTION')))
      OR has_schema_privilege(permission.role_name, 'app_auth', 'CREATE, USAGE WITH GRANT OPTION')
      OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'app_auth'::regnamespace
        AND relkind IN ('r', 'p', 'v', 'm', 'f')
        AND (has_table_privilege(permission.role_name, oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
          OR has_any_column_privilege(permission.role_name, oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
      -- AIDEV-NOTE: Planner predicate order is unspecified; CASE protects this sequence-only catalog function.
      OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'app_auth'::regnamespace
        AND CASE WHEN relkind = 'S'
          THEN has_sequence_privilege(permission.role_name, oid, 'SELECT, UPDATE, USAGE') ELSE false END)
    THEN RAISE EXCEPTION 'private session effective privilege boundary failed for %', permission.role_name;
    END IF;
  END LOOP;
END $$;
