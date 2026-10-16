-- AIDEV-NOTE: Commit reservation before uploading; an existing reservation permits exact readback, never another PUT.
CREATE FUNCTION app.reserve_draft_attachment(p_session_digest text, p_mailbox uuid, p_draft uuid,
  p_operation uuid, p_request_digest text, p_attachment uuid, p_reservation_token uuid,
  p_filename text, p_content_type text, p_byte_size integer, p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_org uuid := app.context_uuid('app.org_id');
  v_actor uuid := app.context_uuid('app.user_id');
  v_code text;
  v_row app_drafts_private.attachment_stage_operations%ROWTYPE;
BEGIN
  v_code := app_drafts_private.lock_attachment_draft(p_session_digest, p_mailbox, p_draft, p_operation);
  IF v_code IS NOT NULL THEN RETURN jsonb_build_object('code', v_code); END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' OR p_attachment IS NULL OR
    p_reservation_token IS NULL OR p_filename IS NULL OR octet_length(p_filename) NOT BETWEEN 1 AND 255 OR
    p_filename <> btrim(p_filename) OR p_filename IN ('.', '..') OR p_filename ~ '[[:cntrl:]/]' OR
    strpos(p_filename, chr(92)) <> 0 OR p_content_type IS NULL OR
    p_content_type NOT IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain') OR
    p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 1048576 OR p_sha256 IS NULL OR
    p_sha256 !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('code', 'request_invalid'); END IF;
  SELECT * INTO v_row FROM app_drafts_private.attachment_stage_operations
    WHERE organization_id = v_org AND actor_id = v_actor AND operation_id = p_operation;
  IF FOUND THEN
    IF (v_row.mailbox_id, v_row.draft_id, v_row.request_digest, v_row.filename,
        v_row.content_type, v_row.byte_size, v_row.sha256) IS DISTINCT FROM
       (p_mailbox, p_draft, p_request_digest, p_filename, p_content_type, p_byte_size, p_sha256) THEN
      RETURN jsonb_build_object('code', 'operation_mismatch');
    END IF;
    IF v_row.stage_state = 'aborted' THEN RETURN jsonb_build_object('code', 'operation_retired'); END IF;
    RETURN app_drafts_private.attachment_stage_result(v_row,
      CASE v_row.stage_state WHEN 'reserved' THEN 'reconcile' ELSE 'committed' END);
  END IF;
  IF EXISTS (SELECT 1 FROM app_drafts_private.attachment_stage_operations
    WHERE organization_id = v_org AND mailbox_id = p_mailbox AND draft_id = p_draft
      AND stage_state IN ('reserved', 'committed')) THEN
    RETURN jsonb_build_object('code', 'attachment_slot_occupied');
  END IF;
  INSERT INTO app_drafts_private.attachment_stage_operations
    (organization_id, actor_id, operation_id, mailbox_id, draft_id, request_digest, attachment_id,
      reservation_token, object_key, filename, content_type, byte_size, sha256, stage_state, reserved_at)
    VALUES (v_org, v_actor, p_operation, p_mailbox, p_draft, p_request_digest, p_attachment,
      p_reservation_token, 'drafts/' || v_org::text || '/' || p_attachment::text, p_filename,
      p_content_type, p_byte_size, p_sha256, 'reserved', clock_timestamp()) RETURNING * INTO v_row;
  RETURN app_drafts_private.attachment_stage_result(v_row, 'reserved');
END
$$;
