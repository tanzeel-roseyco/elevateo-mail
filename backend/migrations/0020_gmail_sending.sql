-- AIDEV-NOTE: Refresh changes token revision; grant epochs and permission generations invalidate approvals.
ALTER TABLE provider_credentials ADD COLUMN grant_epoch INTEGER NOT NULL DEFAULT 1;
CREATE TABLE gmail_send_permissions (
 owner TEXT NOT NULL, mailbox_id TEXT NOT NULL, credential_id TEXT NOT NULL, grant_epoch INTEGER NOT NULL,
 generation INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner,mailbox_id),
 FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id),
 FOREIGN KEY(owner,credential_id) REFERENCES provider_credentials(owner,id)
);
CREATE TRIGGER gmail_permission_generation AFTER UPDATE OF send_enabled ON mailboxes
WHEN NEW.provider='gmail' AND OLD.send_enabled<>NEW.send_enabled
BEGIN
 UPDATE gmail_send_permissions SET generation=generation+1 WHERE owner=NEW.owner AND mailbox_id=NEW.id;
END;
CREATE TRIGGER gmail_grant_revoked AFTER UPDATE OF sealed ON provider_credentials
WHEN NEW.provider='gmail' AND OLD.sealed IS NOT NULL AND NEW.sealed IS NULL
BEGIN
 UPDATE provider_credentials SET grant_epoch=grant_epoch+1 WHERE owner=NEW.owner AND id=NEW.id;
END;
CREATE TRIGGER gmail_grant_changed AFTER UPDATE OF grant_epoch ON provider_credentials
WHEN NEW.provider='gmail' AND OLD.grant_epoch<>NEW.grant_epoch
BEGIN
 UPDATE mailboxes SET send_enabled=0,ai_send=0 WHERE owner=NEW.owner AND provider='gmail' AND subject=NEW.subject;
END;
ALTER TABLE send_bindings ADD COLUMN grant_epoch INTEGER;
ALTER TABLE send_bindings ADD COLUMN permission_generation INTEGER;
DROP TRIGGER snapshot_send_binding;
CREATE TRIGGER snapshot_send_binding AFTER INSERT ON send_intents
BEGIN
 INSERT INTO send_bindings(owner,intent_id,provider,address,credential_id,credential_revision,domain_id,domain_name,grant_epoch,permission_generation)
 SELECT NEW.owner,NEW.id,m.provider,m.address,CASE WHEN m.provider='gmail' THEN g.credential_id ELSE s.credential_id END,
 s.credential_revision,s.domain_id,s.domain_name,g.grant_epoch,g.generation
 FROM mailboxes m LEFT JOIN resend_senders s ON s.owner=m.owner AND s.mailbox_id=m.id AND m.provider='resend'
 LEFT JOIN gmail_send_permissions g ON g.owner=m.owner AND g.mailbox_id=m.id AND m.provider='gmail'
 WHERE m.owner=NEW.owner AND m.id=NEW.mailbox_id;
END;
DROP TRIGGER bound_send_guard;
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
 AND s.domain_id=b.domain_id AND s.domain_name=b.domain_name)) OR (b.provider='gmail' AND NEW.kind='manual' AND EXISTS(
 SELECT 1 FROM gmail_send_permissions g JOIN provider_credentials c ON c.owner=g.owner AND c.id=g.credential_id
 WHERE g.owner=b.owner AND g.mailbox_id=NEW.mailbox_id AND g.credential_id=b.credential_id
 AND g.grant_epoch=b.grant_epoch AND c.grant_epoch=b.grant_epoch AND g.generation=b.permission_generation
 AND c.provider='gmail' AND c.subject=m.subject AND c.sealed IS NOT NULL))))
 THEN RAISE(ABORT,'send_binding_changed') END;
END;
-- Rollback with dispatch stopped: restore 0017 triggers; drop Gmail triggers/table and added columns.
