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

-- Synthetic row remains inside this transaction. With no identity context the API role must see none.
BEGIN;
INSERT INTO app.organizations (id, name)
VALUES ('82000000-0000-4000-8000-000000000001', 'OPS820 isolated probe');
INSERT INTO app.organization_memberships (organization_id, user_id)
VALUES ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002');
SET LOCAL ROLE elevateo_api;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.organizations
             WHERE id = '82000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'API role saw organization without identity context';
  END IF;
END $$;
ROLLBACK;

-- Synthetic GUC policy probe: this does not authenticate a user or prove HTTP session binding.
BEGIN;
INSERT INTO app.organizations (id, name) VALUES
  ('82000000-0000-4000-8000-000000000011', 'OPS820 org A'),
  ('82000000-0000-4000-8000-000000000012', 'OPS820 org B');
INSERT INTO app.organization_memberships (organization_id, user_id) VALUES
  ('82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000021'),
  ('82000000-0000-4000-8000-000000000012', '82000000-0000-4000-8000-000000000022');
INSERT INTO app.mailboxes (id, organization_id, address, visibility) VALUES
  ('82000000-0000-4000-8000-000000000031', '82000000-0000-4000-8000-000000000011', 'a@ops820.invalid', 'shared'),
  ('82000000-0000-4000-8000-000000000032', '82000000-0000-4000-8000-000000000012', 'b@ops820.invalid', 'shared');
SET LOCAL ROLE elevateo_api;
SET LOCAL app.user_id = '82000000-0000-4000-8000-000000000021';
SET LOCAL app.org_id = '82000000-0000-4000-8000-000000000011';
DO $$
BEGIN
  IF (SELECT count(*) FROM app.mailboxes WHERE id = '82000000-0000-4000-8000-000000000031') <> 1 OR
     EXISTS (SELECT 1 FROM app.mailboxes WHERE id = '82000000-0000-4000-8000-000000000032') THEN
    RAISE EXCEPTION 'synthetic policy scope mismatch';
  END IF;
END $$;
ROLLBACK;
