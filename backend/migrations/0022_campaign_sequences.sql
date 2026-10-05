-- AIDEV-NOTE: Membership is immutable; existing ledger policy and quota guards still govern every step.
CREATE TABLE campaign_sequences (
 owner TEXT NOT NULL, id TEXT NOT NULL, campaign_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, mailbox_id TEXT NOT NULL, recipient TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(owner,id), UNIQUE(owner,idempotency_key),
 FOREIGN KEY(owner,campaign_id) REFERENCES campaigns(owner,id),
 FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id)
);
CREATE INDEX sequences_campaign_page ON campaign_sequences(owner,campaign_id,id);
CREATE TABLE sequence_steps (
 owner TEXT NOT NULL, sequence_id TEXT NOT NULL, step INTEGER NOT NULL CHECK(step BETWEEN 0 AND 2),
 intent_id TEXT NOT NULL, predecessor_id TEXT,
 PRIMARY KEY(owner,sequence_id,step), UNIQUE(owner,intent_id),
 CHECK((step=0 AND predecessor_id IS NULL) OR (step>0 AND predecessor_id IS NOT NULL)),
 FOREIGN KEY(owner,sequence_id) REFERENCES campaign_sequences(owner,id),
 FOREIGN KEY(owner,intent_id) REFERENCES send_intents(owner,id),
 FOREIGN KEY(owner,predecessor_id) REFERENCES send_intents(owner,id)
);
CREATE TRIGGER immutable_sequence BEFORE UPDATE ON campaign_sequences
BEGIN SELECT RAISE(ABORT,'immutable_sequence'); END;
CREATE TRIGGER immutable_sequence_step BEFORE UPDATE ON sequence_steps
BEGIN SELECT RAISE(ABORT,'immutable_sequence_step'); END;
-- AIDEV-NOTE: Real follow-ups remain disabled until a verified inbound reply channel can stop them reliably.
CREATE TRIGGER sequence_dispatch_guard BEFORE UPDATE OF status ON send_intents
WHEN NEW.status='dispatching' AND EXISTS(SELECT 1 FROM sequence_steps s WHERE s.owner=NEW.owner AND s.intent_id=NEW.id)
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM send_bindings b WHERE b.owner=NEW.owner AND b.intent_id=NEW.id AND b.provider='fake')
 THEN RAISE(ABORT,'sequence_live_disabled') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sequence_steps s WHERE s.owner=NEW.owner AND s.intent_id=NEW.id
 AND s.predecessor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM send_intents p
 WHERE p.owner=s.owner AND p.id=s.predecessor_id AND p.status='accepted'))
 THEN RAISE(ABORT,'sequence_predecessor_pending') END;
END;
-- Rollback with dispatch stopped: drop sequence_dispatch_guard, immutable_sequence_step, immutable_sequence,
-- then sequence_steps and campaign_sequences. Preserve their linked intents for audit.
-- AIDEV-NOTE: Disabled real sequences must not reserve quota while awaiting an inbound-channel implementation.
CREATE TRIGGER sequence_approval_guard BEFORE UPDATE OF status ON send_intents
WHEN NEW.status='pending' AND EXISTS(SELECT 1 FROM sequence_steps s WHERE s.owner=NEW.owner AND s.intent_id=NEW.id)
 AND NOT EXISTS(SELECT 1 FROM send_bindings b WHERE b.owner=NEW.owner AND b.intent_id=NEW.id AND b.provider='fake')
BEGIN SELECT RAISE(ABORT,'sequence_live_disabled'); END;
-- Rollback also drops sequence_approval_guard before dropping sequence_steps.
