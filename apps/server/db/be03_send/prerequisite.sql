-- AIDEV-NOTE: Fail closed instead of granting a migrator role/schema creation privileges.
DO $$ BEGIN
  IF current_user <> 'elevateo_owner' OR NOT EXISTS (SELECT 1 FROM pg_roles
      WHERE rolname = 'elevateo_send_owner' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
      AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_send_private'
      AND nspowner = 'elevateo_send_owner'::regrole)
    OR NOT pg_has_role('elevateo_owner', 'elevateo_send_owner', 'SET')
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api','elevateo_worker','elevateo_app_read']) r
      WHERE pg_has_role(r, 'elevateo_send_owner', 'USAGE, SET, MEMBER')) THEN
    RAISE EXCEPTION 'send bootstrap prerequisite missing or unsafe';
  END IF;
END $$;
