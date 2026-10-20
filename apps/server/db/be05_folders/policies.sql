SET LOCAL ROLE elevateo_owner;

ALTER TABLE app.thread_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.thread_stars FORCE ROW LEVEL SECURITY;

-- AIDEV-NOTE: The actor predicate prevents one mailbox reader from observing or mutating another reader's star.
CREATE POLICY own_visible_thread_star ON app.thread_stars FOR ALL TO elevateo_app_read
  USING (organization_id = app.context_uuid('app.org_id') AND
    user_id = app.context_uuid('app.user_id') AND EXISTS (
      SELECT 1 FROM app.threads thread
      WHERE thread.organization_id = thread_stars.organization_id
        AND thread.mailbox_id = thread_stars.mailbox_id AND thread.id = thread_stars.thread_id
    ))
  WITH CHECK (organization_id = app.context_uuid('app.org_id') AND
    user_id = app.context_uuid('app.user_id') AND EXISTS (
      SELECT 1 FROM app.threads thread
      WHERE thread.organization_id = thread_stars.organization_id
        AND thread.mailbox_id = thread_stars.mailbox_id AND thread.id = thread_stars.thread_id
    ));

REVOKE ALL ON app.thread_stars FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
GRANT SELECT (folder, snoozed_until) ON app.threads TO elevateo_app_read;
GRANT SELECT (organization_id, mailbox_id, thread_id, user_id, starred)
  ON app.thread_stars TO elevateo_app_read;
-- AIDEV-NOTE: DML remains usable only inside protected_write because forced RLS requires actor/org GUCs.
GRANT SELECT (folder_version, folder_updated_at) ON app.threads TO elevateo_api;
GRANT UPDATE (folder, snoozed_until, folder_version, folder_updated_at) ON app.threads TO elevateo_api;
GRANT SELECT (star_version, updated_at) ON app.thread_stars TO elevateo_api;
GRANT INSERT (organization_id, mailbox_id, thread_id, user_id, starred, star_version),
  UPDATE (starred, star_version, updated_at) ON app.thread_stars TO elevateo_api;
