-- AIDEV-NOTE: Guard metadata is narrow; send owner never receives private session-table SELECT or Auth credentials.
SET LOCAL ROLE elevateo_session_owner;
CREATE FUNCTION app_auth.send_approval_guard(p_digest text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  result := app_auth.assert_protected_write(p_digest,NULLIF(current_setting('app.user_id',true),'')::uuid);
  IF result->>'status' = 'ok' AND EXISTS (SELECT 1 FROM app_auth.sessions
      WHERE cookie_digest = p_digest AND access_expires_at <= clock_timestamp()) THEN
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  RETURN result - 'csrf_token' - 'organization_name' - 'refresh_generation' - 'absolute_expires_at' - 'idle_expires_at';
END $$;
REVOKE ALL ON FUNCTION app_auth.send_approval_guard(text) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_auth.send_approval_guard(text) TO elevateo_send_owner;
GRANT USAGE ON SCHEMA app_auth TO elevateo_send_owner;
SET LOCAL ROLE elevateo_owner;
