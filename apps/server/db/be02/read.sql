-- AIDEV-NOTE: STABLE routines use the caller's protected snapshot and work inside REPEATABLE READ READ ONLY.
CREATE FUNCTION app_auth.resolve_session(p_digest text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; status text;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest;
  status := app_auth.session_status(s, s.user_id, s.auth_session_id);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  RETURN app_auth.session_metadata(s) || jsonb_build_object(
    'access_token_ciphertext', s.access_token_ciphertext, 'access_expires_at', s.access_expires_at);
END $$;

CREATE FUNCTION app_auth.authorize_session(p_digest text, p_user uuid, p_auth_session uuid,
  p_context uuid, p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; status text; result jsonb;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest;
  status := app_auth.session_status(s, p_user, p_auth_session);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  result := app_auth.session_metadata(s);
  -- Revocation and binding failures precede stale-context hints; hints never grant authority.
  IF (p_context IS NOT NULL AND s.context_id <> p_context)
    OR (p_generation IS NOT NULL AND (result->>'authorization_generation')::bigint IS DISTINCT FROM p_generation)
  THEN RETURN '{"status":"context_changed"}'::jsonb; END IF;
  RETURN result;
END $$;

CREATE FUNCTION app_auth.touch_session(p_digest text, p_user uuid, p_auth_session uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; status text; checked_at timestamptz;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest FOR UPDATE;
  -- AIDEV-NOTE: Lock waits consume lifetime; one post-lock clock controls both denial and extension.
  checked_at := clock_timestamp();
  status := app_auth.session_status(s, p_user, p_auth_session, p_now => checked_at);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  UPDATE app_auth.sessions SET idle_expires_at = LEAST(absolute_expires_at, checked_at + interval '30 minutes')
    WHERE cookie_digest = p_digest;
  RETURN '{"status":"ok"}'::jsonb;
END $$;

CREATE FUNCTION app_auth.list_organizations(p_digest text, p_user uuid, p_auth_session uuid,
  p_after uuid, p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog SET app_auth.verified_user_id = '' AS $$
DECLARE s app_auth.sessions; status text; entries jsonb; next_after uuid;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest;
  status := app_auth.session_status(s, p_user, p_auth_session);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  PERFORM set_config('app_auth.verified_user_id', s.user_id::text, true);
  WITH page AS (
    SELECT o.id, o.name FROM app.organizations o JOIN app.organization_memberships m ON m.organization_id = o.id
      WHERE m.user_id = s.user_id AND (p_after IS NULL OR o.id > p_after) ORDER BY o.id LIMIT p_limit + 1
  ), numbered AS (SELECT *, row_number() OVER (ORDER BY id) AS n FROM page)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY id) FILTER (WHERE n <= p_limit), '[]'),
    CASE WHEN count(*) > p_limit THEN (array_agg(id ORDER BY id))[p_limit] ELSE NULL END
    INTO entries, next_after FROM numbered;
  RETURN jsonb_build_object('status', 'ok', 'organizations', entries, 'next_after', next_after);
END $$;
