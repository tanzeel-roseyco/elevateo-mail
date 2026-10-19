-- AIDEV-NOTE: Signed receipts are durable before acknowledgement; leases make crashed workers replayable.
CREATE TABLE app.resend_webhook_events (
 event_id text PRIMARY KEY CHECK (event_id ~ '^msg_[A-Za-z0-9_-]{1,120}$'),
 body_digest text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','ignored')),
 lease uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempts integer NOT NULL DEFAULT 0, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz
);
CREATE INDEX resend_pending ON app.resend_webhook_events(next_attempt_at) WHERE status='pending';
CREATE TABLE app.resend_inbound_routes (
 address text PRIMARY KEY, organization_id uuid NOT NULL, mailbox_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT false,
 FOREIGN KEY(organization_id,mailbox_id) REFERENCES app.mailboxes(organization_id,id),
 CHECK(address ~ '^[^[:space:]@]+@[^[:space:]@]+$')
);
CREATE TABLE app.resend_inbound_receipts (
 email_id uuid PRIMARY KEY, organization_id uuid NOT NULL, mailbox_id uuid NOT NULL,
 thread_id uuid NOT NULL, message_id uuid NOT NULL, rfc_message_id text,
 FOREIGN KEY(organization_id,mailbox_id,thread_id,message_id)
 REFERENCES app.messages(organization_id,mailbox_id,thread_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE app.resend_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.resend_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.resend_inbound_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.resend_inbound_routes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.resend_inbound_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.resend_inbound_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY resend_event_owner ON app.resend_webhook_events TO elevateo_owner USING(true) WITH CHECK(true);
CREATE POLICY resend_route_owner ON app.resend_inbound_routes TO elevateo_owner USING(true) WITH CHECK(true);
CREATE POLICY resend_receipt_owner ON app.resend_inbound_receipts TO elevateo_owner USING(true) WITH CHECK(true);
REVOKE ALL ON app.resend_webhook_events,app.resend_inbound_routes,app.resend_inbound_receipts
 FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;

ALTER TABLE app.inbox_attachments DROP CONSTRAINT inbox_attachments_storage_key_check;
ALTER TABLE app.inbox_attachments ADD CONSTRAINT inbox_attachments_storage_key_check
 CHECK(storage_key IS NULL OR storage_key ~ '^quarantine/([0-9a-f-]{36}/[0-9a-f-]{36}|imap/[0-9a-f-]{36}/[0-9]+/[0-9]+/[0-9]+|resend/[0-9a-f-]{36}/[0-9]+)$');
