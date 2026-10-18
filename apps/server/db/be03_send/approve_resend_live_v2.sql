-- AIDEV-NOTE: Session/generation precede policy/operation/draft locks; replay never reruns current readiness.
CREATE OR REPLACE FUNCTION app.approve_draft_send(p_session_digest text,p_mailbox uuid,p_draft uuid,p_operation uuid,
  p_expected integer,p_review_digest text,p_snapshot_bytes bytea,p_epoch uuid,p_outbound_mode text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  guard jsonb; binding jsonb; operation app_send_private.approval_operations; intent app_send_private.intents;
  org uuid; actor uuid; request_digest text; code text; send uuid; now_at timestamptz;
BEGIN
  IF p_mailbox IS NULL OR p_draft IS NULL OR p_operation IS NULL OR p_expected IS NULL OR p_expected < 1
    OR p_review_digest IS NULL OR p_review_digest !~ '^[0-9a-f]{64}$'
    OR (p_snapshot_bytes IS NOT NULL AND octet_length(p_snapshot_bytes) > 1048576)
    OR p_outbound_mode NOT IN ('held','mailpit','resend') THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  guard := app_auth.send_approval_guard(p_session_digest);
  IF guard->>'status' <> 'ok' THEN RETURN jsonb_build_object('code',CASE guard->>'status'
    WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'not_found' THEN 'not_available'
    WHEN 'context_changed' THEN 'context_changed' ELSE 'temporarily_unavailable' END); END IF;
  org := (guard->>'organization_id')::uuid; actor := (guard->>'user_id')::uuid;
  binding := app_send_private.read_draft_binding(p_mailbox,p_draft);
  IF binding ? 'code' THEN RETURN binding; END IF;
  -- Missing policy means no readiness, but must not erase a historical authorized result.
  PERFORM 1 FROM app_send_private.organization_policy WHERE organization_id = org FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('send-approval:' || org || ':' || actor || ':' || p_operation,0));
  binding := app_send_private.lock_draft_binding(p_session_digest,p_mailbox,p_draft);
  IF binding ? 'code' THEN RETURN binding; END IF;
  -- AIDEV-NOTE: Replay is a current authorization decision too; access/session expiry can occur during business waits.
  guard := app_auth.send_approval_guard(p_session_digest);
  IF guard->>'status' <> 'ok' THEN RETURN jsonb_build_object('code',CASE guard->>'status'
    WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'not_found' THEN 'not_available'
    WHEN 'context_changed' THEN 'context_changed' ELSE 'temporarily_unavailable' END); END IF;
  request_digest := encode(sha256(convert_to(app_send_private.compact_json(jsonb_build_array(
    'elevateo.approval.v2',p_mailbox,p_draft,p_expected,p_review_digest,p_outbound_mode)),'UTF8')),'hex');
  SELECT * INTO operation FROM app_send_private.approval_operations
    WHERE organization_id = org AND actor_id = actor AND operation_id = p_operation;
  IF FOUND THEN
    IF operation.request_digest <> request_digest OR operation.mailbox_id <> p_mailbox OR operation.draft_id <> p_draft THEN
      RETURN '{"code":"operation_mismatch"}'::jsonb;
    END IF;
    IF operation.outcome = 'conflict' THEN RETURN jsonb_build_object('code',operation.error_code); END IF;
    SELECT * INTO STRICT intent FROM app_send_private.intents WHERE send_id = operation.send_id;
    RETURN app_send_private.approval_result(intent);
  END IF;
  SELECT * INTO intent FROM app_send_private.intents WHERE draft_id = p_draft;
  IF FOUND THEN
    IF intent.draft_version = p_expected AND intent.review_digest = p_review_digest THEN
      PERFORM app_send_private.record_approval_operation(org,actor,p_operation,p_mailbox,p_draft,p_expected,
        request_digest,intent.send_id,NULL);
      RETURN app_send_private.approval_result(intent);
    END IF;
    code := 'draft_consumed';
  ELSIF binding->>'state' = 'consumed' THEN code := 'draft_consumed';
  ELSIF (binding->>'version')::integer <> p_expected THEN code := 'draft_conflict';
  ELSE
    binding := app_send_private.review_policy(binding);
    code := app_send_private.snapshot_validation(binding,p_snapshot_bytes,p_review_digest);
  END IF;
  IF code IS NOT NULL THEN
    PERFORM app_send_private.record_approval_operation(org,actor,p_operation,p_mailbox,p_draft,p_expected,request_digest,NULL,code);
    RETURN jsonb_build_object('code',code);
  END IF;
  IF p_epoch IS NULL THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
  IF p_outbound_mode='resend' THEN
    -- AIDEV-NOTE: Row locks serialize approval with consent withdrawal until the immutable intent commits.
    PERFORM 1 FROM app.campaign_leads l
      WHERE l.organization_id=org
        AND app_send_private.canonical_address(l.email) IN
          (SELECT app_send_private.canonical_address(value->>1)
             FROM jsonb_array_elements(convert_from(p_snapshot_bytes,'UTF8')::jsonb->6))
      FOR SHARE;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(convert_from(p_snapshot_bytes,'UTF8')::jsonb->6) recipient
      WHERE NOT EXISTS (
        SELECT 1 FROM app.campaign_leads l WHERE l.organization_id=org
          AND app_send_private.canonical_address(l.email)=app_send_private.canonical_address(recipient->>1)
          AND l.consent_status='granted' AND l.consent_recorded_at IS NOT NULL
          AND l.consent_source IS NOT NULL AND l.consent_recorded_by IS NOT NULL
      )
    ) THEN RETURN '{"code":"consent_required"}'::jsonb; END IF;
  END IF;
  -- Re-evaluate the cookie after every business lock wait before committing a new immutable authorization binding.
  guard := app_auth.send_approval_guard(p_session_digest);
  IF guard->>'status' <> 'ok' THEN RETURN jsonb_build_object('code',CASE guard->>'status'
    WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'not_found' THEN 'not_available'
    WHEN 'context_changed' THEN 'context_changed' ELSE 'temporarily_unavailable' END); END IF;
  send := gen_random_uuid(); now_at := clock_timestamp();
  INSERT INTO app_send_private.intents(send_id,organization_id,mailbox_id,draft_id,draft_version,approved_by,approved_at,
    approval_session_digest,approval_auth_session_id,approval_context_id,approval_generation,approval_policy_revision,
    approval_epoch,review_digest,snapshot_bytes,snapshot_format,simulated)
  VALUES(send,org,p_mailbox,p_draft,p_expected,actor,now_at,p_session_digest,(guard->>'auth_session_id')::uuid,
    (guard->>'context_id')::uuid,(guard->>'authorization_generation')::bigint,(binding->>'policy_revision')::bigint,
    p_epoch,p_review_digest,p_snapshot_bytes,'elevateo.send.snapshot.v1',p_outbound_mode<>'resend') RETURNING * INTO intent;
  INSERT INTO app_send_private.jobs(send_id,state,next_action,next_check_at,policy_profile,updated_at)
    VALUES(send,'queued','submit',now_at,'none',now_at);
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,actor_id,to_state,recorded_at)
    VALUES(send,'approved','approved',actor,'queued',now_at);
  PERFORM app_send_private.consume_draft(p_session_digest,p_mailbox,p_draft,p_expected);
  PERFORM app_send_private.record_approval_operation(org,actor,p_operation,p_mailbox,p_draft,p_expected,request_digest,send,NULL);
  RETURN app_send_private.approval_result(intent);
END $$;

