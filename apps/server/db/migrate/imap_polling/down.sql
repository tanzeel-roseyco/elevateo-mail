DROP FUNCTION app.finish_imap_poll(uuid,integer,uuid,text);
DROP FUNCTION app.lease_due_imap_account();
DROP FUNCTION app.require_imap_poll_lease(uuid,integer,uuid);
DROP TRIGGER imap_poll_binding_change ON app.inbound_imap_accounts;
DROP FUNCTION app.invalidate_imap_poll_lease();
DROP INDEX app.imap_poll_due;
ALTER TABLE app.inbound_imap_accounts DROP CONSTRAINT imap_poll_lease_complete,
  DROP COLUMN poll_enabled, DROP COLUMN poll_next_at, DROP COLUMN poll_failures,
  DROP COLUMN poll_lease_token, DROP COLUMN poll_lease_until, DROP COLUMN poll_lease_version;
