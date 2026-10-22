CREATE OR REPLACE FUNCTION app_send_private.record_observation_v2(p_send uuid,p_lease uuid,p_generation bigint,
  p_observation uuid,p_attempt uuid,p_kind text,p_receipt text,p_digest bytea,p_source text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; a app_send_private.attempts; n timestamptz := clock_timestamp(); target text;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_observation IS NULL OR p_attempt IS NULL
    OR p_kind IS NULL OR p_kind NOT IN ('accepted','rejected','unknown')
    OR p_source IS NULL OR p_source NOT IN ('mailpit_smtp_test_v1','mox_smtp_test_v1','mox_smtp_v1','resend_v1')
    OR p_digest IS NULL OR octet_length(p_digest) <> 32
    OR (p_kind='accepted') IS DISTINCT FROM (p_receipt IS NOT NULL)
    OR (p_receipt IS NOT NULL AND (char_length(p_receipt) NOT BETWEEN 1 AND 256
      OR NOT ((p_source='mailpit_smtp_test_v1' AND p_receipt ~ '^mailpit-test-v1:[0-9a-f]{64}$')
        OR (p_source='mox_smtp_test_v1' AND p_receipt ~ '^mox-test-v1:[0-9a-f]{64}$')
        OR (p_source='mox_smtp_v1' AND p_receipt ~ '^mox-v1:[0-9a-f]{64}$')
        OR (p_source='resend_v1' AND p_receipt ~ '^resend:[A-Za-z0-9_-]{1,128}$')))) THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  -- The job row may have been locked past lease expiry; use time after the wait.
  n := clock_timestamp();
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  IF NOT FOUND OR a.attempt_no <> j.attempt_count OR NOT ((a.profile='mailpit-smtp-test-v1' AND p_source='mailpit_smtp_test_v1')
      OR (a.profile='mox-smtp-test-v1' AND p_source='mox_smtp_test_v1')
      OR (a.profile='mox-smtp-v1' AND p_source='mox_smtp_v1')
      OR (a.profile='resend-v1' AND p_source='resend_v1'))
    OR j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation
    OR j.lease_expires_at <= n OR j.state NOT IN ('dispatching','unknown') THEN
    RETURN '{"code":"stale_lease"}'::jsonb;
  END IF;
  target := CASE p_kind WHEN 'accepted' THEN 'accepted' WHEN 'rejected' THEN 'rejected'
    ELSE CASE WHEN j.reconcile_count >= 4 THEN 'needs_review' ELSE 'unknown' END END;
  IF p_kind='unknown' THEN
    INSERT INTO app_send_private.reconciliation_checks(check_id,send_id,attempt_id,lease_generation,evidence_digest,checked_at)
      VALUES(p_observation,p_send,p_attempt,p_generation,p_digest,n);
  ELSE
    INSERT INTO app_send_private.observations(observation_id,attempt_id,kind,source,receipt_ref,evidence_digest,received_at)
      VALUES(p_observation,p_attempt,p_kind,p_source,p_receipt,p_digest,n);
  END IF;
  UPDATE app_send_private.jobs SET state=target,next_action=CASE WHEN target='unknown' THEN 'reconcile' ELSE 'none' END,
    next_check_at=CASE WHEN target='unknown' THEN n+interval '1 minute' ELSE NULL END,
    lease_id=NULL,lease_expires_at=NULL,accepted_at=CASE WHEN target='accepted' THEN n ELSE accepted_at END,
    accepted_receipt_ref=CASE WHEN target='accepted' THEN p_receipt ELSE accepted_receipt_ref END,
    reconcile_count=CASE WHEN p_kind='unknown' THEN j.reconcile_count+1 ELSE j.reconcile_count END,
    hold_reason=CASE WHEN target='unknown' THEN 'uncertain' WHEN target='needs_review' THEN 'counter_exhausted' ELSE NULL END,
    updated_at=n WHERE send_id=p_send;
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,lease_generation,observation_id,from_state,to_state,recorded_at)
    VALUES(p_send,'observation:'||p_observation,CASE WHEN p_kind='unknown' THEN 'held' ELSE 'observation_applied' END,
      p_generation,CASE WHEN p_kind='unknown' THEN NULL ELSE p_observation END,j.state,target,n);
  RETURN jsonb_build_object('state',target,'simulated',p_source NOT IN ('resend_v1','mox_smtp_v1'));
END $$;

REVOKE ALL ON FUNCTION app_send_private.record_observation_v2(uuid,uuid,bigint,uuid,uuid,text,text,bytea,text)
  FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.record_observation_v2(uuid,uuid,bigint,uuid,uuid,text,text,bytea,text)
  TO elevateo_worker;
SET LOCAL ROLE elevateo_owner;
