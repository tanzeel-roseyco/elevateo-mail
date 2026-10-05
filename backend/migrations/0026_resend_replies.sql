-- AIDEV-NOTE: Hashes index reply bearer addresses; immutable envelopes retain the actual outgoing header.
CREATE TABLE resend_reply_tokens (
 owner TEXT NOT NULL, intent_id TEXT NOT NULL, credential_id TEXT NOT NULL, domain TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, PRIMARY KEY(owner,intent_id),
 FOREIGN KEY(owner,intent_id) REFERENCES send_intents(owner,id)
);
CREATE TABLE resend_reply_receipts (
 owner TEXT NOT NULL, credential_id TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
 intent_id TEXT NOT NULL, received_id TEXT NOT NULL, at INTEGER NOT NULL,
 PRIMARY KEY(owner,credential_id,event_id), FOREIGN KEY(owner,intent_id) REFERENCES send_intents(owner,id)
);
CREATE TRIGGER resend_reply_replay BEFORE INSERT ON resend_reply_receipts
WHEN EXISTS(SELECT 1 FROM resend_reply_receipts WHERE owner=NEW.owner AND credential_id=NEW.credential_id
 AND event_id=NEW.event_id AND payload_hash<>NEW.payload_hash)
BEGIN SELECT RAISE(ABORT,'reply_event_conflict'); END;
CREATE TRIGGER immutable_resend_reply_token BEFORE UPDATE ON resend_reply_tokens
BEGIN SELECT RAISE(ABORT,'immutable_reply_token'); END;
-- Rollback with dispatch stopped: drop both triggers, resend_reply_receipts, then resend_reply_tokens.
