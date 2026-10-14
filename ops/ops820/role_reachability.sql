-- AIDEV-NOTE: PG17 SET/USAGE membership checks include transitive paths, not just direct role flags.
DO $$
DECLARE runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['elevateo_api', 'elevateo_worker'] LOOP
    -- Approved SET allowlist is only the runtime role itself; app_read grants use SET FALSE.
    IF EXISTS (
      SELECT 1 FROM pg_roles target
      WHERE target.rolname <> runtime_role
        AND pg_has_role(runtime_role, target.rolname, 'SET')
    ) THEN RAISE EXCEPTION 'role reachability drift: unexpected SET path for %', runtime_role; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_roles target
      WHERE target.rolname <> runtime_role
        AND (target.rolsuper OR target.rolcreaterole OR target.rolcreatedb
             OR target.rolreplication OR target.rolbypassrls
             OR target.rolname IN ('elevateo_owner', 'elevateo_send_owner',
                                   'elevateo_session_owner', 'supabase_admin'))
        AND pg_has_role(runtime_role, target.rolname, 'USAGE')
    ) OR has_database_privilege(runtime_role, 'postgres', 'CREATE')
      OR has_schema_privilege(runtime_role, 'app', 'CREATE') THEN
      RAISE EXCEPTION 'role reachability drift: effective privilege for %', runtime_role;
    END IF;
  END LOOP;
END $$;
