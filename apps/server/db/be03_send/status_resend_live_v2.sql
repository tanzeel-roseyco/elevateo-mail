-- AIDEV-NOTE: Status discloses no snapshot/session data; null or mismatched external epoch cannot assert cancellability.
CREATE OR REPLACE FUNCTION app.send_status(p_mailbox uuid,p_send uuid,p_control_epoch uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE intent app_send_private.intents; job app_send_private.jobs; delivery text; suppression text; delivery_at timestamptz;
BEGIN
  SELECT * INTO intent FROM app_send_private.intents WHERE send_id = p_send AND mailbox_id = p_mailbox
    AND organization_id = NULLIF(current_setting('app.org_id',true),'')::uuid
    AND approved_by = NULLIF(current_setting('app.user_id',true),'')::uuid;
  IF NOT FOUND OR NOT app_send_private.status_scope(p_mailbox,intent.draft_id) THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT job FROM app_send_private.jobs WHERE send_id = p_send;
  SELECT e.delivery_state,CASE e.delivery_state WHEN 'bounced' THEN 'bounced' WHEN 'complained' THEN 'complained' END,e.recorded_at
    INTO delivery,suppression,delivery_at FROM app_send_private.resend_events e WHERE e.send_id=p_send
      AND e.delivery_state IN ('sent','delivered','delivery_delayed','bounced','complained')
    ORDER BY e.recorded_at DESC,e.event_id DESC LIMIT 1;
  RETURN jsonb_build_object('send_id',intent.send_id,'mailbox_id',intent.mailbox_id,'draft_id',intent.draft_id,
    'approved_version',intent.draft_version,'approved_at',app_send_private.utc_timestamp(intent.approved_at),'state',job.state,'attempts',job.attempt_count,
    'first_possible_at',app_send_private.utc_timestamp(job.first_possible_at),'retry_deadline_at',app_send_private.utc_timestamp(job.retry_deadline_at),
    'cancel_requested',job.cancel_requested_at IS NOT NULL,
    'cancellable',job.state NOT IN ('accepted','rejected','cancelled') AND job.first_possible_at IS NULL
      AND p_control_epoch IS NOT NULL AND p_control_epoch = intent.approval_epoch,
    'hold_reason',job.hold_reason,'updated_at',app_send_private.utc_timestamp(job.updated_at),
    'delivery_status',delivery,'delivery_updated_at',app_send_private.utc_timestamp(delivery_at),
    'suppression_reason',suppression,'simulated',intent.simulated);
END $$;

