-- AIDEV-NOTE: Deletion retires upload authority atomically; quarantine identity and bytes survive for cleanup.
CREATE FUNCTION app_drafts_private.retire_deleted_draft_attachments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app_drafts_private AS $$
BEGIN
  UPDATE app_drafts_private.attachment_stage_operations
    SET stage_state = 'aborted', completed_at = COALESCE(completed_at, clock_timestamp())
    WHERE organization_id = OLD.organization_id AND mailbox_id = OLD.mailbox_id AND draft_id = OLD.id
      AND stage_state IN ('reserved', 'committed');
  RETURN OLD;
END
$$;
REVOKE ALL ON FUNCTION app_drafts_private.retire_deleted_draft_attachments()
  FROM PUBLIC, elevateo_app_read, elevateo_api, elevateo_worker;
CREATE TRIGGER retire_draft_attachment_operations AFTER DELETE ON app.drafts
  FOR EACH ROW EXECUTE FUNCTION app_drafts_private.retire_deleted_draft_attachments();
