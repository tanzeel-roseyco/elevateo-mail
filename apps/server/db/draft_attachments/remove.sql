-- AIDEV-NOTE: Retire authority before exposing the free slot; private blobs remain quarantined for cleanup.
CREATE FUNCTION app.remove_draft_attachment(p_digest text,p_mailbox uuid,p_draft uuid,p_attachment uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,app,app_drafts_private AS $$
DECLARE code text;
BEGIN
 code := app_drafts_private.lock_attachment_draft(p_digest,p_mailbox,p_draft,p_attachment);
 IF code IS NOT NULL THEN RETURN jsonb_build_object('code',code); END IF;
 UPDATE app_drafts_private.attachment_stage_operations SET stage_state='aborted',
   completed_at=COALESCE(completed_at,clock_timestamp())
 WHERE organization_id=app.context_uuid('app.org_id') AND actor_id=app.context_uuid('app.user_id')
   AND mailbox_id=p_mailbox AND draft_id=p_draft AND attachment_id=p_attachment;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_available'); END IF;
 DELETE FROM app.draft_attachments WHERE id=p_attachment AND organization_id=app.context_uuid('app.org_id')
   AND actor_id=app.context_uuid('app.user_id') AND mailbox_id=p_mailbox AND draft_id=p_draft;
 RETURN jsonb_build_object('removed',true);
END $$;
REVOKE ALL ON FUNCTION app.remove_draft_attachment(text,uuid,uuid,uuid) FROM PUBLIC,elevateo_app_read,elevateo_worker;
GRANT EXECUTE ON FUNCTION app.remove_draft_attachment(text,uuid,uuid,uuid) TO elevateo_api;
