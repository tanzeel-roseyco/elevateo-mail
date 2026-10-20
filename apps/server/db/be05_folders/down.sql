-- AIDEV-NOTE: Roll back later dependants first; no CASCADE may erase another feature's schema.
SET LOCAL ROLE elevateo_owner;
REVOKE SELECT (folder_version, folder_updated_at) ON app.threads FROM elevateo_api;
REVOKE UPDATE (folder, snoozed_until, folder_version, folder_updated_at) ON app.threads FROM elevateo_api;
REVOKE SELECT (folder, snoozed_until) ON app.threads FROM elevateo_app_read;
DROP TABLE app.thread_stars;
DROP INDEX app.threads_mailbox_folder_order;
ALTER TABLE app.threads
  DROP COLUMN folder,
  DROP COLUMN snoozed_until,
  DROP COLUMN folder_version,
  DROP COLUMN folder_updated_at;
