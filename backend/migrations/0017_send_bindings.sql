-- AIDEV-NOTE: Snapshot at insertion, not approval: later connection changes cannot upgrade a simulated draft.
CREATE TABLE send_bindings (
 owner TEXT NOT NULL, intent_id TEXT NOT NULL, provider TEXT NOT NULL, address TEXT NOT NULL,
 credential_id TEXT, credential_revision INTEGER, domain_id TEXT, domain_name TEXT,
 PRIMARY KEY(owner,intent_id),
 FOREIGN KEY(owner,intent_id) REFERENCES send_intents(owner,id) ON DELETE CASCADE
);
CREATE TRIGGER snapshot_send_binding AFTER INSERT ON send_intents
BEGIN
 INSERT INTO send_bindings(owner,intent_id,provider,address,credential_id,credential_revision,domain_id,domain_name)
 SELECT NEW.owner,NEW.id,m.provider,m.address,s.credential_id,s.credential_revision,s.domain_id,s.domain_name
 FROM mailboxes m LEFT JOIN resend_senders s ON s.owner=m.owner AND s.mailbox_id=m.id AND m.provider='resend'
 WHERE m.owner=NEW.owner AND m.id=NEW.mailbox_id;
END;
CREATE TRIGGER immutable_send_binding BEFORE UPDATE ON send_bindings
BEGIN SELECT RAISE(ABORT,'immutable_send_binding'); END;
-- AIDEV-NOTE: Existing intents have no trusted snapshot and fail closed; no live authorization is backfilled.
CREATE TRIGGER bound_send_guard BEFORE UPDATE OF status ON send_intents
WHEN NEW.status IN ('pending','dispatching')
BEGIN
 SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM send_bindings b JOIN mailboxes m ON m.owner=b.owner AND m.id=NEW.mailbox_id
 WHERE b.owner=NEW.owner AND b.intent_id=NEW.id AND b.provider=m.provider AND b.address=m.address
 AND b.address=json_extract(NEW.envelope,'$.from') AND (b.provider='fake' OR (b.provider='resend' AND EXISTS(
 SELECT 1 FROM resend_senders s JOIN resend_credentials c ON c.owner=s.owner AND c.id=s.credential_id
 WHERE s.owner=b.owner AND s.mailbox_id=NEW.mailbox_id AND s.credential_id=b.credential_id
 AND s.credential_revision=b.credential_revision AND c.revision=b.credential_revision AND c.sealed IS NOT NULL
 AND s.domain_id=b.domain_id AND s.domain_name=b.domain_name))))
 THEN RAISE(ABORT,'send_binding_changed') END;
END;
-- Rollback only with dispatch stopped: drop bound_send_guard, immutable_send_binding, snapshot_send_binding, then send_bindings.
