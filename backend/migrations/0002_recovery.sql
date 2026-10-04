-- AIDEV-NOTE: Expiring approvals and a global restore pause default to safe; no migration enables real sends.
ALTER TABLE send_intents ADD COLUMN approval_expires_at INTEGER;
CREATE TRIGGER approval_expiry BEFORE UPDATE OF status ON send_intents
WHEN NEW.status IN ('pending','dispatching') AND (NEW.approval_expires_at IS NULL OR NEW.approval_expires_at<=NEW.updated_at)
BEGIN SELECT RAISE(ABORT,'approval_expired'); END;
CREATE TABLE runtime_controls (id INTEGER PRIMARY KEY CHECK(id=1), dispatch_paused INTEGER NOT NULL CHECK(dispatch_paused IN (0,1)));
INSERT INTO runtime_controls VALUES(1,1);
CREATE TRIGGER restore_pause BEFORE UPDATE OF status ON send_intents
WHEN NEW.status='dispatching' AND COALESCE((SELECT dispatch_paused FROM runtime_controls WHERE id=1),1)=1
BEGIN SELECT RAISE(ABORT,'dispatch_paused'); END;
CREATE TABLE unsubscribe_tokens (
 token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL, email TEXT NOT NULL,
 FOREIGN KEY(owner,email) REFERENCES contacts(owner,email)
);
CREATE TABLE event_connections (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, secret_hash TEXT NOT NULL,
 FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id)
);
