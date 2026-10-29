-- AIDEV-NOTE: Call this after session locks and BEFORE membership/business DML; triggers alone cannot order row locks.
CREATE FUNCTION app_auth.lock_authorization_generations(p_organization uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_organization IS NULL THEN RAISE EXCEPTION 'organization required' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM app_auth.authorization_generations g
    WHERE g.organization_id = p_organization AND (p_user IS NULL OR g.user_id = p_user)
    ORDER BY g.organization_id, g.user_id FOR UPDATE;
END $$;

CREATE FUNCTION app_auth.bump_authorization_generation() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prior_org uuid; next_org uuid; prior_user uuid; next_user uuid; target record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    prior_org := OLD.organization_id;
    IF TG_TABLE_NAME <> 'mailboxes' THEN prior_user := OLD.user_id; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    next_org := NEW.organization_id;
    IF TG_TABLE_NAME <> 'mailboxes' THEN next_user := NEW.user_id; END IF;
  END IF;
  -- Tombstones are created even for a user who has never logged in; sorted keys avoid opposite-order updates.
  IF TG_TABLE_NAME <> 'mailboxes' THEN
    FOR target IN SELECT DISTINCT org_id, actor_id FROM (VALUES
      (prior_org, prior_user), (next_org, next_user)) AS keys(org_id, actor_id)
      WHERE org_id IS NOT NULL AND actor_id IS NOT NULL ORDER BY org_id, actor_id LOOP
      INSERT INTO app_auth.authorization_generations(organization_id, user_id)
        VALUES (target.org_id, target.actor_id) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  -- AIDEV-NOTE: Membership moves invalidate exact tuples; mailbox changes still invalidate each affected whole org.
  PERFORM 1 FROM app_auth.authorization_generations g
    WHERE (TG_TABLE_NAME = 'mailboxes' AND g.organization_id IN (prior_org, next_org))
      OR (TG_TABLE_NAME <> 'mailboxes'
        AND (g.organization_id, g.user_id) IN ((prior_org, prior_user), (next_org, next_user)))
    ORDER BY g.organization_id, g.user_id FOR UPDATE;
  UPDATE app_auth.authorization_generations g SET generation = generation + 1
    WHERE (TG_TABLE_NAME = 'mailboxes' AND g.organization_id IN (prior_org, next_org))
      OR (TG_TABLE_NAME <> 'mailboxes'
        AND (g.organization_id, g.user_id) IN ((prior_org, prior_user), (next_org, next_user)));
  RETURN NULL;
END $$;
