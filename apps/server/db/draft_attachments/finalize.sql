-- AIDEV-NOTE: Network I/O is over; fresh guarded authorization precedes committing quarantined pending-scan metadata.
CREATE FUNCTION app.finalize_draft_attachment(p_session_digest text, p_mailbox uuid, p_draft uuid,
  p_operation uuid, p_request_digest text, p_reservation_token uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_org uuid := app.context_uuid('app.org_id');
  v_actor uuid := app.context_uuid('app.user_id');
  v_code text;
  v_row app_drafts_private.attachment_stage_operations%ROWTYPE;
  v_now timestamptz;
BEGIN
  v_code := app_drafts_private.lock_attachment_draft(p_session_digest, p_mailbox, p_draft, p_operation);
  IF v_code IS NOT NULL THEN RETURN jsonb_build_object('code', v_code); END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' OR p_reservation_token IS NULL THEN
    RETURN jsonb_build_object('code', 'request_invalid');
  END IF;
  SELECT * INTO v_row FROM app_drafts_private.attachment_stage_operations
    WHERE organization_id = v_org AND actor_id = v_actor AND operation_id = p_operation FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_available'); END IF;
  IF (v_row.mailbox_id, v_row.draft_id, v_row.request_digest, v_row.reservation_token) IS DISTINCT FROM
     (p_mailbox, p_draft, p_request_digest, p_reservation_token) THEN
    RETURN jsonb_build_object('code', 'operation_mismatch');
  END IF;
  IF v_row.stage_state = 'aborted' THEN RETURN jsonb_build_object('code', 'operation_retired'); END IF;
  IF v_row.stage_state = 'reserved' THEN
    v_now := clock_timestamp();
    INSERT INTO app.draft_attachments
      (id, organization_id, mailbox_id, draft_id, actor_id, scan_status, created_at, scan_updated_at)
      VALUES (v_row.attachment_id, v_org, p_mailbox, p_draft, v_actor, 'pending_scan', v_now, v_now);
    UPDATE app_drafts_private.attachment_stage_operations SET stage_state = 'committed', completed_at = v_now
      WHERE organization_id = v_org AND actor_id = v_actor AND operation_id = p_operation;
  END IF;
  RETURN jsonb_build_object('attachment_id', v_row.attachment_id, 'operation_id', p_operation,
    'stage_state', 'committed');
END
$$;
