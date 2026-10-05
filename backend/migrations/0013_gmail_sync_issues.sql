-- AIDEV-NOTE: Explicit incomplete-message records prevent unsupported content from blocking mailbox progress.
CREATE TABLE gmail_sync_issues (
 owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, message_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason='message_content_unsupported'), epoch TEXT NOT NULL,
 PRIMARY KEY(owner,mailbox_id,message_id),
 FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id)
);
CREATE INDEX gmail_issues_epoch ON gmail_sync_issues(owner,mailbox_id,epoch,message_id);
-- Rollback after stopping sync: DROP TABLE gmail_sync_issues;
