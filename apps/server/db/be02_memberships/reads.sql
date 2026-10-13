-- AIDEV-NOTE: ReadController supplies a read-only snapshot; owner-only policies permit exactly the explicit roster.
CREATE FUNCTION app.mailbox_membership_version(p_mailbox uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid := app.context_uuid('app.org_id'); actor uuid := app.context_uuid('app.user_id');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.mailbox_memberships m JOIN app.organization_memberships o
      ON o.organization_id = m.organization_id AND o.user_id = m.user_id
    WHERE m.organization_id = org AND m.mailbox_id = p_mailbox AND m.user_id = actor AND m.manage_members
  ) THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT membership_version FROM app.mailbox_membership_revisions
    WHERE organization_id = org AND mailbox_id = p_mailbox), 0);
END $$;

CREATE FUNCTION app.mailbox_members_page(p_mailbox uuid, p_after uuid, p_limit integer)
RETURNS TABLE(user_id uuid, compose boolean, approve_send boolean, manage_members boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE org uuid := app.context_uuid('app.org_id');
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 51 THEN
    RAISE EXCEPTION 'invalid roster limit' USING ERRCODE = '22023';
  END IF;
  IF app.mailbox_membership_version(p_mailbox) IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT m.user_id, m.compose, m.approve_send, m.manage_members
    FROM app.mailbox_memberships m JOIN app.organization_memberships o
      ON o.organization_id = m.organization_id AND o.user_id = m.user_id
    WHERE m.organization_id = org AND m.mailbox_id = p_mailbox AND (p_after IS NULL OR m.user_id > p_after)
    ORDER BY m.user_id ASC LIMIT p_limit;
END $$;
