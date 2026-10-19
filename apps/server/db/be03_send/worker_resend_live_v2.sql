-- AIDEV-NOTE: Live claims preserve the intent ledger flag and expose immutable bytes for idempotent reconciliation.
CREATE OR REPLACE FUNCTION app_send_private.claim_job(p_send uuid,p_lease uuid,p_epoch uuid,p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; n timestamptz := clock_timestamp();
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_epoch IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 120 THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  IF i.approval_epoch <> p_epoch OR (j.cancel_requested_at IS NOT NULL AND j.next_action='submit') OR j.state IN ('accepted','rejected','cancelled','needs_review') THEN
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  IF j.lease_id IS NOT NULL AND j.lease_expires_at > n THEN RETURN '{"code":"lease_busy"}'::jsonb; END IF;
  IF j.lease_id IS NOT NULL AND j.state='dispatching' THEN
    UPDATE app_send_private.jobs SET state='unknown',next_action='reconcile',next_check_at=n,
      hold_reason='uncertain',lease_id=NULL,lease_expires_at=NULL,updated_at=n WHERE send_id=p_send;
    RETURN '{"code":"reconcile_required"}'::jsonb;
  END IF;
  IF j.next_check_at IS NULL OR j.next_check_at > n OR j.next_action='none' THEN RETURN '{"code":"not_due"}'::jsonb; END IF;
  IF j.state='unknown' AND j.next_action <> 'reconcile' THEN RETURN '{"code":"reconcile_required"}'::jsonb; END IF;
  UPDATE app_send_private.jobs SET lease_generation=j.lease_generation+1,lease_id=p_lease,
    lease_expires_at=n+make_interval(secs=>p_seconds),updated_at=n WHERE send_id=p_send;
  RETURN jsonb_build_object('send_id',p_send,'lease_id',p_lease,'generation',j.lease_generation+1,
    'action',j.next_action,'attempts',j.attempt_count,'simulated',i.simulated);
END $$;

CREATE OR REPLACE FUNCTION app_send_private.worker_binding(p_send uuid,p_lease uuid,p_generation bigint,p_epoch uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; a app_send_private.attempts;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_epoch IS NULL THEN
    RETURN '{"code":"request_invalid"}'::jsonb; END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  IF j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation
    OR j.lease_expires_at <= clock_timestamp() OR i.approval_epoch <> p_epoch
    OR j.next_action NOT IN ('submit','reconcile') OR (j.next_action='submit' AND j.cancel_requested_at IS NOT NULL)
    THEN RETURN '{"code":"stale_lease"}'::jsonb; END IF;
  IF j.next_action='reconcile' THEN
    SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send ORDER BY attempt_no DESC LIMIT 1;
    IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  END IF;
  RETURN jsonb_build_object('send_id',p_send,'action',j.next_action,'attempt_id',a.attempt_id,
    'snapshot_digest',encode(sha256(i.snapshot_bytes),'hex'),
    'snapshot_hex',encode(i.snapshot_bytes,'hex'));
END $$;

CREATE OR REPLACE FUNCTION app_send_private.reconcile_no_evidence(p_send uuid,p_lease uuid,p_generation bigint,p_attempt uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE check_id uuid := gen_random_uuid(); profile text;
BEGIN
  -- AIDEV-NOTE: Live unknown results must retain provider provenance and simulated=false without another POST.
  SELECT a.profile INTO profile FROM app_send_private.attempts a WHERE a.send_id=p_send AND a.attempt_id=p_attempt;
  IF profile='resend-v1' THEN
    RETURN app_send_private.record_observation_v2(p_send,p_lease,p_generation,check_id,p_attempt,
      'unknown',NULL,sha256(convert_to('resend:no-evidence:'||check_id::text,'UTF8')),'resend_v1');
  END IF;
  RETURN app_send_private.record_observation(p_send,p_lease,p_generation,check_id,p_attempt,
    'unknown',NULL,sha256(convert_to('local:no-evidence:'||check_id::text,'UTF8')));
END $$;
