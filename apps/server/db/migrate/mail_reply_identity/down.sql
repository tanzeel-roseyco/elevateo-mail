-- AIDEV-NOTE: Metadata rollback is explicit; application binaries must be rolled back with this migration.
DROP FUNCTION app.ingest_imap_mail_with_identity(uuid,integer,bigint,bigint,text,jsonb,jsonb,text,text,jsonb,text,uuid);
DROP FUNCTION app_send_private.read_draft_binding(uuid,uuid);
ALTER FUNCTION app_send_private.read_draft_binding_without_rfc(uuid,uuid) RENAME TO read_draft_binding;
DROP POLICY reply_identity_owner_update ON app.messages;
DROP POLICY reply_identity_owner_read ON app.messages;
ALTER TABLE app.messages DROP COLUMN rfc_message_id;
