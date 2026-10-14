-- AIDEV-NOTE: Cookie-bound session and sorted generation guards must precede the mailbox business lock and DML.
CREATE OR REPLACE FUNCTION app.change_mailbox_membership(p_digest text, p_mailbox uuid, p_target uuid, p_expected integer,
  p_delete boolean, p_compose boolean, p_approve boolean, p_manage boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; revision integer; member app.mailbox_memberships; changed boolean;
  actor_role text; target_role text; security_row app.mailbox_security; ceiling app.mailbox_grant_ceilings;
  actor_member app.mailbox_memberships;
BEGIN
  IF p_mailbox IS NULL OR p_target IS NULL OR p_expected IS NULL OR p_expected < 0 OR p_delete IS NULL
    OR (NOT p_delete AND (p_compose IS NULL OR p_approve IS NULL OR p_manage IS NULL))
    OR (p_delete AND (p_compose IS NOT NULL OR p_approve IS NOT NULL OR p_manage IS NOT NULL)) THEN
    RAISE EXCEPTION 'invalid membership arguments' USING ERRCODE = '22023';
  END IF;
  proof := app_auth.assert_protected_write(p_digest, p_target);
  IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
  org := (proof->>'organization_id')::uuid;
  actor := (proof->>'user_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM app.organization_memberships WHERE organization_id = org AND user_id = p_target)
    OR app.mailbox_membership_version(p_mailbox) IS NULL THEN RETURN '{"status":"not_found"}'::jsonb; END IF;

  INSERT INTO app.mailbox_membership_revisions(organization_id, mailbox_id)
    VALUES (org, p_mailbox) ON CONFLICT (mailbox_id) DO NOTHING;
  SELECT membership_version INTO revision FROM app.mailbox_membership_revisions
    WHERE organization_id = org AND mailbox_id = p_mailbox FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
  -- Recheck after the business wait; current guards protect actor and target until this transaction completes.
  IF NOT EXISTS (SELECT 1 FROM app.mailbox_memberships WHERE organization_id = org AND mailbox_id = p_mailbox
      AND user_id = actor AND manage_members)
    OR NOT EXISTS (SELECT 1 FROM app.organization_memberships WHERE organization_id = org AND user_id = p_target)
    THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
  IF revision <> p_expected THEN RETURN '{"status":"membership_conflict"}'::jsonb; END IF;
  -- AIDEV-NOTE: The legacy route reaches this routine; enforce current rank, owner consent and explicit ceilings here.
  SELECT role INTO actor_role FROM app.organization_access WHERE organization_id = org AND user_id = actor;
  SELECT role INTO target_role FROM app.organization_access WHERE organization_id = org AND user_id = p_target;
  SELECT * INTO security_row FROM app.mailbox_security
    WHERE organization_id = org AND mailbox_id = p_mailbox;
  SELECT * INTO ceiling FROM app.mailbox_grant_ceilings
    WHERE organization_id = org AND mailbox_id = p_mailbox AND user_id = actor;
  SELECT * INTO actor_member FROM app.mailbox_memberships
    WHERE organization_id = org AND mailbox_id = p_mailbox AND user_id = actor;
  IF security_row.mailbox_id IS NULL OR actor_role IS NULL OR target_role IS NULL
    OR ceiling.user_id IS NULL OR actor_member.user_id IS NULL OR NOT ceiling.manage_members
    OR (security_row.classification = 'team' AND actor_role NOT IN ('owner', 'admin', 'sales_manager'))
    OR (actor_role = 'admin' AND target_role IN ('owner', 'admin')
      AND NOT (p_delete AND actor = p_target))
    OR (actor_role = 'sales_manager' AND target_role NOT IN ('sales', 'associate')
      AND NOT (p_delete AND actor = p_target))
    OR (security_row.classification = 'personal' AND actor <> security_row.personal_owner_id)
    OR (security_row.classification = 'personal' AND p_manage AND p_target <> security_row.personal_owner_id)
    OR (NOT p_delete AND ((p_compose AND (NOT ceiling.compose OR NOT actor_member.compose))
      OR (p_approve AND (NOT ceiling.approve_send OR NOT actor_member.approve_send))
      OR (p_manage AND (NOT ceiling.manage_members OR NOT actor_member.manage_members))))
    THEN RETURN '{"status":"not_found"}'::jsonb; END IF;
  SELECT * INTO member FROM app.mailbox_memberships
    WHERE organization_id = org AND mailbox_id = p_mailbox AND user_id = p_target;
  -- Existing authority may be surrendered, but a manager cannot use this endpoint to elevate self.
  IF actor = p_target AND NOT p_delete AND (member.user_id IS NULL
    OR (p_compose AND NOT member.compose) OR (p_approve AND NOT member.approve_send)
    OR (p_manage AND NOT member.manage_members)) THEN
    RETURN '{"status":"not_found"}'::jsonb;
  END IF;
  changed := CASE WHEN p_delete THEN member.user_id IS NOT NULL ELSE member.user_id IS NULL OR
    (member.compose, member.approve_send, member.manage_members) IS DISTINCT FROM (p_compose, p_approve, p_manage) END;
  IF changed AND member.manage_members AND (p_delete OR NOT p_manage) THEN
    -- AIDEV-NOTE: Only the personal owner can administer that mailbox; no alternate flag preserves authority.
    IF security_row.classification = 'personal' AND p_target = security_row.personal_owner_id THEN
      RETURN '{"status":"membership_conflict"}'::jsonb;
    END IF;
    IF security_row.classification = 'team' AND NOT EXISTS (
      SELECT 1 FROM app.mailbox_memberships m JOIN app.organization_memberships o
        ON o.organization_id = m.organization_id AND o.user_id = m.user_id
      JOIN app.organization_access a ON (a.organization_id, a.user_id) = (m.organization_id, m.user_id)
      JOIN app.mailbox_grant_ceilings c ON (c.organization_id, c.mailbox_id, c.user_id) =
        (m.organization_id, m.mailbox_id, m.user_id)
      WHERE m.organization_id = org AND m.mailbox_id = p_mailbox AND m.manage_members AND c.manage_members
        AND a.role IN ('owner', 'admin', 'sales_manager') AND m.user_id <> p_target
    ) THEN RETURN '{"status":"membership_conflict"}'::jsonb; END IF;
  END IF;
  IF changed AND revision = 2147483647 THEN RETURN '{"status":"temporarily_unavailable"}'::jsonb; END IF;
  IF changed THEN
    IF p_delete THEN
      DELETE FROM app.mailbox_memberships WHERE organization_id = org AND mailbox_id = p_mailbox AND user_id = p_target;
    ELSE
      INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id, compose, approve_send, manage_members)
        VALUES (org, p_mailbox, p_target, p_compose, p_approve, p_manage)
        ON CONFLICT (mailbox_id, user_id) DO UPDATE SET compose = EXCLUDED.compose,
          approve_send = EXCLUDED.approve_send, manage_members = EXCLUDED.manage_members;
    END IF;
    revision := revision + 1;
  END IF;
  proof := app_auth.assert_protected_write(p_digest, p_target);
  IF proof->>'status' <> 'ok' THEN RETURN proof; END IF;
  RETURN jsonb_build_object('status', 'ok', 'metadata', proof, 'membership_version', revision,
    'member', CASE WHEN p_delete THEN NULL ELSE jsonb_build_object('user_id', p_target,
      'capabilities', jsonb_build_object('compose', p_compose, 'approve_send', p_approve, 'manage_members', p_manage)) END);
END $$;
