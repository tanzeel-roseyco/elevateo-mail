# AIDEV-NOTE: Sourced by run.sh; each injected role/edge rolls back, including when the guard wrongly accepts it.
membership_error='unexpected application membership graph; no changes accepted'
for runtime_role in elevateo_api elevateo_worker; do
  for privileged_role in elevateo_owner elevateo_session_owner elevateo_migrator; do
    run_case "$runtime_role-direct-$privileged_role" "$bootstrap_body" \
      "GRANT $privileged_role TO $runtime_role WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;" \
      "$membership_error" ''
  done
  run_case "$runtime_role-transitive-owner" "$bootstrap_body" \
    "CREATE ROLE be02_guard_bridge NOLOGIN NOINHERIT;
     GRANT elevateo_owner TO be02_guard_bridge WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
     GRANT be02_guard_bridge TO $runtime_role WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;" \
    "$membership_error" ''
  run_case "$runtime_role-inherited-owner" "$bootstrap_body" \
    "GRANT elevateo_owner TO $runtime_role WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;" \
    "$membership_error" ''
done
run_case private-owner-parent "$bootstrap_body" \
  'CREATE ROLE be02_guard_bridge NOLOGIN NOINHERIT;
   GRANT be02_guard_bridge TO elevateo_session_owner WITH ADMIN FALSE, INHERIT FALSE, SET FALSE;' \
  "$membership_error" ''
run_case runtime-role-outgoing-edge "$bootstrap_body" \
  'CREATE ROLE be02_guard_bridge NOLOGIN NOINHERIT;
   GRANT elevateo_api TO be02_guard_bridge WITH ADMIN FALSE, INHERIT FALSE, SET FALSE;' \
  "$membership_error" ''
run_case owner-issued-api-set-option "$bootstrap_body" \
  'SET LOCAL ROLE elevateo_owner;
   GRANT elevateo_app_read TO elevateo_api WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
   RESET ROLE;' "$membership_error" ''
run_case migrator-inherit-option "$bootstrap_body" \
  'GRANT elevateo_owner TO elevateo_migrator WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;' \
  "$membership_error" ''
run_case runtime-superuser-drift "$bootstrap_body" \
  'ALTER ROLE elevateo_api SUPERUSER;' 'unexpected application role attributes' ''

legacy_assertion=$(cat <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_api'::regrole AND grantor = 'supabase_admin'::regrole)
    OR NOT EXISTS (SELECT FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
      AND member = 'elevateo_api'::regrole AND grantor = 'elevateo_owner'::regrole
      AND inherit_option AND NOT set_option AND NOT admin_option)
    OR NOT pg_has_role('elevateo_api', 'elevateo_app_read', 'USAGE')
  THEN RAISE EXCEPTION 'accepted legacy transition lost the owner-issued read grant'; END IF;
END $$;
SQL
)
run_case measured-legacy-and-current-membership "$bootstrap_body" \
  'GRANT elevateo_app_read TO elevateo_api WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
   SET LOCAL ROLE elevateo_owner;
   GRANT elevateo_app_read TO elevateo_api WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
   RESET ROLE;' '' "$legacy_assertion"
run_case approved-migrator-owner-path "$bootstrap_body" '' '' \
  'SET SESSION AUTHORIZATION elevateo_migrator;
   SET ROLE elevateo_owner;
   SET ROLE elevateo_session_owner;
   RESET SESSION AUTHORIZATION;'

runtime_assertion=$(cat <<'SQL'
DO $$ DECLARE forbidden text; BEGIN
  FOREACH forbidden IN ARRAY ARRAY['elevateo_owner', 'elevateo_session_owner', 'elevateo_migrator'] LOOP
    BEGIN
      EXECUTE format('SET ROLE %I', forbidden);
      RAISE EXCEPTION 'runtime assumed forbidden role %', forbidden;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SQL
)
for runtime_role in elevateo_api elevateo_worker; do
  run_case "$runtime_role-effective-set-denial" "$bootstrap_body" '' '' \
    "SET SESSION AUTHORIZATION $runtime_role; $runtime_assertion"
done

unrelated_assertion=$(cat <<'SQL'
DO $$ BEGIN
  IF NOT pg_has_role('be02_guard_bridge', 'be02_guard_unrelated', 'MEMBER') THEN
    RAISE EXCEPTION 'unrelated membership was silently removed';
  END IF;
END $$;
SQL
)
run_case unrelated-membership-preserved "$bootstrap_body" \
  'CREATE ROLE be02_guard_bridge NOLOGIN NOINHERIT;
   CREATE ROLE be02_guard_unrelated NOLOGIN NOINHERIT;
   GRANT be02_guard_unrelated TO be02_guard_bridge;' '' "$unrelated_assertion"

# AIDEV-NOTE: Parameter ACLs authorize function definitions, not ordinary placeholder SET; reject excess grants.
parameter_error='unexpected private identity parameter ACL; no changes accepted'
for grantee in PUBLIC elevateo_api elevateo_worker elevateo_app_read elevateo_owner elevateo_migrator; do
  for privilege in SET 'ALTER SYSTEM'; do
    run_case "private-parameter-$grantee-$privilege" "$bootstrap_body" \
      "GRANT $privilege ON PARAMETER app_auth.verified_user_id TO $grantee;" "$parameter_error" ''
  done
done
run_case private-parameter-owner-grant-option "$bootstrap_body" \
  'GRANT SET ON PARAMETER app_auth.verified_user_id TO elevateo_session_owner WITH GRANT OPTION;' \
  "$parameter_error" ''
run_case private-parameter-owner-alter-system "$bootstrap_body" \
  'GRANT ALTER SYSTEM ON PARAMETER app_auth.verified_user_id TO elevateo_session_owner;' \
  "$parameter_error" ''
run_case private-parameter-unrelated-grantee "$bootstrap_body" \
  'CREATE ROLE be02_guard_bridge NOLOGIN NOINHERIT;
   GRANT SET ON PARAMETER app_auth.verified_user_id TO be02_guard_bridge;' "$parameter_error" ''
parameter_assertion=$(cat <<'SQL'
DO $$ BEGIN
  IF NOT has_parameter_privilege('elevateo_session_owner', 'app_auth.verified_user_id', 'SET')
    OR has_parameter_privilege('elevateo_session_owner', 'app_auth.verified_user_id',
      'SET WITH GRANT OPTION, ALTER SYSTEM')
    OR has_parameter_privilege('elevateo_api', 'app_auth.verified_user_id', 'SET, ALTER SYSTEM')
  THEN RAISE EXCEPTION 'private parameter owner privilege was not restored narrowly'; END IF;
END $$;
SQL
)
run_case private-parameter-missing-owner-grant "$bootstrap_body" \
  'REVOKE SET ON PARAMETER app_auth.verified_user_id FROM elevateo_session_owner;' '' "$parameter_assertion"
