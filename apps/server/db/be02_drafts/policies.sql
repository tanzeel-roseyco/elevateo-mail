-- AIDEV-NOTE: The NOLOGIN definer owner gets only actor-scoped base reads needed to recheck compose in the write txn.
CREATE POLICY draft_owner_org_read ON app.organization_memberships FOR SELECT TO elevateo_owner
  USING (organization_id = app.context_uuid('app.org_id') AND user_id = app.context_uuid('app.user_id'));
CREATE POLICY draft_owner_membership_read ON app.mailbox_memberships FOR SELECT TO elevateo_owner
  USING (organization_id = app.context_uuid('app.org_id') AND user_id = app.context_uuid('app.user_id'));
CREATE POLICY draft_owner_mailbox_read ON app.mailboxes FOR SELECT TO elevateo_owner
  USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.organization_memberships member
     WHERE member.organization_id = mailboxes.organization_id AND member.user_id = app.context_uuid('app.user_id')
  ) AND (visibility = 'shared' OR EXISTS (
    SELECT 1 FROM app.mailbox_memberships member
     WHERE member.organization_id = mailboxes.organization_id AND member.mailbox_id = mailboxes.id
       AND member.user_id = app.context_uuid('app.user_id')
  )));
CREATE POLICY draft_owner_thread_read ON app.threads FOR SELECT TO elevateo_owner
  USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.mailboxes mailbox
     WHERE mailbox.organization_id = threads.organization_id AND mailbox.id = threads.mailbox_id
  ));

CREATE POLICY own_compose_draft ON app.drafts FOR SELECT TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND actor_id = app.context_uuid('app.user_id') AND EXISTS (
    SELECT 1 FROM app.mailboxes mailbox JOIN app.mailbox_memberships member
      ON member.organization_id = mailbox.organization_id AND member.mailbox_id = mailbox.id
     WHERE mailbox.organization_id = drafts.organization_id AND mailbox.id = drafts.mailbox_id
       AND member.user_id = app.context_uuid('app.user_id') AND member.compose
  ));
-- AIDEV-NOTE: Global ID ownership is inspected only inside scope/save functions, never granted as an API SELECT.
CREATE POLICY draft_definer ON app.drafts TO elevateo_owner USING (true) WITH CHECK (true);
CREATE POLICY operation_definer ON app_drafts_private.operations TO elevateo_owner USING (true) WITH CHECK (true);
