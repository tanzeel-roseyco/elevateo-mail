-- AIDEV-NOTE: Read projections expose no object keys, tokens or digests; current compose ownership is always required.
CREATE OR REPLACE FUNCTION app.list_draft_attachments(p_mailbox uuid, p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_org uuid := app.context_uuid('app.org_id');
  v_actor uuid := app.context_uuid('app.user_id');
  v_items jsonb;
BEGIN
  IF p_mailbox IS NULL OR p_draft IS NULL THEN RETURN jsonb_build_object('code', 'request_invalid'); END IF;
  IF NOT app.draft_scope(p_mailbox, p_draft) OR NOT EXISTS (SELECT 1 FROM app.drafts
    WHERE id = p_draft AND organization_id = v_org AND mailbox_id = p_mailbox AND actor_id = v_actor) THEN
    RETURN jsonb_build_object('code', 'not_available');
  END IF;
  -- AIDEV-NOTE: Failed/uncertain uploads retain their slot and appear removable without exposing private references.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', operation.attachment_id, 'filename', operation.filename,
    'content_type', operation.content_type, 'byte_size', operation.byte_size,
    'status', COALESCE(attachment.scan_status, 'scan_failed')) ORDER BY operation.reserved_at), '[]'::jsonb)
    INTO v_items FROM app_drafts_private.attachment_stage_operations operation
    LEFT JOIN app.draft_attachments attachment ON attachment.id=operation.attachment_id
    WHERE operation.organization_id=v_org AND operation.mailbox_id=p_mailbox AND operation.draft_id=p_draft
      AND operation.actor_id=v_actor AND operation.stage_state IN ('reserved','committed');
  RETURN jsonb_build_object('items', v_items);
END
$$;
