-- AIDEV-NOTE: The claim commits before Auth HTTP; an expired claim is uncertain and must never be stolen.
CREATE FUNCTION app_auth.claim_refresh(p_digest text, p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; status text;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_claim IS NULL THEN RAISE EXCEPTION 'claim required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest FOR UPDATE;
  status := app_auth.session_status(s, s.user_id, s.auth_session_id, true, s.organization_id IS NOT NULL,
    clock_timestamp());
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  IF s.state = 'refreshing' THEN
    IF s.refresh_claim_deadline > clock_timestamp() THEN
      RETURN '{"status":"temporarily_unavailable"}'::jsonb;
    END IF;
    UPDATE app_auth.sessions SET state = 'refresh_uncertain', revoked_at = clock_timestamp(), revocation_scope = 'local'
      WHERE cookie_digest = p_digest RETURNING * INTO s;
    PERFORM app_auth.queue_revocation(s, s.access_token_ciphertext, s.refresh_generation, 'local');
    RETURN '{"status":"refresh_uncertain"}'::jsonb;
  END IF;
  UPDATE app_auth.sessions SET state = 'refreshing', refresh_claim_id = p_claim,
    refresh_claim_deadline = clock_timestamp() + interval '10 seconds', refresh_generation = refresh_generation + 1
    WHERE cookie_digest = p_digest RETURNING * INTO s;
  RETURN app_auth.session_metadata(s) || jsonb_build_object('claim_id', p_claim,
    'refresh_token_ciphertext', s.refresh_token_ciphertext);
END $$;

CREATE FUNCTION app_auth.publish_refresh(p_digest text, p_claim uuid, p_generation bigint,
  p_user uuid, p_auth_session uuid, p_access text, p_refresh text, p_access_expires timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog SET app_auth.verified_user_id = '' AS $$
DECLARE s app_auth.sessions; status text; selected_org uuid; checked_at timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  PERFORM app_auth.check_credentials(p_access, p_refresh, p_access_expires);
  IF p_claim IS NULL OR p_generation IS NULL OR p_generation < 1 THEN
    RAISE EXCEPTION 'claim and generation required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest FOR UPDATE;
  IF s.cookie_digest IS NULL OR p_user IS NULL OR p_auth_session IS NULL
    OR s.user_id <> p_user OR s.auth_session_id <> p_auth_session THEN
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  IF s.refresh_claim_id IS DISTINCT FROM p_claim OR s.refresh_generation <> p_generation THEN
    -- AIDEV-NOTE: The caller never retries publication; disposing same-identity credentials must also deny local use.
    UPDATE app_auth.sessions SET state = CASE WHEN state = 'revoked' THEN 'revoked' ELSE 'refresh_uncertain' END,
      revoked_at = COALESCE(revoked_at, clock_timestamp()), revocation_scope = COALESCE(revocation_scope, 'local')
      WHERE cookie_digest = p_digest RETURNING * INTO s;
    PERFORM app_auth.queue_revocation(s, p_access, p_generation, s.revocation_scope);
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  status := app_auth.session_status(s, p_user, p_auth_session, true, s.organization_id IS NOT NULL,
    clock_timestamp());
  selected_org := s.organization_id;
  IF selected_org IS NULL AND status = 'ok' AND s.state = 'refreshing'
    AND s.refresh_claim_deadline > clock_timestamp() THEN
    PERFORM set_config('app_auth.verified_user_id', s.user_id::text, true);
    SELECT m.organization_id INTO selected_org FROM app.organization_memberships m
      WHERE m.user_id = s.user_id ORDER BY m.organization_id LIMIT 1;
    IF selected_org IS NOT NULL THEN
      INSERT INTO app_auth.authorization_generations(organization_id, user_id)
        VALUES (selected_org, s.user_id) ON CONFLICT DO NOTHING;
      PERFORM app_auth.lock_authorization_generations(selected_org, s.user_id);
      IF NOT app_auth.has_membership(s.user_id, selected_org) THEN selected_org := NULL; END IF;
    END IF;
  END IF;
  -- AIDEV-NOTE: Generation guards can wait; recheck the live claim and policy at the final publication boundary.
  checked_at := clock_timestamp();
  status := app_auth.session_status(s, p_user, p_auth_session, true, s.organization_id IS NOT NULL, checked_at);
  IF status <> 'ok' OR s.state <> 'refreshing' OR s.refresh_claim_deadline <= checked_at
    OR p_access_expires <= checked_at THEN
    UPDATE app_auth.sessions SET state = CASE WHEN state = 'revoked' THEN 'revoked' ELSE 'refresh_uncertain' END,
      revoked_at = COALESCE(revoked_at, checked_at), revocation_scope = COALESCE(revocation_scope, 'local')
      WHERE cookie_digest = p_digest RETURNING * INTO s;
    PERFORM app_auth.queue_revocation(s, p_access, p_generation, s.revocation_scope);
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  UPDATE app_auth.sessions SET state = 'active', organization_id = selected_org, access_token_ciphertext = p_access,
    refresh_token_ciphertext = p_refresh, access_expires_at = p_access_expires,
    refresh_claim_id = NULL, refresh_claim_deadline = NULL,
    idle_expires_at = LEAST(absolute_expires_at, checked_at + interval '30 minutes')
    WHERE cookie_digest = p_digest RETURNING * INTO s;
  RETURN app_auth.session_metadata(s) || jsonb_build_object('status',
    CASE WHEN selected_org IS NULL THEN 'not_found' ELSE 'ok' END);
END $$;

CREATE FUNCTION app_auth.fail_refresh(p_digest text, p_claim uuid, p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_claim IS NULL OR p_generation IS NULL OR p_generation < 1 THEN
    RAISE EXCEPTION 'claim and generation required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest FOR UPDATE;
  IF s.cookie_digest IS NULL OR s.state <> 'refreshing' OR s.refresh_claim_id IS DISTINCT FROM p_claim
    OR s.refresh_generation <> p_generation THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  UPDATE app_auth.sessions SET state = 'refresh_uncertain', revoked_at = clock_timestamp(), revocation_scope = 'local'
    WHERE cookie_digest = p_digest RETURNING * INTO s;
  PERFORM app_auth.queue_revocation(s, s.access_token_ciphertext, s.refresh_generation, 'local');
  RETURN '{"status":"refresh_uncertain"}'::jsonb;
END $$;
