# AIDEV-NOTE: DML, column and PUBLIC grants must fail closed; the grant phase must not erase the evidence.
auth_error='Auth privilege drift'
# AIDEV-NOTE: Real catalogs include TOAST and indexes; sequence checks must tolerate unrelated relation kinds.
run_case auth-mixed-relation-catalog "$auth_body" \
  'CREATE TABLE public.guard_toasted (payload text); CREATE INDEX ON public.guard_toasted (payload);' '' ''
for privilege in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER MAINTAIN; do
  run_case "auth-private-table-$privilege" "$auth_body" \
    "GRANT $privilege ON auth.sessions TO elevateo_session_owner;" "$auth_error" ''
done
for privilege in INSERT UPDATE REFERENCES; do
  run_case "auth-private-column-$privilege" "$auth_body" \
    "GRANT $privilege (not_after) ON auth.sessions TO elevateo_session_owner;" "$auth_error" ''
done
for runtime_role in elevateo_api elevateo_worker elevateo_app_read elevateo_owner elevateo_migrator; do
  run_case "auth-$runtime_role-table-read" "$auth_body" \
    "GRANT SELECT ON auth.sessions TO $runtime_role;" "$auth_error" ''
  run_case "auth-$runtime_role-column-write" "$auth_body" \
    "GRANT UPDATE (not_after) ON auth.sessions TO $runtime_role;" "$auth_error" ''
done
run_case auth-extra-column "$auth_body" \
  'GRANT SELECT (private_token) ON auth.sessions TO elevateo_session_owner;' "$auth_error" ''
run_case auth-column-delegation "$auth_body" \
  'GRANT SELECT (id) ON auth.sessions TO elevateo_session_owner WITH GRANT OPTION;' "$auth_error" ''
run_case auth-public-dml "$auth_body" 'GRANT DELETE ON auth.sessions TO PUBLIC;' "$auth_error" ''
run_case auth-other-table "$auth_body" \
  'GRANT SELECT (id) ON auth.guard_other TO elevateo_session_owner;' "$auth_error" ''
run_case auth-schema-create "$auth_body" 'GRANT CREATE ON SCHEMA auth TO elevateo_session_owner;' "$auth_error" ''
run_case auth-schema-delegation "$auth_body" \
  'GRANT USAGE ON SCHEMA auth TO elevateo_session_owner WITH GRANT OPTION;' "$auth_error" ''
run_case auth-sequence-drift "$auth_body" \
  'GRANT USAGE ON SEQUENCE auth.guard_sequence TO elevateo_session_owner;' "$auth_error" ''
run_case auth-disabled-rls "$auth_body" 'ALTER TABLE auth.sessions DISABLE ROW LEVEL SECURITY;' \
  'Auth sessions RLS is disabled; pinned profile drift' ''
run_case auth-column-type "$auth_body" \
  'ALTER TABLE auth.sessions ALTER COLUMN not_after TYPE text USING not_after::text;' \
  'unsupported Auth session policy column types' ''

auth_assertion="\i '$test_dir/auth-rls-visibility.sql'"
run_case auth-exact-four-column-read "$auth_body" \
  'REVOKE SELECT (id, user_id, created_at, not_after) ON auth.sessions FROM elevateo_session_owner;' \
  '' "$auth_assertion"
run_case auth-missing-policy "$auth_body" \
  'DROP POLICY elevateo_private_session_select ON auth.sessions;' '' "$auth_assertion"
for force_setting in FORCE 'NO FORCE'; do
  run_case "auth-${force_setting// /-}-rls" "$auth_body" \
    "ALTER TABLE auth.sessions $force_setting ROW LEVEL SECURITY;" '' "$auth_assertion"
done
for runtime_role in elevateo_api elevateo_worker; do
  run_case "auth-$runtime_role-direct-column-denials" "$auth_body" '' '' \
    "SET SESSION AUTHORIZATION $runtime_role;
