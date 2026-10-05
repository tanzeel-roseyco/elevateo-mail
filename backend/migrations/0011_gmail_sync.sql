-- AIDEV-NOTE: Provider cache and cursor commit together; connection changes invalidate in-flight page commits.
ALTER TABLE messages ADD COLUMN gmail_epoch TEXT;
CREATE INDEX gmail_cache_epoch ON messages(owner,mailbox_id,gmail_epoch,id);
CREATE TABLE gmail_sync (
 owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
 mode TEXT NOT NULL DEFAULT 'full' CHECK(mode IN ('full','prune','history')),
 cursor TEXT, page_token TEXT, epoch TEXT NOT NULL,
 PRIMARY KEY(owner,mailbox_id), FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id)
);
CREATE TRIGGER gmail_connection_reset AFTER UPDATE OF connected,subject,provider ON mailboxes
WHEN NEW.connected<>OLD.connected OR NEW.subject<>OLD.subject OR NEW.provider<>OLD.provider
BEGIN
 UPDATE gmail_sync SET version=version+1,mode='full',cursor=NULL,page_token=NULL,epoch=lower(hex(randomblob(16)))
 WHERE owner=NEW.owner AND mailbox_id=NEW.id;
END;
-- Rollback after stopping sync: DROP TRIGGER gmail_connection_reset; DROP TABLE gmail_sync;
-- DROP INDEX gmail_cache_epoch; ALTER TABLE messages DROP COLUMN gmail_epoch;
