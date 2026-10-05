-- AIDEV-NOTE: Counts only new incremental Gmail cache inserts, in the same transaction as the guarded cursor.
ALTER TABLE mailboxes ADD COLUMN arrival_count INTEGER NOT NULL DEFAULT 0 CHECK(arrival_count BETWEEN 0 AND 9007199254740991);
ALTER TABLE messages ADD COLUMN gmail_inbox INTEGER NOT NULL DEFAULT 0 CHECK(gmail_inbox IN (0,1));
CREATE TRIGGER gmail_inbox_arrival AFTER INSERT ON messages
WHEN NEW.gmail_epoch IS NOT NULL AND NEW.gmail_inbox=1 AND EXISTS (
 SELECT 1 FROM gmail_sync WHERE owner=NEW.owner AND mailbox_id=NEW.mailbox_id AND mode='history'
)
BEGIN
 UPDATE mailboxes SET arrival_count=MIN(arrival_count+1,9007199254740991)
 WHERE owner=NEW.owner AND id=NEW.mailbox_id AND provider='gmail' AND connected=1;
END;
-- Rollback after stopping sync: DROP TRIGGER gmail_inbox_arrival; ALTER TABLE mailboxes DROP COLUMN arrival_count;
-- ALTER TABLE messages DROP COLUMN gmail_inbox;
