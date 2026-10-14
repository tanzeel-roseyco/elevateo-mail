-- AIDEV-NOTE: A job lock serializes cancellation with dispatch; an attempted send remains uncertain until reconciled.
CREATE FUNCTION app.cancel_send(p_session_digest text,p_mailbox uuid,p_send uuid,p_control_epoch uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE guard jsonb; intent app_send_private.intents; job app_send_private.jobs; now_at timestamptz;
BEGIN
  IF p_mailbox IS NULL OR p_send IS NULL THEN RETURN '{"code":"request_invalid"}'::jsonb; END IF;
  guard := app_auth.send_approval_guard(p_session_digest);
  IF guard->>'status' <> 'ok' THEN RETURN jsonb_build_object('code',CASE guard->>'status'
    WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'not_found' THEN 'not_available'
    WHEN 'context_changed' THEN 'context_changed' ELSE 'temporarily_unavailable' END); END IF;
  SELECT * INTO intent FROM app_send_private.intents WHERE send_id = p_send AND mailbox_id = p_mailbox
    AND organization_id = (guard->>'organization_id')::uuid AND approved_by = (guard->>'user_id')::uuid;
  IF NOT FOUND OR NOT app_send_private.status_scope(p_mailbox,intent.draft_id) THEN
    RETURN '{"code":"not_available"}'::jsonb;
  END IF;
  IF app_send_private.read_draft_binding(p_mailbox,intent.draft_id) ? 'code' THEN
    RETURN '{"code":"not_available"}'::jsonb;
  END IF;
  SELECT * INTO STRICT job FROM app_send_private.jobs WHERE send_id = p_send FOR UPDATE;
  -- Authorization may change while waiting for a dispatcher-held job lock.
  guard := app_auth.send_approval_guard(p_session_digest);
  IF guard->>'status' <> 'ok' THEN RETURN jsonb_build_object('code',CASE guard->>'status'
    WHEN 'unauthorized' THEN 'unauthenticated' WHEN 'not_found' THEN 'not_available'
    WHEN 'context_changed' THEN 'context_changed' ELSE 'temporarily_unavailable' END); END IF;
  IF (guard->>'organization_id')::uuid <> intent.organization_id OR (guard->>'user_id')::uuid <> intent.approved_by
    OR NOT app_send_private.status_scope(p_mailbox,intent.draft_id)
    OR app_send_private.read_draft_binding(p_mailbox,intent.draft_id) ? 'code' THEN
    RETURN '{"code":"not_available"}'::jsonb;
  END IF;
  IF job.state IN ('accepted','rejected') THEN RETURN '{"code":"send_terminal"}'::jsonb; END IF;
  IF job.state <> 'cancelled' AND job.cancel_requested_at IS NULL THEN
    now_at := clock_timestamp();
    IF job.first_possible_at IS NULL AND job.attempt_count = 0 AND job.lease_id IS NULL THEN
      UPDATE app_send_private.jobs SET state = 'cancelled',next_action = 'none',next_check_at = NULL,
        lease_id = NULL,lease_expires_at = NULL,cancel_requested_at = now_at,updated_at = now_at WHERE send_id = p_send;
      INSERT INTO app_send_private.audit_events(send_id,event_key,kind,actor_id,from_state,to_state,recorded_at)
        VALUES(p_send,'cancel-requested','cancel_requested',intent.approved_by,job.state,'cancelled',now_at);
    ELSE
      -- A possible provider call cannot be erased or reported as cancelled before durable reconciliation.
      UPDATE app_send_private.jobs SET cancel_requested_at = now_at,updated_at = now_at WHERE send_id = p_send;
      INSERT INTO app_send_private.audit_events(send_id,event_key,kind,actor_id,from_state,to_state,recorded_at)
        VALUES(p_send,'cancel-requested','cancel_requested',intent.approved_by,job.state,job.state,now_at);
    END IF;
  END IF;
  -- A fresh read inside this VOLATILE function observes its own write; send_status is STABLE.
  SELECT * INTO STRICT job FROM app_send_private.jobs WHERE send_id = p_send;
  RETURN jsonb_build_object('send_id',intent.send_id,'mailbox_id',intent.mailbox_id,'draft_id',intent.draft_id,
    'approved_version',intent.draft_version,'approved_at',app_send_private.utc_timestamp(intent.approved_at),
    'state',job.state,'attempts',job.attempt_count,'first_possible_at',app_send_private.utc_timestamp(job.first_possible_at),
    'retry_deadline_at',app_send_private.utc_timestamp(job.retry_deadline_at),
    'cancel_requested',job.cancel_requested_at IS NOT NULL,
    'cancellable',job.state NOT IN ('accepted','rejected','cancelled') AND job.first_possible_at IS NULL
      AND p_control_epoch IS NOT NULL AND p_control_epoch = intent.approval_epoch,
    'hold_reason',job.hold_reason,'updated_at',app_send_private.utc_timestamp(job.updated_at),'simulated',true);
END $$;
REVOKE ALL ON FUNCTION app.cancel_send(text,uuid,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.cancel_send(text,uuid,uuid,uuid) TO elevateo_api;
