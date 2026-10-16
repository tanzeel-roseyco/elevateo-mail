-- AIDEV-NOTE: Reuse draft lock order, but require an existing editable draft; draft_scope permits absent V1 drafts.
CREATE FUNCTION app_drafts_private.lock_attachment_draft(
  p_session_digest text, p_mailbox uuid, p_draft uuid, p_operation uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_org uuid := app.context_uuid('app.org_id');
  v_actor uuid := app.context_uuid('app.user_id');
  v_guard jsonb;
  v_draft app.drafts%ROWTYPE;
BEGIN
  v_guard := app_auth.assert_protected_write(p_session_digest, v_actor);
  IF v_guard->>'status' IS DISTINCT FROM 'ok' THEN
    RETURN CASE v_guard->>'status'
      WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'refresh_uncertain' THEN 'unauthenticated'
      WHEN 'not_found' THEN 'not_available' WHEN 'context_changed' THEN 'context_changed'
      ELSE 'temporarily_unavailable' END;
  END IF;
  IF p_mailbox IS NULL OR p_draft IS NULL OR p_operation IS NULL THEN RETURN 'request_invalid'; END IF;
  IF NOT app.draft_scope(p_mailbox, p_draft) THEN RETURN 'not_available'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'draft-attachment-operation:' || v_org || ':' || v_actor || ':' || p_operation, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('draft-id:' || p_draft, 0));
  IF NOT app.draft_scope(p_mailbox, p_draft) THEN RETURN 'not_available'; END IF;
  SELECT * INTO v_draft FROM app.drafts WHERE id = p_draft AND organization_id = v_org
    AND mailbox_id = p_mailbox AND actor_id = v_actor FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_available'; END IF;
  IF v_draft.state <> 'editable' THEN RETURN 'draft_consumed'; END IF;
  RETURN NULL;
END
$$;
-- AIDEV-NOTE: Internal staging results contain private references; HTTP projections must use metadata(), never this.
CREATE FUNCTION app_drafts_private.attachment_stage_result(
  p_row app_drafts_private.attachment_stage_operations, p_status text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('stage_state', p_status, 'attachment_id', p_row.attachment_id,
    'operation_id', p_row.operation_id, 'reservation_token', p_row.reservation_token,
    'object_key', p_row.object_key, 'filename', p_row.filename, 'content_type', p_row.content_type,
    'byte_size', p_row.byte_size, 'sha256', p_row.sha256)
$$;
