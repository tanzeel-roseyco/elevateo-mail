-- AIDEV-NOTE: Cookie-bound session and sorted generation guards must precede the mailbox business lock and DML.
CREATE FUNCTION app.change_mailbox_membership(p_digest text, p_mailbox uuid, p_target uuid, p_expected integer,
  p_delete boolean, p_compose boolean, p_approve boolean, p_manage boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof jsonb; org uuid; actor uuid; revision integer; member app.mailbox_memberships; changed boolean;
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
  SELECT * INTO member FROM app.mailbox_memberships
    WHERE organization_id = org AND mailbox_id = p_mailbox AND user_id = p_target;
  changed := CASE WHEN p_delete THEN member.user_id IS NOT NULL ELSE member.user_id IS NULL OR
    (member.compose, member.approve_send, member.manage_members) IS DISTINCT FROM (p_compose, p_approve, p_manage) END;
  IF changed AND member.manage_members AND (p_delete OR NOT p_manage) AND NOT EXISTS (
    SELECT 1 FROM app.mailbox_memberships m JOIN app.organization_memberships o
      ON o.organization_id = m.organization_id AND o.user_id = m.user_id
    WHERE m.organization_id = org AND m.mailbox_id = p_mailbox AND m.manage_members AND m.user_id <> p_target
  ) THEN RETURN '{"status":"membership_conflict"}'::jsonb; END IF;
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
