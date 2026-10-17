-- AIDEV-NOTE: Local denial and its remote-revocation intent share a commit; HTTP only runs after worker claims commit.
CREATE FUNCTION app_auth.revoke_session(p_digest text, p_scope text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor uuid; s app_auth.sessions; status text; captured text[];
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_scope IS NULL OR p_scope NOT IN ('local', 'global') THEN
    RAISE EXCEPTION 'invalid scope' USING ERRCODE = '22023';
  END IF;
  SELECT user_id INTO actor FROM app_auth.sessions WHERE cookie_digest = p_digest;
  IF actor IS NULL THEN
    RETURN jsonb_build_object('status', CASE WHEN p_scope = 'global' THEN 'unauthorized' ELSE 'ok' END,
      'upstream_revocation_pending', false);
  END IF;
  -- AIDEV-NOTE: Freeze the committed-session cut and its sorted guards; a later login belongs to the next cut.
  SELECT array_agg(locked.cookie_digest ORDER BY locked.cookie_digest) INTO captured FROM (
    SELECT cookie_digest FROM app_auth.sessions WHERE user_id = actor
      AND (p_scope = 'global' OR cookie_digest = p_digest) ORDER BY cookie_digest FOR UPDATE
  ) locked;
  IF p_scope = 'global' THEN
    SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest;
    status := app_auth.session_status(s, s.user_id, s.auth_session_id, true, false, clock_timestamp());
    IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  END IF;
  FOR s IN SELECT * FROM app_auth.sessions WHERE cookie_digest = ANY(captured) ORDER BY cookie_digest LOOP
    UPDATE app_auth.sessions SET state = 'revoked', revoked_at = COALESCE(revoked_at, clock_timestamp()),
      revocation_scope = CASE WHEN revocation_scope = 'global' THEN 'global' ELSE p_scope END
      WHERE cookie_digest = s.cookie_digest RETURNING * INTO s;
    PERFORM app_auth.queue_revocation(s, s.access_token_ciphertext, s.refresh_generation, s.revocation_scope);
  END LOOP;
  RETURN '{"status":"ok","upstream_revocation_pending":true}'::jsonb;
END $$;

CREATE FUNCTION app_auth.claim_revocations(p_claim uuid, p_limit integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; jobs jsonb;
BEGIN
  IF p_claim IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'claim and limit 1..20 required' USING ERRCODE = '22023';
  END IF;
  WITH expired AS (
    SELECT kind, digest FROM app_auth.rate_limits WHERE window_start <= clock_timestamp() - interval '15 minutes'
      ORDER BY window_start, kind, digest LIMIT 100 FOR UPDATE SKIP LOCKED
  ) DELETE FROM app_auth.rate_limits r USING expired e WHERE r.kind = e.kind AND r.digest = e.digest;
  -- Recover crashed refresh owners without ever consuming the old refresh token a second time.
  FOR s IN SELECT * FROM app_auth.sessions WHERE state = 'refreshing'
    AND refresh_claim_deadline <= clock_timestamp() ORDER BY cookie_digest LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
    UPDATE app_auth.sessions SET state = 'refresh_uncertain', revoked_at = clock_timestamp(), revocation_scope = 'local'
      WHERE cookie_digest = s.cookie_digest RETURNING * INTO s;
    PERFORM app_auth.queue_revocation(s, s.access_token_ciphertext, s.refresh_generation, 'local');
  END LOOP;
  -- AIDEV-NOTE: The eighth expired lease is terminal; attempts count claims, including crashed workers.
  WITH exhausted AS (
    SELECT id FROM app_auth.revocation_intents WHERE state = 'claimed' AND attempts = 8
      AND claim_deadline <= clock_timestamp() ORDER BY id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE app_auth.revocation_intents SET state = 'failed', claim_id = NULL, claim_deadline = NULL
    WHERE id IN (SELECT id FROM exhausted);
  WITH ready AS (
    SELECT id FROM app_auth.revocation_intents WHERE attempts < 8
      AND ((state = 'pending' AND next_attempt_at <= clock_timestamp())
        OR (state = 'claimed' AND claim_deadline <= clock_timestamp()))
      ORDER BY next_attempt_at, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE app_auth.revocation_intents i SET state = 'claimed', claim_id = p_claim,
      claim_deadline = clock_timestamp() + interval '30 seconds', attempts = attempts + 1
      WHERE i.id IN (SELECT id FROM ready) RETURNING i.*
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'claim_id', claim_id, 'scope', scope,
      'access_token_ciphertext', access_token_ciphertext, 'attempts', attempts) ORDER BY id), '[]'::jsonb)
    INTO jobs FROM claimed;
  RETURN jsonb_build_object('status', 'ok', 'intents', jobs);
END $$;

CREATE FUNCTION app_auth.finish_revocation(p_id bigint, p_claim uuid, p_succeeded boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE intent app_auth.revocation_intents;
BEGIN
  IF p_id IS NULL OR p_id < 1 OR p_claim IS NULL OR p_succeeded IS NULL THEN
    RAISE EXCEPTION 'id, claim and result required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO intent FROM app_auth.revocation_intents WHERE id = p_id FOR UPDATE;
  -- AIDEV-NOTE: Replacement ciphertext clears the old claim; a stale acknowledgement must not complete its successor.
  IF intent.id IS NULL OR intent.state <> 'claimed' OR intent.claim_id IS DISTINCT FROM p_claim
    OR intent.claim_deadline <= clock_timestamp() THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
  UPDATE app_auth.revocation_intents SET state = CASE WHEN p_succeeded THEN 'completed'
    WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END, claim_id = NULL, claim_deadline = NULL,
    next_attempt_at = clock_timestamp() + LEAST(300, (2 ^ attempts)::integer) * interval '1 second'
    WHERE id = p_id RETURNING * INTO intent;
  RETURN jsonb_build_object('status', 'ok', 'state', intent.state);
END $$;
