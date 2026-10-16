-- AIDEV-NOTE: Account/epoch/UID is one terminal outcome; row locking serializes rejection against accepted receipts.
CREATE TABLE app.inbound_imap_rejections (
  account_id uuid NOT NULL REFERENCES app.inbound_imap_accounts(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL, mailbox_id uuid NOT NULL,
  uidvalidity bigint NOT NULL CHECK (uidvalidity BETWEEN 1 AND 4294967295),
  uid bigint NOT NULL CHECK (uid BETWEEN 1 AND 4294967295),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (reason IN ('invalid_mime','invalid_text','unsupported_mime','oversized_attachment','invalid_filename')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(account_id,uidvalidity,uid),
  FOREIGN KEY (organization_id,mailbox_id) REFERENCES app.mailboxes(organization_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.inbound_imap_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inbound_imap_rejections FORCE ROW LEVEL SECURITY;
CREATE POLICY imap_rejection_owner ON app.inbound_imap_rejections TO elevateo_owner USING (true) WITH CHECK (true);
REVOKE ALL ON app.inbound_imap_rejections FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;

CREATE FUNCTION app.guard_imap_receipt_state() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM app.inbound_imap_accounts WHERE id=NEW.account_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM app.inbound_imap_rejections
      WHERE account_id=NEW.account_id AND uidvalidity=NEW.uidvalidity AND uid=NEW.uid) THEN
    RAISE EXCEPTION 'imap terminal outcome conflict' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_imap_receipt_state() FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
CREATE TRIGGER imap_receipt_excludes_rejection BEFORE INSERT OR UPDATE ON app.inbound_imap_receipts
  FOR EACH ROW EXECUTE FUNCTION app.guard_imap_receipt_state();
