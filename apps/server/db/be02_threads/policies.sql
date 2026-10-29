-- AIDEV-NOTE: Policy subqueries inherit foundation mailbox visibility; direct API grants remain SELECT-only.
ALTER TABLE app.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.threads FORCE ROW LEVEL SECURITY;
ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE app.thread_read_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.thread_read_states FORCE ROW LEVEL SECURITY;

CREATE POLICY visible_thread ON app.threads FOR ALL TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.mailboxes mailbox
    WHERE mailbox.organization_id = threads.organization_id AND mailbox.id = threads.mailbox_id
  ))
  WITH CHECK (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.mailboxes mailbox
    WHERE mailbox.organization_id = threads.organization_id AND mailbox.id = threads.mailbox_id
  ));

CREATE POLICY visible_message ON app.messages FOR ALL TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.threads thread
    WHERE thread.organization_id = messages.organization_id AND thread.mailbox_id = messages.mailbox_id
      AND thread.id = messages.thread_id
  ))
  WITH CHECK (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.threads thread
    WHERE thread.organization_id = messages.organization_id AND thread.mailbox_id = messages.mailbox_id
      AND thread.id = messages.thread_id
  ));

CREATE POLICY own_visible_thread_state ON app.thread_read_states FOR ALL TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND
    user_id = app.context_uuid('app.user_id') AND EXISTS (
      SELECT 1 FROM app.threads thread
      WHERE thread.organization_id = thread_read_states.organization_id
        AND thread.mailbox_id = thread_read_states.mailbox_id AND thread.id = thread_read_states.thread_id
    ))
  WITH CHECK (organization_id = app.context_uuid('app.org_id') AND
    user_id = app.context_uuid('app.user_id') AND EXISTS (
      SELECT 1 FROM app.threads thread
      WHERE thread.organization_id = thread_read_states.organization_id
        AND thread.mailbox_id = thread_read_states.mailbox_id AND thread.id = thread_read_states.thread_id
    ));

REVOKE ALL ON app.threads, app.messages, app.thread_read_states
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT SELECT (id, organization_id, mailbox_id, subject) ON app.threads TO elevateo_app_read;
GRANT SELECT (id, organization_id, mailbox_id, thread_id, sender, recipients, sent_at, body_text, attachment_count)
  ON app.messages TO elevateo_app_read;
GRANT SELECT (organization_id, mailbox_id, thread_id, user_id, is_read)
  ON app.thread_read_states TO elevateo_app_read;
