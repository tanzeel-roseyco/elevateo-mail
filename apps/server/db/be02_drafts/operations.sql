CREATE FUNCTION app.draft_operation(p_mailbox uuid, p_draft uuid, p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_operation app_drafts_private.operations%ROWTYPE;
  v_base jsonb := jsonb_build_object('operation_id', p_operation, 'mailbox_id', p_mailbox, 'draft_id', p_draft);
BEGIN
  IF p_draft IS NULL OR p_operation IS NULL OR NOT app.draft_scope(p_mailbox, p_draft) THEN
    RETURN jsonb_build_object('code', 'not_available');
  END IF;
  SELECT * INTO v_operation FROM app_drafts_private.operations
   WHERE organization_id = app.context_uuid('app.org_id') AND actor_id = app.context_uuid('app.user_id')
     AND operation_id = p_operation;
  IF NOT FOUND THEN RETURN v_base || jsonb_build_object('outcome', 'unknown'); END IF;
  IF v_operation.mailbox_id <> p_mailbox OR v_operation.draft_id <> p_draft THEN
    RETURN jsonb_build_object('code', 'not_available');
  END IF;
  -- AIDEV-NOTE: Clock comparison, not maintenance timing, defines the exact seven-day detail cutoff.
  IF clock_timestamp() >= v_operation.detail_expires_at THEN
    RETURN v_base || jsonb_build_object('outcome', 'expired');
  END IF;
  RETURN v_base || v_operation.detail || jsonb_build_object(
    'recorded_at', to_char(v_operation.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'detail_expires_at', to_char(v_operation.detail_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END
$$;

-- AIDEV-NOTE: Worker-invoked bounded compaction erases detail only; permanent bindings/digests cannot execute again.
CREATE FUNCTION app.compact_draft_operations(p_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, app, app_drafts_private AS $$
DECLARE
  v_count integer;
  v_cutoff timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid compaction limit' USING ERRCODE = '22023';
  END IF;
  -- AIDEV-NOTE: One cutoff bounds the expiry index scan; lookup still enforces wall-clock expiry independently.
  v_cutoff := clock_timestamp();
  WITH batch AS (
    SELECT organization_id, actor_id, operation_id FROM app_drafts_private.operations
     WHERE detail IS NOT NULL AND detail_expires_at <= v_cutoff
     ORDER BY detail_expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE app_drafts_private.operations operation SET detail = NULL FROM batch
   WHERE operation.organization_id = batch.organization_id AND operation.actor_id = batch.actor_id
     AND operation.operation_id = batch.operation_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
