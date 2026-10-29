-- AIDEV-NOTE: Second bootstrap phase runs after pinned Auth readiness and before application migrations.
\set ON_ERROR_STOP on
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, pg_temp;
DO $$ BEGIN
  IF session_user <> 'supabase_admin' OR current_user <> 'supabase_admin' THEN
    RAISE EXCEPTION 'unexpected Auth grant bootstrap identity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('auth.sessions') AND relkind = 'r')
    OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'elevateo_session_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
  ) THEN RAISE EXCEPTION 'pinned Auth sessions/private owner prerequisites missing'; END IF;
END $$;

-- AIDEV-NOTE: Inspect in the next READ COMMITTED statement after the DDL lock wait; never reuse a pre-wait snapshot.
LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  private_owner oid := 'elevateo_session_owner'::regrole;
  original_relation record;
  original_policies jsonb;
  expected_policy_oid oid;
  own_policy pg_policy;
  conflicting_policy text;
  checked_role text;
  phase integer;
BEGIN
  SELECT c.relkind, c.relowner, c.relrowsecurity, c.relforcerowsecurity, n.nspowner INTO STRICT original_relation
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = 'auth.sessions'::regclass;
  IF original_relation.relkind IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'pinned Auth sessions/private owner prerequisites missing';
  END IF;
  IF original_relation.relrowsecurity IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Auth sessions RLS is disabled; pinned profile drift';
  END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'auth.sessions'::regclass AND NOT attisdropped
    AND ((attname IN ('id', 'user_id') AND atttypid = 'uuid'::regtype)
      OR (attname IN ('created_at', 'not_after') AND atttypid = 'timestamptz'::regtype))) <> 4 THEN
    RAISE EXCEPTION 'unsupported Auth session policy column types';
  END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) INTO original_policies FROM pg_policy p
    WHERE p.polrelid = 'auth.sessions'::regclass AND p.polname <> 'elevateo_private_session_select';
  SELECT oid INTO expected_policy_oid FROM pg_policy
    WHERE polrelid = 'auth.sessions'::regclass AND polname = 'elevateo_private_session_select';

  -- AIDEV-NOTE: Reuse the same checks before and after the narrow mutation; no persistent verifier is installed.
  FOR phase IN 1..2 LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE oid = private_owner AND NOT rolcanlogin
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolreplication)
      OR pg_has_role(private_owner, original_relation.relowner, 'USAGE, SET') THEN
      RAISE EXCEPTION 'Auth private owner attributes or table ownership drift';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = private_owner)
      OR (SELECT count(*) FROM pg_auth_members WHERE roleid = private_owner) <> 1
      OR NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = private_owner
        AND member = 'elevateo_owner'::regrole AND grantor = 'supabase_admin'::regrole
        AND NOT admin_option AND NOT inherit_option AND set_option)
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api', 'elevateo_worker']) runtime_role
        WHERE pg_has_role(runtime_role, 'elevateo_session_owner', 'MEMBER, USAGE, SET')) THEN
      RAISE EXCEPTION 'Auth private owner membership drift';
    END IF;

    -- AIDEV-NOTE: This role sees four columns across sessions; verified UUID/session binding stays in the facade.
    SELECT * INTO own_policy FROM pg_policy
      WHERE polrelid = 'auth.sessions'::regclass AND polname = 'elevateo_private_session_select';
    IF FOUND THEN
      IF own_policy.polcmd IS DISTINCT FROM 'r' OR own_policy.polpermissive IS DISTINCT FROM TRUE
        OR own_policy.polroles IS DISTINCT FROM ARRAY[private_owner]
        OR pg_get_expr(own_policy.polqual, own_policy.polrelid) IS DISTINCT FROM 'true'
        OR own_policy.polwithcheck IS NOT NULL
        OR own_policy.oid IS DISTINCT FROM expected_policy_oid THEN
        RAISE EXCEPTION 'Auth session policy drift: elevateo_private_session_select';
      END IF;
    ELSIF phase = 2 THEN
      RAISE EXCEPTION 'Auth session policy postcondition missing: elevateo_private_session_select';
    END IF;
    SELECT p.polname INTO conflicting_policy FROM pg_policy p
      WHERE p.polrelid = 'auth.sessions'::regclass AND p.polname <> 'elevateo_private_session_select'
        AND (private_owner = ANY(p.polroles) OR (p.polcmd IN ('r', '*') AND EXISTS (
          SELECT 1 FROM unnest(p.polroles) AS target(role_oid)
          -- AIDEV-NOTE: PUBLIC is OID zero; CASE prevents a role lookup for zero regardless of planner ordering.
          WHERE CASE WHEN target.role_oid = 0 THEN true
            ELSE pg_has_role(private_owner, target.role_oid, 'USAGE') END)))
      ORDER BY p.polname LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Auth additional session policy drift: %', conflicting_policy; END IF;

    -- AIDEV-NOTE: Reject existing Auth drift transactionally; never erase grants whose origin needs investigation.
    FOREACH checked_role IN ARRAY ARRAY['elevateo_session_owner', 'elevateo_owner', 'elevateo_migrator',
        'elevateo_api', 'elevateo_worker', 'elevateo_app_read'] LOOP
      IF has_schema_privilege(checked_role, 'auth', 'CREATE, USAGE WITH GRANT OPTION')
        OR EXISTS (SELECT 1 FROM pg_class AS relation
          WHERE relation.relnamespace = 'auth'::regnamespace AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege(checked_role, relation.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'))
        OR EXISTS (SELECT 1 FROM pg_attribute AS column_acl JOIN pg_class AS relation
            ON relation.oid = column_acl.attrelid
          WHERE relation.relnamespace = 'auth'::regnamespace AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND column_acl.attnum > 0 AND NOT column_acl.attisdropped
            AND (has_column_privilege(checked_role, relation.oid, column_acl.attnum,
                  'INSERT, UPDATE, REFERENCES, SELECT WITH GRANT OPTION')
              OR (has_column_privilege(checked_role, relation.oid, column_acl.attnum, 'SELECT')
                AND NOT (checked_role = 'elevateo_session_owner' AND relation.oid = 'auth.sessions'::regclass
                  AND column_acl.attname IN ('id', 'user_id', 'created_at', 'not_after')))))
        -- AIDEV-NOTE: AND predicates may reorder; CASE keeps sequence-only checks away from tables and TOAST.
        OR EXISTS (SELECT 1 FROM pg_class AS relation
          WHERE relation.relnamespace = 'auth'::regnamespace
            AND CASE WHEN relation.relkind = 'S'
              THEN has_sequence_privilege(checked_role, relation.oid, 'USAGE, SELECT, UPDATE') ELSE false END)
      THEN RAISE EXCEPTION 'Auth privilege drift for % exceeds accepted four-column read boundary', checked_role;
      END IF;
    END LOOP;

    IF phase = 1 THEN
      IF expected_policy_oid IS NULL THEN
        CREATE POLICY elevateo_private_session_select ON auth.sessions AS PERMISSIVE
          FOR SELECT TO elevateo_session_owner USING (true);
        SELECT oid INTO STRICT expected_policy_oid FROM pg_policy
          WHERE polrelid = 'auth.sessions'::regclass AND polname = 'elevateo_private_session_select';
      END IF;
      GRANT USAGE ON SCHEMA auth TO elevateo_session_owner;
      GRANT SELECT (id, user_id, created_at, not_after) ON auth.sessions TO elevateo_session_owner;
    END IF;
  END LOOP;
  IF NOT has_schema_privilege('elevateo_session_owner', 'auth', 'USAGE') OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['id', 'user_id', 'created_at', 'not_after']) AS column_name
      WHERE NOT has_column_privilege('elevateo_session_owner', 'auth.sessions', column_name, 'SELECT')) THEN
    RAISE EXCEPTION 'private owner Auth four-column grant postcondition failed';
  END IF;
  IF (SELECT ROW(c.relowner, c.relrowsecurity, c.relforcerowsecurity, n.nspowner) IS DISTINCT FROM
        ROW(original_relation.relowner, original_relation.relrowsecurity,
          original_relation.relforcerowsecurity, original_relation.nspowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = 'auth.sessions'::regclass) IS DISTINCT FROM FALSE
    OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p
      WHERE p.polrelid = 'auth.sessions'::regclass AND p.polname <> 'elevateo_private_session_select')
      IS DISTINCT FROM original_policies THEN
    RAISE EXCEPTION 'Auth ownership, RLS flags or unrelated policy preservation failed';
  END IF;
END $$;
COMMIT;
SELECT 'bootstrap-auth-grants: ok' AS status;
