-- AIDEV-NOTE: Schedule leases coordinate cron invocations; Gmail cursor CAS also fences manual sync races.
CREATE TABLE gmail_schedule (
 owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, due_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 last_error TEXT CHECK(last_error IS NULL OR last_error='sync_failed'),
 PRIMARY KEY(owner,mailbox_id), FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id) ON DELETE CASCADE
);
CREATE INDEX gmail_schedule_due ON gmail_schedule(due_at,lease_until);
-- Rollback after stopping scheduled sync: DROP TABLE gmail_schedule;