\i '$test_dir/auth-rls-runtime-denial.sql'
RESET SESSION AUTHORIZATION;"
done

# AIDEV-NOTE: Every hostile policy fixture is legal DDL; failure must come from the exact bootstrap guard.
policy_name=elevateo_private_session_select
policy_error='Auth session policy drift: elevateo_private_session_select'
for definition in \
  'AS RESTRICTIVE FOR SELECT TO elevateo_session_owner USING (true)' \
  'FOR SELECT TO PUBLIC USING (true)' \
  'FOR SELECT TO elevateo_api USING (true)' \
  'FOR SELECT TO elevateo_session_owner, elevateo_api USING (true)' \
  'FOR SELECT TO elevateo_session_owner USING (false)' \
  'FOR SELECT TO elevateo_session_owner' \
  "FOR SELECT TO elevateo_session_owner USING (user_id::text = current_setting('app_auth.verified_user_id', true))" \
  'FOR ALL TO elevateo_session_owner USING (true) WITH CHECK (true)' \
  'FOR UPDATE TO elevateo_session_owner USING (true) WITH CHECK (true)'; do
  run_case "auth-own-policy-$definition" "$auth_body" \
    "DROP POLICY $policy_name ON auth.sessions; CREATE POLICY $policy_name ON auth.sessions $definition;" \
    "$policy_error" ''
done
for target_role in PUBLIC elevateo_session_owner; do
  for command in SELECT ALL; do
    for mode in PERMISSIVE RESTRICTIVE; do
      run_case "auth-extra-$target_role-$command-$mode-policy" "$auth_body" \
        "CREATE POLICY guard_extra ON auth.sessions AS $mode FOR $command TO $target_role USING (false);" \
        'Auth additional session policy drift: guard_extra' ''
    done
  done
done
run_case auth-private-dml-policy "$auth_body" \
  'CREATE POLICY guard_private_dml ON auth.sessions FOR INSERT TO elevateo_session_owner WITH CHECK (true);' \
  'Auth additional session policy drift: guard_private_dml' ''

for role_flag in LOGIN INHERIT SUPERUSER BYPASSRLS CREATEDB CREATEROLE REPLICATION; do
  run_case "auth-private-$role_flag" "$auth_body" "ALTER ROLE elevateo_session_owner $role_flag;" \
    'pinned Auth sessions/private owner prerequisites missing' ''
done
run_case auth-private-table-owner "$auth_body" 'ALTER TABLE auth.sessions OWNER TO elevateo_session_owner;' \
  'Auth private owner attributes or table ownership drift' ''
for inheritance in TRUE FALSE; do
  run_case "auth-parent-policy-inherit-$inheritance" "$auth_body" \
    "CREATE ROLE auth_rls_guard_parent NOLOGIN;
GRANT auth_rls_guard_parent TO elevateo_session_owner WITH INHERIT $inheritance, SET FALSE;
CREATE POLICY guard_inherited ON auth.sessions FOR SELECT TO auth_rls_guard_parent USING (false);" \
    'Auth private owner membership drift' ''
done
for runtime_role in elevateo_api elevateo_worker; do
  for target_role in elevateo_session_owner elevateo_owner; do
    run_case "auth-$runtime_role-reaches-$target_role" "$auth_body" \
      "GRANT $target_role TO $runtime_role WITH INHERIT FALSE, SET TRUE;" 'Auth private owner membership drift' ''
  done
done

