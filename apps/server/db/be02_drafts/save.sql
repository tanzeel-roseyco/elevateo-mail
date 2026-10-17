-- AIDEV-NOTE: Return terminal conflicts instead of raising: the caller must COMMIT their durable ledger record.
CREATE FUNCTION app.save_draft(p_session_digest text, p_mailbox uuid, p_draft uuid, p_operation uuid, p_digest text,
  p_expected integer, p_subject text, p_recipients jsonb, p_body text, p_reply uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_org uuid := app.context_uuid('app.org_id');
  v_actor uuid := app.context_uuid('app.user_id');
  v_draft app.drafts%ROWTYPE;
  v_operation app_drafts_private.operations%ROWTYPE;
  v_now timestamptz;
  v_detail jsonb;
  v_code text;
  v_version integer;
  v_guard jsonb;
BEGIN
  -- AIDEV-NOTE: The private transaction marker proves cookie-bound guards; custom GUCs alone are never write authority.
  v_guard := app_auth.assert_protected_write(p_session_digest, v_actor);
  IF v_guard->>'status' <> 'ok' THEN
    RETURN jsonb_build_object('code', CASE v_guard->>'status'
      WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'refresh_uncertain' THEN 'unauthenticated'
      WHEN 'not_found' THEN 'not_available' WHEN 'context_changed' THEN 'context_changed'
      ELSE 'temporarily_unavailable' END);
  END IF;
  IF p_mailbox IS NULL OR p_draft IS NULL OR p_operation IS NULL OR p_digest IS NULL OR
     p_digest !~ '^[0-9a-f]{64}$' OR p_expected IS NULL OR p_expected < 0 OR p_subject IS NULL OR
     char_length(p_subject) > 998 OR p_body IS NULL OR char_length(p_body) > 65536 OR
     p_recipients IS NULL OR NOT app.thread_recipients_valid(p_recipients) THEN
    RETURN jsonb_build_object('code', 'request_invalid');
  END IF;
  IF NOT app.draft_scope(p_mailbox, p_draft) THEN
    RETURN jsonb_build_object('code', 'not_available');
  END IF;
  -- AIDEV-NOTE: Generation guards are already held; operation then draft locks serialize cross-session duplicates.
  PERFORM pg_advisory_xact_lock(hashtextextended('draft-operation:' || v_org || ':' || v_actor || ':' || p_operation, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('draft-id:' || p_draft, 0));
  IF NOT app.draft_scope(p_mailbox, p_draft) THEN
    RETURN jsonb_build_object('code', 'not_available');
  END IF;
  SELECT * INTO v_operation FROM app_drafts_private.operations
   WHERE organization_id = v_org AND actor_id = v_actor AND operation_id = p_operation;
  v_now := clock_timestamp();
  IF FOUND THEN
    IF v_operation.mailbox_id <> p_mailbox OR v_operation.draft_id <> p_draft OR
       v_operation.payload_digest <> p_digest OR v_now >= v_operation.detail_expires_at THEN
      RETURN jsonb_build_object('code', 'operation_mismatch');
    END IF;
    IF v_operation.detail->>'outcome' = 'conflict' THEN
      RETURN jsonb_build_object('code', v_operation.detail->>'code');
    END IF;
    RETURN jsonb_build_object('draft_id', p_draft, 'operation_id', p_operation,
      'version', (v_operation.detail->>'version')::integer, 'state', 'editable');
  END IF;
  -- AIDEV-NOTE: Only a NEW operation validates the current reply; replay survives deletion of the original target.
  IF p_reply IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.threads
    WHERE organization_id = v_org AND mailbox_id = p_mailbox AND id = p_reply) THEN
    RETURN jsonb_build_object('code', 'not_available');
  END IF;
  SELECT * INTO v_draft FROM app.drafts WHERE id = p_draft FOR UPDATE;
  v_version := COALESCE(v_draft.version, 0);
  IF v_draft.state = 'consumed' THEN
    v_code := 'draft_consumed';
  ELSIF p_expected <> v_version THEN
    v_code := 'draft_conflict';
  ELSIF v_version = 2147483647 THEN
    RETURN jsonb_build_object('code', 'temporarily_unavailable');
  END IF;
  IF v_code IS NOT NULL THEN
    v_detail := jsonb_build_object('outcome', 'conflict', 'code', v_code,
      'expected_version', p_expected, 'current_version', v_version, 'state', v_draft.state);
  ELSE
    INSERT INTO app.drafts(id, organization_id, mailbox_id, actor_id, subject, recipients, body_text,
      reply_to_thread_id, version, state, created_at, updated_at)
      VALUES (p_draft, v_org, p_mailbox, v_actor, p_subject, p_recipients, p_body, p_reply, 1, 'editable', v_now, v_now)
      ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, recipients = EXCLUDED.recipients,
        body_text = EXCLUDED.body_text, reply_to_thread_id = EXCLUDED.reply_to_thread_id,
        version = app.drafts.version + 1, updated_at = v_now;
    v_version := v_version + 1;
    v_detail := jsonb_build_object('outcome', 'applied', 'expected_version', p_expected,
      'version', v_version, 'state', 'editable');
  END IF;
  INSERT INTO app_drafts_private.operations(organization_id, actor_id, operation_id, mailbox_id, draft_id,
    payload_digest, recorded_at, detail_expires_at, detail)
    VALUES (v_org, v_actor, p_operation, p_mailbox, p_draft, p_digest, v_now, v_now + interval '604800 seconds', v_detail);
  IF v_code IS NOT NULL THEN RETURN jsonb_build_object('code', v_code); END IF;
  RETURN jsonb_build_object('draft_id', p_draft, 'operation_id', p_operation, 'version', v_version, 'state', 'editable');
END
$$;
