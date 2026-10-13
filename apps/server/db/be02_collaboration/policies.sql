-- AIDEV-NOTE: Composite thread checks inherit current mailbox visibility; no direct membership DML is granted.
ALTER TABLE app.thread_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.thread_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE app.thread_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.thread_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY visible_thread_assignment ON app.thread_assignments FOR ALL TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.threads t WHERE t.organization_id = thread_assignments.organization_id
      AND t.mailbox_id = thread_assignments.mailbox_id AND t.id = thread_assignments.thread_id
  ))
  WITH CHECK (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.threads t WHERE t.organization_id = thread_assignments.organization_id
      AND t.mailbox_id = thread_assignments.mailbox_id AND t.id = thread_assignments.thread_id
  ));

CREATE POLICY visible_thread_note ON app.thread_notes FOR SELECT TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND EXISTS (
    SELECT 1 FROM app.threads t WHERE t.organization_id = thread_notes.organization_id
      AND t.mailbox_id = thread_notes.mailbox_id AND t.id = thread_notes.thread_id
  ));
CREATE POLICY insert_own_thread_note ON app.thread_notes FOR INSERT TO elevateo_app_read
  WITH CHECK (organization_id = app.context_uuid('app.org_id') AND author_id = app.context_uuid('app.user_id') AND EXISTS (
    SELECT 1 FROM app.threads t WHERE t.organization_id = thread_notes.organization_id
      AND t.mailbox_id = thread_notes.mailbox_id AND t.id = thread_notes.thread_id
  ));

REVOKE ALL ON app.thread_assignments, app.thread_notes FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT SELECT (organization_id, mailbox_id, thread_id, assignee_id, assignment_version, updated_at)
  ON app.thread_assignments TO elevateo_app_read;
GRANT INSERT (organization_id, mailbox_id, thread_id), UPDATE (assignee_id, assignment_version, updated_at)
  ON app.thread_assignments TO elevateo_api;
GRANT SELECT (organization_id, id, mailbox_id, thread_id, author_id, body_text, version, created_at)
  ON app.thread_notes TO elevateo_app_read;
GRANT INSERT (organization_id, id, mailbox_id, thread_id, author_id, body_text) ON app.thread_notes TO elevateo_api;
GRANT SELECT (read_state_version, updated_at) ON app.thread_read_states TO elevateo_app_read;
GRANT INSERT (organization_id, mailbox_id, thread_id, user_id, is_read, read_state_version),
  UPDATE (is_read, read_state_version, updated_at) ON app.thread_read_states TO elevateo_api;
