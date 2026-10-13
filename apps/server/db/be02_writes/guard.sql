-- AIDEV-NOTE: A transaction marker avoids forgeable GUC authority and requires no durable per-request ledger cleanup.
ALTER TABLE app_auth.sessions
  ADD COLUMN write_transaction xid8,
  ADD COLUMN write_guard_users uuid[],
  ADD CONSTRAINT protected_write_marker_pair CHECK (
    (write_transaction IS NULL) = (write_guard_users IS NULL));

CREATE FUNCTION app_auth.begin_protected_write(p_digest text, p_user uuid, p_auth uuid, p_targets uuid[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  s app_auth.sessions; target uuid; guarded uuid[]; checked_at timestamptz; status text;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  IF p_targets IS NULL OR cardinality(p_targets) > 2
    OR (cardinality(p_targets) > 0 AND array_ndims(p_targets) <> 1) THEN
    RAISE EXCEPTION 'invalid protected write targets' USING ERRCODE = '22023';
  END IF;
  -- AIDEV-NOTE: array_position rejects multidimensional arrays; validate dimensions in a separate statement first.
  IF array_position(p_targets, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid protected write targets' USING ERRCODE = '22023';
  END IF;
  -- AIDEV-NOTE: Fresh snapshots after waits are required; repeatable-read cannot observe a just-committed revocation.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'protected writes require read committed' USING ERRCODE = '25001';
  END IF;
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest = p_digest FOR UPDATE;
  status := app_auth.session_status(s, p_user, p_auth, false, false, clock_timestamp());
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  IF s.organization_id IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  -- AIDEV-NOTE: Reentry must fail before generation locks can invert the first entry's transaction-wide order.
  IF s.write_transaction = pg_current_xact_id() THEN
    RAISE EXCEPTION 'protected write already entered' USING ERRCODE = '25001';
  END IF;
  SELECT array_agg(user_id ORDER BY user_id) INTO guarded
    FROM (SELECT DISTINCT unnest(array_prepend(s.user_id, p_targets)) AS user_id) users;
  -- AIDEV-NOTE: Insert AND lock each sorted tuple before the next; batching inserts can deadlock on missing rows.
  FOREACH target IN ARRAY guarded LOOP
    INSERT INTO app_auth.authorization_generations(organization_id, user_id)
      VALUES (s.organization_id, target) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM app_auth.authorization_generations
      WHERE organization_id = s.organization_id AND user_id = target FOR UPDATE;
  END LOOP;
  checked_at := clock_timestamp();
  status := app_auth.session_status(s, p_user, p_auth, false, true, checked_at);
  IF status <> 'ok' THEN RETURN jsonb_build_object('status', status); END IF;
  IF s.access_expires_at <= checked_at THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  -- Claims are consistency assertions only: the cookie-bound row supplies actor and organization authority.
  IF NULLIF(current_setting('app.user_id', true), '') IS DISTINCT FROM s.user_id::text THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF NULLIF(current_setting('app.org_id', true), '') IS DISTINCT FROM s.organization_id::text THEN
    RETURN jsonb_build_object('status', 'context_changed');
  END IF;
  UPDATE app_auth.sessions SET write_transaction = pg_current_xact_id(), write_guard_users = guarded,
    idle_expires_at = LEAST(absolute_expires_at, checked_at + interval '30 minutes')
    WHERE cookie_digest = p_digest RETURNING * INTO s;
  RETURN app_auth.session_metadata(s);
END $$;
