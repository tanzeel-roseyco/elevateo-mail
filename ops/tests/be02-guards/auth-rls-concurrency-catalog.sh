# AIDEV-NOTE: Catalog-only snapshots exclude the exact injected policy; its OID/tuple is checked before exact cleanup.
snapshot() {
  query "SELECT jsonb_build_object(
    'relations', (SELECT jsonb_agg(jsonb_build_array(oid, relowner, relacl, relrowsecurity, relforcerowsecurity)
      ORDER BY oid) FROM pg_class WHERE relnamespace = 'auth'::regnamespace),
    'schema', (SELECT to_jsonb(n) FROM pg_namespace n WHERE oid = 'auth'::regnamespace),
    'columns', (SELECT jsonb_agg(jsonb_build_array(attrelid, attnum, attacl) ORDER BY attrelid, attnum)
      FROM pg_attribute WHERE attrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'auth'::regnamespace)),
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p
      WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'auth'::regnamespace)
        AND NOT (polrelid = 'auth.sessions'::regclass AND polname = '$injected_name')),
    'defaults', (SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d));"
}

unchanged() {
  local label=$1 current
  current=$(snapshot) || fail "catalog capture failed: $label"
  [[ -n "$baseline" && "$current" = "$baseline" ]] || fail "catalog changed: $label"
  printf 'EVIDENCE %s exact policy OIDs/tuples, owners, RLS/FORCE, schema/table/column/default ACLs unchanged\n' "$label"
}

check_fixture() {
  local observed
  [[ "$injected_oid" =~ ^[0-9]+$ ]] || return 1
  observed=$(query "SELECT count(*) FROM pg_policy WHERE oid = $injected_oid
    AND polrelid = 'auth.sessions'::regclass AND polname = '$injected_name'
    AND polcmd = 'r' AND polpermissive AND polroles = ARRAY['elevateo_session_owner'::regrole::oid]
    AND pg_get_expr(polqual, polrelid) = 'false' AND polwithcheck IS NULL;") || return 1
  [[ "$observed" = 1 ]]
}

remove_fixture() {
  local observed
  if [[ -n "$injected_oid" ]]; then
    # AIDEV-NOTE: Lock before inspecting the captured OID so cleanup never drops a replacement after a lock wait.
    query "BEGIN ISOLATION LEVEL READ COMMITTED; LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE;
    DO \$cleanup\$ DECLARE found_policy pg_policy; BEGIN
      SELECT * INTO found_policy FROM pg_policy
        WHERE polrelid = 'auth.sessions'::regclass AND polname = '$injected_name';
      IF FOUND THEN
        IF found_policy.oid IS DISTINCT FROM $injected_oid::oid
          OR found_policy.polcmd IS DISTINCT FROM 'r' OR found_policy.polpermissive IS DISTINCT FROM TRUE
          OR found_policy.polroles IS DISTINCT FROM ARRAY['elevateo_session_owner'::regrole::oid]
          OR pg_get_expr(found_policy.polqual, found_policy.polrelid) IS DISTINCT FROM 'false'
          OR found_policy.polwithcheck IS NOT NULL THEN
          RAISE EXCEPTION 'injected policy changed; refuse cleanup';
        END IF;
        DROP POLICY $injected_name ON auth.sessions;
      END IF;
    END \$cleanup\$; COMMIT;" >/dev/null || return 1
  fi
  observed=$(query "SELECT count(*) FROM pg_policy WHERE polrelid = 'auth.sessions'::regclass
    AND polname = '$injected_name';") || return 1
  [[ "$observed" = 0 ]]
}

preflight_catalog() {
  local observed
  observed=$(query "SELECT current_database() = 'postgres' AND session_user = 'supabase_admin'
    AND current_user = 'supabase_admin' AND current_setting('server_version_num') = '170006'
    AND current_setting('transaction_isolation') = 'read committed'
    AND current_setting('track_activities') = 'on' AND NOT pg_is_in_recovery()
    AND to_regclass('public.schema_migrations') IS NULL AND to_regclass('app_auth.sessions') IS NULL
    AND to_regclass('auth.schema_migrations') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_class WHERE oid = 'auth.sessions'::regclass AND relkind = 'r'
      AND relrowsecurity AND relowner = 'supabase_auth_admin'::regrole)
    AND (SELECT count(*) FROM pg_policy WHERE polrelid = 'auth.sessions'::regclass
      AND polname = 'elevateo_private_session_select' AND polcmd = 'r' AND polpermissive
      AND polroles = ARRAY['elevateo_session_owner'::regrole::oid]
      AND pg_get_expr(polqual, polrelid) = 'true' AND polwithcheck IS NULL) = 1
    AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = '$injected_name');") \
    || fail 'pinned Auth catalog preflight query failed'
  [[ "$observed" = t ]] \
    || fail 'expected pinned Auth database after grants and before Rails migrations is absent'
}
