-- AIDEV-NOTE: Availability deliberately conflates foreign drafts and missing compose; authorized absent IDs may create.
CREATE FUNCTION app.draft_scope(p_mailbox uuid, p_draft uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
  SELECT p_mailbox IS NOT NULL AND app.context_uuid('app.user_id') IS NOT NULL AND
    EXISTS (SELECT 1 FROM app.mailboxes mailbox JOIN app.mailbox_memberships member
       ON member.organization_id = mailbox.organization_id AND member.mailbox_id = mailbox.id
      WHERE mailbox.organization_id = app.context_uuid('app.org_id') AND mailbox.id = p_mailbox
        AND member.user_id = app.context_uuid('app.user_id') AND member.compose) AND
    NOT EXISTS (SELECT 1 FROM app.drafts draft WHERE draft.id = p_draft AND
      (draft.organization_id <> app.context_uuid('app.org_id') OR draft.mailbox_id <> p_mailbox OR
       draft.actor_id <> app.context_uuid('app.user_id')))
$$;
