-- AIDEV-NOTE: Read-only admission precedes any bootstrap; preserve the existing Supabase database and roles.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$ BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'supabase_admin'
    OR current_user <> 'supabase_admin' OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin' AND oid = 10
        AND rolsuper AND rolcreaterole AND rolbypassrls
    ) OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'reviewed PostgreSQL 17 Supabase administrator required';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regclass('auth.identities') IS NULL
    OR to_regclass('auth.sessions') IS NULL OR to_regclass('storage.objects') IS NULL
    OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'existing Supabase Auth and Storage required; never create replacement schemas';
  END IF;
END $$;
COMMIT;
