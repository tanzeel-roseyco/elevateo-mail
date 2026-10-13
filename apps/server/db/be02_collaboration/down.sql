-- AIDEV-NOTE: Roll back later dependants first; never use CASCADE to erase another feature's schema.
SET LOCAL ROLE elevateo_session_owner;
DROP FUNCTION app_auth.collaboration_reader(text,uuid,uuid);
SET LOCAL ROLE elevateo_owner;
DROP POLICY collaboration_verified_mailbox ON app.mailboxes;
DROP POLICY collaboration_verified_member ON app.mailbox_memberships;
REVOKE SELECT (id, organization_id, visibility) ON app.mailboxes FROM elevateo_session_owner;
REVOKE SELECT (organization_id, mailbox_id, user_id) ON app.mailbox_memberships FROM elevateo_session_owner;
DROP TABLE app.thread_notes;
DROP TABLE app.thread_assignments;
REVOKE INSERT (organization_id, mailbox_id, thread_id, user_id, is_read, read_state_version),
  UPDATE (is_read, read_state_version, updated_at) ON app.thread_read_states FROM elevateo_api;
REVOKE SELECT (read_state_version, updated_at) ON app.thread_read_states FROM elevateo_app_read;
ALTER TABLE app.thread_read_states DROP COLUMN read_state_version;
