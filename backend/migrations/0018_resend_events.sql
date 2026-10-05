-- AIDEV-NOTE: Receipts and correlation constraints share the transaction with all delivery/suppression effects.
CREATE TABLE resend_event_receipts (
 owner TEXT NOT NULL, credential_id TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 intent_id TEXT NOT NULL, provider_id TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(owner,credential_id,event_id), FOREIGN KEY(owner,intent_id) REFERENCES send_intents(owner,id)
);
CREATE TABLE resend_message_links (
 owner TEXT NOT NULL, credential_id TEXT NOT NULL, provider_id TEXT NOT NULL, intent_id TEXT NOT NULL,
 PRIMARY KEY(owner,credential_id,provider_id), UNIQUE(owner,intent_id),
 FOREIGN KEY(owner,intent_id) REFERENCES send_intents(owner,id)
);
CREATE TRIGGER resend_receipt_integrity BEFORE INSERT ON resend_event_receipts
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM resend_event_receipts WHERE owner=NEW.owner AND credential_id=NEW.credential_id
 AND event_id=NEW.event_id AND payload_hash<>NEW.payload_hash) THEN RAISE(ABORT,'event_conflict') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM send_intents i JOIN send_bindings b ON b.owner=i.owner AND b.intent_id=i.id
 WHERE i.owner=NEW.owner AND i.id=NEW.intent_id AND b.provider='resend' AND b.credential_id=NEW.credential_id
 AND i.status IN ('dispatching','unknown','accepted') AND (i.provider_id IS NULL OR i.provider_id=NEW.provider_id))
 THEN RAISE(ABORT,'event_correlation_failed') END;
END;
CREATE TRIGGER resend_link_integrity BEFORE INSERT ON resend_message_links
WHEN EXISTS(SELECT 1 FROM resend_message_links WHERE owner=NEW.owner AND credential_id=NEW.credential_id
 AND provider_id=NEW.provider_id AND intent_id<>NEW.intent_id)
 OR EXISTS(SELECT 1 FROM resend_message_links WHERE owner=NEW.owner AND intent_id=NEW.intent_id
 AND (credential_id<>NEW.credential_id OR provider_id<>NEW.provider_id))
BEGIN SELECT RAISE(ABORT,'event_correlation_failed'); END;
-- Rollback requires explicit approval to discard receipt history: drop triggers, then both tables.
