-- AIDEV-NOTE: Empty rollback is reversible; populated quarantine needs explicit reconciliation, never automatic deletion.
-- AIDEV-NOTE: Lock parent then ledger/metadata so a concurrent writer cannot commit after the emptiness check.
LOCK TABLE app.drafts, app_drafts_private.attachment_stage_operations, app.draft_attachments IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM app_drafts_private.attachment_stage_operations) OR
    EXISTS (SELECT 1 FROM app.draft_attachments) THEN
    RAISE EXCEPTION 'preserve draft attachment quarantine before rollback';
  END IF;
END $$;
DROP TRIGGER retire_draft_attachment_operations ON app.drafts;
DROP FUNCTION app_drafts_private.retire_deleted_draft_attachments();
DROP FUNCTION app.record_draft_attachment_scan(uuid, text, uuid, integer, text);
DROP FUNCTION app.claim_draft_attachment_scan(uuid, uuid);
DROP FUNCTION app.due_draft_attachment_scans(integer);
DROP FUNCTION app.list_draft_attachments(uuid, uuid);
DROP FUNCTION app.finalize_draft_attachment(text, uuid, uuid, uuid, text, uuid);
DROP FUNCTION app.reserve_draft_attachment(text, uuid, uuid, uuid, text, uuid, uuid, text, text, integer, text);
DROP FUNCTION app_drafts_private.attachment_stage_result(app_drafts_private.attachment_stage_operations, text);
DROP FUNCTION app_drafts_private.lock_attachment_draft(text, uuid, uuid, uuid);
DROP TABLE app.draft_attachments;
DROP TABLE app_drafts_private.attachment_stage_operations;
