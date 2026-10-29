-- AIDEV-NOTE: Membership security-definers call this owner-only seam; callers cannot forge the private xid marker.
CREATE FUNCTION app_auth.assert_protected_write(p_digest text, p_target uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; status text;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest;
  IF s.cookie_digest IS NULL OR s.write_transaction IS DISTINCT FROM pg_current_xact_id_if_assigned()
    OR s.write_transaction IS NULL OR p_target IS NULL
    OR NOT (s.user_id = ANY(s.write_guard_users)) OR NOT (p_target = ANY(s.write_guard_users))
    OR NULLIF(current_setting('app.user_id', true), '') IS DISTINCT FROM s.user_id::text
    OR NULLIF(current_setting('app.org_id', true), '') IS DISTINCT FROM s.organization_id::text THEN
    RAISE EXCEPTION 'protected write guard required' USING ERRCODE = '42501';
  END IF;
  status := app_auth.session_status(s, s.user_id, s.auth_session_id, false, true, clock_timestamp());
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  RETURN app_auth.session_metadata(s);
END $$;
