-- AIDEV-NOTE: Binding is separate from credentials; verified admission is not permission to send.
CREATE TABLE resend_senders (
 owner TEXT NOT NULL,
 mailbox_id TEXT NOT NULL,
 credential_id TEXT NOT NULL,
 credential_revision INTEGER NOT NULL CHECK(credential_revision>=1),
 domain_id TEXT NOT NULL,
 domain_name TEXT NOT NULL,
 PRIMARY KEY(owner,mailbox_id),
 FOREIGN KEY(owner,mailbox_id) REFERENCES mailboxes(owner,id),
 FOREIGN KEY(owner,credential_id) REFERENCES resend_credentials(owner,id)
);
CREATE INDEX resend_sender_credential ON resend_senders(owner,credential_id);
-- AIDEV-NOTE: Rotation and revocation invalidate verification/permission in the same credential transaction.
CREATE TRIGGER resend_credential_disconnect AFTER UPDATE OF sealed,revision ON resend_credentials
BEGIN
 UPDATE mailboxes SET connected=0,verified=0,send_enabled=0,ai_send=0 WHERE owner=NEW.owner
 AND id IN (SELECT mailbox_id FROM resend_senders WHERE owner=NEW.owner AND credential_id=NEW.id);
END;
-- Rollback requires explicit confirmation: DROP TRIGGER resend_credential_disconnect; DROP TABLE resend_senders;
