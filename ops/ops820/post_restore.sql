-- AIDEV-NOTE: This is a catalog smoke, not a tenant-identity RLS transaction test.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ', ') INTO missing
  FROM (VALUES ('organizations'), ('organization_memberships'), ('mailboxes'),
               ('mailbox_memberships')) expected(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relname = expected.name
      AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity
  );
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'missing FORCE RLS: %', missing; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace n,
                   LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
             WHERE n.nspname = 'app' AND a.grantee = 0
               AND a.privilege_type IN ('USAGE', 'CREATE')) OR
     has_schema_privilege('elevateo_api', 'app', 'CREATE') OR
     has_schema_privilege('elevateo_worker', 'app', 'CREATE') THEN
    RAISE EXCEPTION 'schema privilege drift';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('elevateo_api', 'elevateo_worker')
             AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN
    RAISE EXCEPTION 'runtime role privilege drift';
  END IF;
  IF NOT pg_has_role('elevateo_api', 'elevateo_app_read', 'MEMBER') THEN
    RAISE EXCEPTION 'API read grant missing';
  END IF;
END $$;
