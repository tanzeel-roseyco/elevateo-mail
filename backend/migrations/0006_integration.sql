-- AIDEV-NOTE: Active connections use slots; historical quota remains charged across replacement mailboxes.
ALTER TABLE mailboxes ADD COLUMN ai_draft INTEGER NOT NULL DEFAULT 0 CHECK(ai_draft IN (0,1));
ALTER TABLE send_intents ADD COLUMN correlation_id TEXT;
ALTER TABLE send_intents ADD COLUMN reconcile_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE send_intents ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE send_intents ADD COLUMN envelope_hash TEXT;
CREATE TRIGGER immutable_envelope_hash BEFORE UPDATE OF envelope_hash ON send_intents
BEGIN SELECT RAISE(ABORT,'immutable_revision'); END;
CREATE INDEX reconciliation_due ON send_intents(status,reconcile_at,id);
CREATE INDEX owner_quota ON send_intents(owner,status,dispatch_at);
CREATE INDEX stale_claims ON send_intents(status,updated_at,id);
CREATE INDEX expired_approvals ON send_intents(status,approval_expires_at,id);
DROP TRIGGER mailbox_cap;
CREATE TRIGGER mailbox_cap BEFORE INSERT ON mailboxes
WHEN NEW.connected=1 AND (SELECT count(*) FROM mailboxes WHERE owner=NEW.owner AND connected=1)>=10
 AND NOT EXISTS(SELECT 1 FROM mailboxes WHERE owner=NEW.owner AND provider=NEW.provider AND subject=NEW.subject)
BEGIN SELECT RAISE(ABORT,'mailbox_limit'); END;
CREATE TRIGGER reconnect_cap BEFORE UPDATE OF connected ON mailboxes
WHEN NEW.connected=1 AND OLD.connected=0 AND (SELECT count(*) FROM mailboxes WHERE owner=NEW.owner AND connected=1)>=10
BEGIN SELECT RAISE(ABORT,'mailbox_limit'); END;
CREATE TRIGGER owner_send_cap BEFORE UPDATE OF status ON send_intents
WHEN NEW.status IN ('pending','dispatching')
BEGIN
 SELECT CASE WHEN NEW.recipient_count+COALESCE((SELECT sum(recipient_count) FROM (
 SELECT recipient_count FROM send_intents WHERE owner=NEW.owner AND id<>NEW.id AND status IN ('pending','dispatching','unknown')
 UNION ALL SELECT recipient_count FROM send_intents WHERE owner=NEW.owner AND id<>NEW.id
 AND status='accepted' AND dispatch_at>NEW.updated_at-86400000)),0)>300 THEN RAISE(ABORT,'owner_quota_exceeded') END;
END;