# AIDEV-NOTE: Snapshot catalog values, not live Auth data; exact tuples/OIDs prove preservation on repeat.
auth_catalog_fixture=$(cat <<'SQL'
CREATE POLICY guard_vendor_read ON auth.sessions FOR SELECT TO supabase_admin USING (false);
CREATE POLICY guard_public_insert ON auth.sessions FOR INSERT TO PUBLIC WITH CHECK (false);
CREATE POLICY elevateo_private_session_select ON auth.guard_other FOR SELECT TO elevateo_session_owner USING (true);
CREATE TEMP VIEW auth_rls_catalog AS SELECT jsonb_build_object(
  'relations', (SELECT jsonb_agg(jsonb_build_array(oid, relowner, relacl, relrowsecurity, relforcerowsecurity)
    ORDER BY oid) FROM pg_class WHERE relnamespace = 'auth'::regnamespace),
  'schema', (SELECT to_jsonb(n) FROM pg_namespace n WHERE oid = 'auth'::regnamespace),
  'columns', (SELECT jsonb_agg(jsonb_build_array(attrelid, attnum, attacl) ORDER BY attrelid, attnum)
    FROM pg_attribute WHERE attrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'auth'::regnamespace)),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p
    WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'auth'::regnamespace)),
  'defaults', (SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d)) AS state;
CREATE TEMP TABLE auth_rls_before AS SELECT state FROM auth_rls_catalog;
SQL
)
auth_catalog_assertion=$(cat <<'SQL'
DO $$ BEGIN
  IF (SELECT state FROM pg_temp.auth_rls_catalog) IS DISTINCT FROM (SELECT state FROM pg_temp.auth_rls_before) THEN
    RAISE EXCEPTION 'Auth rerun changed policy OIDs, vendor catalogs, ownership, RLS flags or ACLs';
  END IF;
END $$;
SQL
)
run_case auth-repeat-preserves-exact-catalog "$auth_body" "$auth_catalog_fixture" '' \
  "\i '$auth_body'
$auth_catalog_assertion
$auth_assertion"
run_case auth-other-table-name-does-not-satisfy-policy "$auth_body" \
  "DROP POLICY $policy_name ON auth.sessions;
CREATE POLICY $policy_name ON auth.guard_other FOR SELECT TO elevateo_session_owner USING (true);" \
  '' "$auth_assertion"

# AIDEV-NOTE: Compare committed catalogs across connections after a deliberate post-grant error rolls back.
auth_rollback_query=$(cat <<'SQL'
SELECT jsonb_build_object(
  'policy', (SELECT to_jsonb(p) FROM pg_policy p WHERE polrelid = 'auth.sessions'::regclass
    AND polname = 'elevateo_private_session_select'),
  'schema', (SELECT to_jsonb(n) FROM pg_namespace n WHERE oid = 'auth'::regnamespace),
  'table', (SELECT jsonb_build_array(relowner, relacl, relrowsecurity, relforcerowsecurity)
    FROM pg_class WHERE oid = 'auth.sessions'::regclass),
  'columns', (SELECT jsonb_agg(jsonb_build_array(attnum, attacl) ORDER BY attnum)
    FROM pg_attribute WHERE attrelid = 'auth.sessions'::regclass));
SQL
)
auth_before_failure=$(psql_cmd --tuples-only --no-align --command "$auth_rollback_query")
run_case auth-post-grant-failure "$auth_body" \
  "DROP POLICY $policy_name ON auth.sessions;
REVOKE SELECT (id, user_id, created_at, not_after) ON auth.sessions FROM elevateo_session_owner;
REVOKE USAGE ON SCHEMA auth FROM elevateo_session_owner;" 'intentional Auth post-grant rollback' \
  "$auth_assertion
DO \$\$ BEGIN RAISE EXCEPTION 'intentional Auth post-grant rollback'; END \$\$;"
auth_after_failure=$(psql_cmd --tuples-only --no-align --command "$auth_rollback_query")
if [[ -z "$auth_before_failure" || "$auth_before_failure" != "$auth_after_failure" ]]; then
  printf '%s\n' 'FAILED auth-post-grant-failure: policy or ACL mutation survived rollback' >&2
  exit 1
fi
run_file auth-rls-real-session-semantics "$test_dir/auth-rls-sessions.sql"
