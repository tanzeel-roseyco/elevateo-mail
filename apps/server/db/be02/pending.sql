-- AIDEV-NOTE: GET only stages; the committed verify claim prevents replay after ambiguous Auth consumption.
CREATE FUNCTION app_auth.stage_entry(p_digest text, p_kind text, p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE expiry timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_kind IS NULL OR p_kind NOT IN ('invite', 'recovery') OR p_token IS NULL
    OR octet_length(p_token) NOT BETWEEN 1 AND 16384 THEN
    RAISE EXCEPTION 'invalid staged entry' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app_auth.pending_entries(digest, kind, token_ciphertext) VALUES (p_digest, p_kind, p_token)
    RETURNING expires_at INTO expiry;
  RETURN jsonb_build_object('status', 'ok', 'expires_at', expiry);
END $$;

CREATE FUNCTION app_auth.claim_entry(p_digest text, p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e app_auth.pending_entries;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_claim IS NULL THEN RAISE EXCEPTION 'claim required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM app_auth.pending_entries WHERE digest = p_digest FOR UPDATE;
  IF e.digest IS NULL OR e.expires_at <= clock_timestamp() OR e.state IN ('completed', 'uncertain') THEN
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  IF e.claim_id IS NOT NULL THEN
    IF e.claim_deadline > clock_timestamp() THEN RETURN '{"status":"temporarily_unavailable"}'::jsonb; END IF;
    UPDATE app_auth.pending_entries SET state = 'uncertain' WHERE digest = p_digest;
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  UPDATE app_auth.pending_entries SET claim_id = p_claim,
    claim_deadline = LEAST(expires_at, clock_timestamp() + interval '10 seconds'),
    state = CASE WHEN state = 'staged' THEN 'verifying' ELSE state END
    WHERE digest = p_digest RETURNING * INTO e;
  IF e.state = 'verifying' THEN
    RETURN jsonb_build_object('status', 'ok', 'step', 'verify', 'kind', e.kind, 'token_ciphertext', e.token_ciphertext);
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'step', 'password', 'user_id', e.user_id,
    'auth_session_id', e.auth_session_id, 'access_token_ciphertext', e.access_token_ciphertext,
    'refresh_token_ciphertext', e.refresh_token_ciphertext, 'access_expires_at', e.access_expires_at);
END $$;

CREATE FUNCTION app_auth.verify_entry(p_digest text, p_claim uuid, p_user uuid, p_auth_session uuid,
  p_access text, p_refresh text, p_access_expires timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e app_auth.pending_entries; deadline timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  PERFORM app_auth.check_credentials(p_access, p_refresh, p_access_expires);
  IF p_claim IS NULL OR p_user IS NULL OR p_auth_session IS NULL THEN
    RAISE EXCEPTION 'verified identity and claim required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM app_auth.pending_entries WHERE digest = p_digest FOR UPDATE;
  IF e.digest IS NULL OR e.state <> 'verifying' OR e.claim_id IS DISTINCT FROM p_claim
    OR e.claim_deadline <= clock_timestamp() OR e.expires_at <= clock_timestamp() THEN
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  deadline := app_auth.auth_deadline(p_user, p_auth_session);
  IF deadline IS NULL OR deadline <= clock_timestamp() THEN
    UPDATE app_auth.pending_entries SET state = 'uncertain' WHERE digest = p_digest;
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  UPDATE app_auth.pending_entries SET state = 'password_pending', user_id = p_user,
    auth_session_id = p_auth_session, access_token_ciphertext = p_access,
    refresh_token_ciphertext = p_refresh, access_expires_at = p_access_expires WHERE digest = p_digest;
  RETURN '{"status":"ok"}'::jsonb;
END $$;

CREATE FUNCTION app_auth.fail_entry(p_digest text, p_claim uuid, p_retry_password boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e app_auth.pending_entries;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_claim IS NULL OR p_retry_password IS NULL THEN
    RAISE EXCEPTION 'claim and failure type required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM app_auth.pending_entries WHERE digest = p_digest FOR UPDATE;
  IF e.digest IS NULL OR e.state NOT IN ('verifying', 'password_pending')
    OR e.claim_id IS DISTINCT FROM p_claim OR e.claim_deadline <= clock_timestamp()
    OR e.expires_at <= clock_timestamp() THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  IF p_retry_password AND e.state = 'password_pending' THEN
    UPDATE app_auth.pending_entries SET claim_id = NULL, claim_deadline = NULL WHERE digest = p_digest;
  ELSE
    UPDATE app_auth.pending_entries SET state = 'uncertain' WHERE digest = p_digest;
  END IF;
  RETURN '{"status":"ok"}'::jsonb;
END $$;

CREATE FUNCTION app_auth.complete_entry(p_digest text, p_claim uuid, p_cookie_digest text,
  p_context uuid, p_csrf text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e app_auth.pending_entries; result jsonb;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  PERFORM app_auth.check_digest(p_cookie_digest);
  IF p_claim IS NULL THEN RAISE EXCEPTION 'claim required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM app_auth.pending_entries WHERE digest = p_digest FOR UPDATE;
  IF e.digest IS NULL OR e.state <> 'password_pending' OR e.claim_id IS DISTINCT FROM p_claim
    OR e.claim_deadline <= clock_timestamp() OR e.expires_at <= clock_timestamp() THEN
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  result := app_auth.create_session(p_cookie_digest, e.user_id, e.auth_session_id,
    e.access_token_ciphertext, e.refresh_token_ciphertext, e.access_expires_at, p_context, p_csrf);
  -- AIDEV-NOTE: Session creation can wait on generation guards; a late result is disposed without publishing a cookie.
  IF result ->> 'session_created' = 'true'
    AND (e.claim_deadline <= clock_timestamp() OR e.expires_at <= clock_timestamp()) THEN
    PERFORM app_auth.revoke_session(p_cookie_digest, 'local');
    UPDATE app_auth.pending_entries SET state = 'uncertain', access_token_ciphertext = NULL,
      refresh_token_ciphertext = NULL WHERE digest = p_digest;
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  IF result ->> 'session_created' = 'true' THEN
    UPDATE app_auth.pending_entries SET state = 'completed', access_token_ciphertext = NULL,
      refresh_token_ciphertext = NULL WHERE digest = p_digest;
  END IF;
  RETURN result;
END $$;
