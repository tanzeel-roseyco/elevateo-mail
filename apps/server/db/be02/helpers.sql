-- AIDEV-NOTE: Private helpers are never runtime-callable; public entrypoints first bind the opaque cookie to Auth identity.
CREATE FUNCTION app_auth.check_digest(p_digest text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid digest' USING ERRCODE = '22023';
  END IF;
END $$;

CREATE FUNCTION app_auth.check_credentials(p_access text, p_refresh text, p_expiry timestamptz) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_access IS NULL OR octet_length(p_access) NOT BETWEEN 1 AND 16384
    OR p_refresh IS NULL OR octet_length(p_refresh) NOT BETWEEN 1 AND 16384
    OR p_expiry IS NULL OR NOT isfinite(p_expiry) OR p_expiry <= statement_timestamp() THEN
    RAISE EXCEPTION 'invalid encrypted credentials' USING ERRCODE = '22023';
  END IF;
END $$;

CREATE FUNCTION app_auth.auth_deadline(p_user uuid, p_session uuid) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT LEAST(s.created_at + interval '12 hours', s.not_after)
    FROM auth.sessions s WHERE s.id = p_session AND s.user_id = p_user
      AND s.created_at IS NOT NULL AND isfinite(s.created_at)
      AND s.created_at <= statement_timestamp()
$$;

CREATE FUNCTION app_auth.has_membership(p_user uuid, p_org uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET app_auth.verified_user_id = '' AS $$
BEGIN
  PERFORM set_config('app_auth.verified_user_id', p_user::text, true);
  RETURN EXISTS (SELECT 1 FROM app.organization_memberships m
    WHERE m.user_id = p_user AND m.organization_id = p_org);
END $$;

-- AIDEV-NOTE: Reads use snapshot time; writers pass wall time sampled after their final lock wait.
CREATE FUNCTION app_auth.session_status(p_row app_auth.sessions, p_user uuid, p_auth uuid,
  p_allow_refresh boolean DEFAULT false, p_require_org boolean DEFAULT true,
  p_now timestamptz DEFAULT statement_timestamp()) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE deadline timestamptz;
BEGIN
  IF p_row.cookie_digest IS NULL OR p_row.state IN ('revoked', 'refresh_uncertain')
    OR p_now IS NULL OR p_row.absolute_expires_at <= p_now OR p_row.idle_expires_at <= p_now
    OR p_user IS NULL OR p_auth IS NULL OR p_row.user_id <> p_user OR p_row.auth_session_id <> p_auth THEN
    RETURN 'unauthorized';
  END IF;
  deadline := app_auth.auth_deadline(p_user, p_auth);
  IF deadline IS NULL OR deadline <= p_now THEN RETURN 'unauthorized'; END IF;
  IF p_require_org AND NOT app_auth.has_membership(p_user, p_row.organization_id) THEN RETURN 'not_found'; END IF;
  IF p_row.state = 'refreshing' AND NOT p_allow_refresh THEN
    IF p_row.refresh_claim_deadline <= p_now THEN RETURN 'unauthorized'; END IF;
    RETURN 'temporarily_unavailable';
  END IF;
  RETURN 'ok';
END $$;

CREATE FUNCTION app_auth.session_metadata(p_row app_auth.sessions) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET app_auth.verified_user_id = '' AS $$
BEGIN
  PERFORM set_config('app_auth.verified_user_id', p_row.user_id::text, true);
  RETURN jsonb_build_object('status', 'ok', 'user_id', p_row.user_id, 'auth_session_id', p_row.auth_session_id,
    'organization_id', p_row.organization_id, 'context_id', p_row.context_id, 'csrf_token', p_row.csrf_token,
    'organization_name', (SELECT o.name FROM app.organizations o WHERE o.id = p_row.organization_id),
    'authorization_generation', (SELECT g.generation FROM app_auth.authorization_generations g
      WHERE g.organization_id = p_row.organization_id AND g.user_id = p_row.user_id),
    'refresh_generation', p_row.refresh_generation, 'absolute_expires_at', p_row.absolute_expires_at,
    'idle_expires_at', p_row.idle_expires_at);
END $$;

CREATE FUNCTION app_auth.queue_revocation(p_row app_auth.sessions, p_access text,
  p_generation bigint, p_scope text) RETURNS void
LANGUAGE sql VOLATILE SET search_path = pg_catalog AS $$
  INSERT INTO app_auth.revocation_intents(cookie_digest, credential_generation, scope, access_token_ciphertext)
    VALUES (p_row.cookie_digest, p_generation, p_scope, p_access)
    ON CONFLICT (cookie_digest, credential_generation, scope) DO UPDATE
      SET access_token_ciphertext = EXCLUDED.access_token_ciphertext, state = 'pending',
        claim_id = NULL, claim_deadline = NULL, attempts = 0, next_attempt_at = statement_timestamp()
      WHERE app_auth.revocation_intents.access_token_ciphertext IS DISTINCT FROM EXCLUDED.access_token_ciphertext
$$;
