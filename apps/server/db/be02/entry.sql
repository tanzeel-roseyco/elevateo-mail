-- AIDEV-NOTE: Identity arguments are attested by Rails/Auth; browser-selected principals must never reach this call.
CREATE FUNCTION app_auth.create_session(p_digest text, p_user uuid, p_auth_session uuid,
  p_access text, p_refresh text, p_access_expires timestamptz, p_context uuid, p_csrf text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog SET app_auth.verified_user_id = '' AS $$
DECLARE deadline timestamptz; selected_org uuid; result app_auth.sessions; checked_at timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  PERFORM app_auth.check_credentials(p_access, p_refresh, p_access_expires);
  IF p_user IS NULL OR p_auth_session IS NULL OR p_context IS NULL OR p_csrf IS NULL
    OR octet_length(p_csrf) NOT BETWEEN 32 AND 512 THEN
    RAISE EXCEPTION 'identity and context required' USING ERRCODE = '22023';
  END IF;
  deadline := app_auth.auth_deadline(p_user, p_auth_session);
  IF deadline IS NULL OR deadline <= statement_timestamp() THEN RETURN '{"status":"unauthorized"}'::jsonb; END IF;
  PERFORM set_config('app_auth.verified_user_id', p_user::text, true);
  SELECT m.organization_id INTO selected_org FROM app.organization_memberships m
    WHERE m.user_id = p_user ORDER BY m.organization_id LIMIT 1;
  INSERT INTO app_auth.sessions(cookie_digest, user_id, auth_session_id, organization_id, context_id, csrf_token,
    access_token_ciphertext, refresh_token_ciphertext, access_expires_at, absolute_expires_at, idle_expires_at)
    VALUES (p_digest, p_user, p_auth_session, selected_org, p_context, p_csrf, p_access, p_refresh,
      p_access_expires, deadline, LEAST(deadline, statement_timestamp() + interval '30 minutes'))
    RETURNING * INTO result;
  IF selected_org IS NOT NULL THEN
    INSERT INTO app_auth.authorization_generations(organization_id, user_id)
      VALUES (selected_org, p_user) ON CONFLICT DO NOTHING;
    PERFORM app_auth.lock_authorization_generations(selected_org, p_user);
    IF NOT app_auth.has_membership(p_user, selected_org) THEN
      selected_org := NULL;
      UPDATE app_auth.sessions SET organization_id = NULL WHERE cookie_digest = p_digest RETURNING * INTO result;
    END IF;
  END IF;
  -- AIDEV-NOTE: Publication follows all guards; credentials may expire while waiting for membership locks.
  checked_at := clock_timestamp();
  IF app_auth.session_status(result, p_user, p_auth_session, false, false, checked_at) <> 'ok'
    OR p_access_expires <= checked_at THEN
    PERFORM app_auth.revoke_session(p_digest, 'local');
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  RETURN app_auth.session_metadata(result) || jsonb_build_object('session_created', true,
    'status', CASE WHEN selected_org IS NULL THEN 'not_found' ELSE 'ok' END);
END $$;

CREATE FUNCTION app_auth.switch_organization(p_digest text, p_user uuid, p_auth_session uuid,
  p_organization uuid, p_context uuid, p_csrf text, p_expected_context uuid, p_expected_generation bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; status text; generation bigint; guard_org uuid; checked_at timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_organization IS NULL OR p_context IS NULL OR p_csrf IS NULL OR p_expected_context IS NULL
    OR p_expected_generation IS NULL OR p_expected_generation < 1
    OR octet_length(p_csrf) NOT BETWEEN 32 AND 512 THEN
    RAISE EXCEPTION 'organization and context required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest FOR UPDATE;
  checked_at := clock_timestamp();
  status := app_auth.session_status(s, p_user, p_auth_session, p_now => checked_at);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  -- AIDEV-NOTE: Fence the earlier Rails authorization under the write guards; row serialization alone is insufficient.
  FOR guard_org IN SELECT DISTINCT unnest(ARRAY[s.organization_id, p_organization]) ORDER BY 1 LOOP
    INSERT INTO app_auth.authorization_generations(organization_id, user_id)
      SELECT guard_org, s.user_id WHERE app_auth.has_membership(s.user_id, guard_org) ON CONFLICT DO NOTHING;
    PERFORM app_auth.lock_authorization_generations(guard_org, s.user_id);
  END LOOP;
  checked_at := clock_timestamp();
  status := app_auth.session_status(s, p_user, p_auth_session, p_now => checked_at);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  SELECT g.generation INTO generation FROM app_auth.authorization_generations g
    WHERE g.organization_id = s.organization_id AND g.user_id = s.user_id;
  IF s.context_id IS DISTINCT FROM p_expected_context OR generation IS DISTINCT FROM p_expected_generation THEN
    RETURN '{"status":"context_changed"}'::jsonb;
  END IF;
  IF NOT app_auth.has_membership(s.user_id, p_organization) THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
  IF p_context = s.context_id OR p_csrf = s.csrf_token THEN
    RAISE EXCEPTION 'context and csrf must rotate' USING ERRCODE = '22023';
  END IF;
  UPDATE app_auth.sessions SET organization_id = p_organization, context_id = p_context, csrf_token = p_csrf,
    idle_expires_at = LEAST(absolute_expires_at, checked_at + interval '30 minutes')
    WHERE cookie_digest = p_digest RETURNING * INTO s;
  RETURN app_auth.session_metadata(s);
END $$;
