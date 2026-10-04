-- AIDEV-NOTE: Check replay conflicts inside the same D1 transaction as effects, not only in a racy preflight read.
CREATE TRIGGER event_integrity BEFORE INSERT ON event_receipts
WHEN EXISTS(SELECT 1 FROM event_receipts WHERE owner=NEW.owner AND mailbox_id=NEW.mailbox_id
 AND event_id=NEW.event_id AND payload_hash<>NEW.payload_hash)
BEGIN SELECT RAISE(ABORT,'event_conflict'); END;
