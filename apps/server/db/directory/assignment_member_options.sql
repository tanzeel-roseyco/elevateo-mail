-- AIDEV-NOTE: The protected read and this owner routine share a snapshot; the owner must restate RLS predicates.
DO $$ BEGIN
  IF session_user <> 'elevateo_migrator' OR current_user <> 'elevateo_owner'
    OR NOT has_function_privilege('elevateo_owner',
      'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)', 'EXECUTE')
    OR to_regclass('app.organization_memberships') IS NULL
    OR to_regclass('app.mailbox_memberships') IS NULL THEN
    RAISE EXCEPTION 'assignment options prerequisites not met';
  END IF;
END $$;

CREATE FUNCTION app.assignment_member_options(p_digest text, p_user uuid, p_auth uuid,
  p_context uuid, p_generation bigint, p_org uuid, p_mailbox uuid, p_after uuid, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; visibility text; entries jsonb; next_after uuid;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_org IS NULL OR p_mailbox IS NULL
    OR p_user IS NULL OR p_auth IS NULL OR p_context IS NULL OR p_generation IS NULL
    OR p_generation < 0 THEN
    RAISE EXCEPTION 'invalid assignment options input' USING ERRCODE = '22023';
  END IF;
  proof := app_auth.authorize_session(p_digest, p_user, p_auth, p_context, p_generation);
  IF proof->>'status' IS DISTINCT FROM 'ok' THEN
    RETURN jsonb_build_object('status', proof->>'status');
  END IF;
  IF (proof->>'user_id')::uuid IS DISTINCT FROM p_user
    OR (proof->>'auth_session_id')::uuid IS DISTINCT FROM p_auth
    OR (proof->>'organization_id')::uuid IS DISTINCT FROM p_org
    OR (proof->>'context_id')::uuid IS DISTINCT FROM p_context
    OR (proof->>'authorization_generation')::bigint IS DISTINCT FROM p_generation
    OR app.context_uuid('app.user_id') IS DISTINCT FROM p_user
    OR app.context_uuid('app.org_id') IS DISTINCT FROM p_org
    OR NOT EXISTS (SELECT 1 FROM app.organization_memberships m
      WHERE m.organization_id = p_org AND m.user_id = p_user) THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;

  -- AIDEV-NOTE: V1 assignment writes require actor visibility, not compose/manage or an organization role.
  SELECT b.visibility INTO visibility FROM app.mailboxes b
    WHERE b.organization_id = p_org AND b.id = p_mailbox
      AND (b.visibility = 'shared' OR EXISTS (SELECT 1 FROM app.mailbox_memberships actor_member
        WHERE actor_member.organization_id = p_org AND actor_member.mailbox_id = p_mailbox
          AND actor_member.user_id = p_user))
      AND EXISTS (SELECT 1 FROM app.threads t
        WHERE t.organization_id = p_org AND t.mailbox_id = p_mailbox);
  IF visibility IS NULL THEN RETURN '{"status":"not_found"}'::jsonb; END IF;

  -- AIDEV-NOTE: This is V1 collaboration_reader target eligibility, with a keyset and one sentinel row.
  WITH page AS (
    SELECT m.user_id FROM app.organization_memberships m
      WHERE m.organization_id = p_org AND (p_after IS NULL OR m.user_id > p_after)
        AND (visibility = 'shared' OR EXISTS (SELECT 1 FROM app.mailbox_memberships target_member
          WHERE target_member.organization_id = p_org AND target_member.mailbox_id = p_mailbox
            AND target_member.user_id = m.user_id))
      ORDER BY m.user_id LIMIT p_limit + 1
  ), numbered AS (SELECT user_id, row_number() OVER (ORDER BY user_id) AS n FROM page)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id) ORDER BY user_id)
      FILTER (WHERE n <= p_limit), '[]'::jsonb),
    CASE WHEN count(*) > p_limit THEN (array_agg(user_id ORDER BY user_id))[p_limit] ELSE NULL END
    INTO entries, next_after FROM numbered;
  RETURN jsonb_build_object('status', 'ok', 'items', entries, 'next_user_id', next_after);
END $$;

REVOKE ALL ON FUNCTION app.assignment_member_options(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,integer)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker, elevateo_migrator;
GRANT EXECUTE ON FUNCTION app.assignment_member_options(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,integer)
  TO elevateo_api;
