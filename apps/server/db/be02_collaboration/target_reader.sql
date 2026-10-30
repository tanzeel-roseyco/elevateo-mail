-- AIDEV-NOTE: This owner sees only the explicitly verified user's membership, never unrestricted tenant tables.
GRANT SELECT (id, organization_id, visibility) ON app.mailboxes TO elevateo_session_owner;
GRANT SELECT (organization_id, mailbox_id, user_id) ON app.mailbox_memberships TO elevateo_session_owner;
CREATE POLICY collaboration_verified_member ON app.mailbox_memberships FOR SELECT TO elevateo_session_owner
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid AND
    user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid);
CREATE POLICY collaboration_verified_mailbox ON app.mailboxes FOR SELECT TO elevateo_session_owner
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid AND EXISTS (
    SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = mailboxes.organization_id
      AND m.user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid
  ) AND (visibility = 'shared' OR EXISTS (
    SELECT 1 FROM app.mailbox_memberships m WHERE m.organization_id = mailboxes.organization_id
      AND m.mailbox_id = mailboxes.id
      AND m.user_id = NULLIF(current_setting('app_auth.verified_user_id', true), '')::uuid
  )));

SET LOCAL ROLE elevateo_session_owner;
CREATE FUNCTION app_auth.collaboration_reader(p_digest text, p_mailbox uuid, p_target uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog SET app_auth.verified_user_id = '' AS $$
DECLARE checked jsonb; scope_org uuid; actor uuid;
BEGIN
  -- The private marker proves sorted actor/target guards are held by this transaction, not a caller-set GUC.
  checked := app_auth.assert_protected_write(p_digest, p_target);
  IF checked->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'protected write unavailable' USING ERRCODE = '42501';
  END IF;
  scope_org := (checked->>'organization_id')::uuid;
  actor := (checked->>'user_id')::uuid;
  PERFORM set_config('app_auth.verified_user_id', actor::text, true);
  IF NOT EXISTS (SELECT 1 FROM app.mailboxes WHERE organization_id = scope_org AND id = p_mailbox) THEN
    RETURN false;
  END IF;
  PERFORM set_config('app_auth.verified_user_id', p_target::text, true);
  RETURN EXISTS (SELECT 1 FROM app.mailboxes WHERE organization_id = scope_org AND id = p_mailbox);
END $$;
REVOKE ALL ON FUNCTION app_auth.collaboration_reader(text,uuid,uuid)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker, elevateo_owner, elevateo_migrator;
GRANT EXECUTE ON FUNCTION app_auth.collaboration_reader(text,uuid,uuid) TO elevateo_api;
SET LOCAL ROLE elevateo_owner;
