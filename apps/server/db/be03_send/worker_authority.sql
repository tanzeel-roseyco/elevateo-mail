-- AIDEV-NOTE: Every transition serializes on the job row. A lease fences stale workers;
-- an authorized attempt is never replayed solely because its lease expired.
SET LOCAL ROLE elevateo_session_owner;
-- The approval write guard requires a request-local write transaction. Workers need a
-- narrower read-only freshness check against the original private session binding.
CREATE FUNCTION app_auth.send_worker_guard(p_digest text,p_actor uuid,p_org uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s app_auth.sessions; state text;
BEGIN
  PERFORM app_auth.check_digest(p_digest);
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest=p_digest;
  IF NOT FOUND OR s.user_id IS DISTINCT FROM p_actor OR s.organization_id IS DISTINCT FROM p_org THEN
    RETURN '{"status":"unauthorized"}'::jsonb;
  END IF;
  state := app_auth.session_status(s,s.user_id,s.auth_session_id,false,true,clock_timestamp());
  IF state <> 'ok' OR s.access_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('status',CASE WHEN state='ok' THEN 'unauthorized' ELSE state END);
  END IF;
  RETURN app_auth.session_metadata(s) - 'csrf_token' - 'organization_name';
END $$;
REVOKE ALL ON FUNCTION app_auth.send_worker_guard(text,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_auth.send_worker_guard(text,uuid,uuid) TO elevateo_send_owner;
SET LOCAL ROLE elevateo_send_owner;
CREATE FUNCTION app_send_private.claim_job(p_send uuid,p_lease uuid,p_epoch uuid,p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; n timestamptz := clock_timestamp();
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_epoch IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 120 THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  IF i.approval_epoch <> p_epoch OR j.cancel_requested_at IS NOT NULL OR j.state IN ('accepted','rejected','cancelled','needs_review') THEN
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
    'action',j.next_action,'attempts',j.attempt_count,'simulated',true);
END $$;

CREATE FUNCTION app_send_private.authorize_attempt(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_capability_hash bytea,p_profile text,p_deadline_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; g jsonb; n timestamptz := clock_timestamp();
  pol bigint;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_attempt IS NULL OR p_epoch IS NULL
    OR p_capability_hash IS NULL OR octet_length(p_capability_hash) <> 32
    OR p_profile IS NULL OR p_profile NOT IN ('none','synthetic-v1')
    OR p_deadline_seconds IS NULL OR p_deadline_seconds NOT BETWEEN 1 AND 60 THEN RETURN '{"code":"request_invalid"}'::jsonb; END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  IF j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation OR j.lease_expires_at <= n
    OR j.state <> 'queued' OR j.next_action <> 'submit' OR j.cancel_requested_at IS NOT NULL
    OR p_profile <> j.policy_profile
    OR i.approval_epoch <> p_epoch THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
  IF j.attempt_count >= 3 OR (j.retry_deadline_at IS NOT NULL AND n >= j.retry_deadline_at) THEN
    UPDATE app_send_private.jobs SET state='needs_review',next_action='none',next_check_at=NULL,
      lease_id=NULL,lease_expires_at=NULL,hold_reason=CASE WHEN j.attempt_count>=3 THEN 'attempt_limit' ELSE 'retry_expired' END,
      updated_at=n WHERE send_id=p_send;
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  g := app_auth.send_worker_guard(i.approval_session_digest,i.approved_by,i.organization_id);
  SELECT revision INTO pol FROM app_send_private.organization_policy WHERE organization_id=i.organization_id FOR SHARE;
  IF g->>'status' <> 'ok' OR (g->>'organization_id')::uuid IS DISTINCT FROM i.organization_id
    OR (g->>'authorization_generation')::bigint IS DISTINCT FROM i.approval_generation
    OR pol IS DISTINCT FROM i.approval_policy_revision
    OR NOT EXISTS (SELECT 1 FROM app_send_private.mailbox_policy WHERE organization_id=i.organization_id
      AND mailbox_id=i.mailbox_id AND enabled) THEN
    UPDATE app_send_private.jobs SET state='needs_review',next_action='none',next_check_at=NULL,
      lease_id=NULL,lease_expires_at=NULL,hold_reason='authorization_changed',updated_at=n WHERE send_id=p_send;
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  INSERT INTO app_send_private.attempts(send_id,attempt_no,attempt_id,lease_generation,authorized_at,
    call_deadline_at,capability_hash,profile) VALUES(p_send,j.attempt_count+1,p_attempt,p_generation,n,
    n+make_interval(secs=>p_deadline_seconds),p_capability_hash,p_profile);
  UPDATE app_send_private.jobs SET state='dispatching',attempt_count=j.attempt_count+1,
    first_possible_at=COALESCE(j.first_possible_at,n),retry_deadline_at=COALESCE(j.retry_deadline_at,n+interval '24 hours'),
    next_action='reconcile',next_check_at=n+make_interval(secs=>p_deadline_seconds),updated_at=n WHERE send_id=p_send;
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,lease_generation,from_state,to_state,recorded_at)
    VALUES(p_send,'attempt:'||(j.attempt_count+1),'attempt_authorized',p_generation,j.state,'dispatching',n);
  RETURN jsonb_build_object('attempt_id',p_attempt,'attempt_no',j.attempt_count+1,
    'call_deadline_at',n+make_interval(secs=>p_deadline_seconds),'simulated',true);
END $$;

CREATE FUNCTION app_send_private.cancel_job(p_send uuid,p_epoch uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; n timestamptz := clock_timestamp();
BEGIN
  IF p_send IS NULL OR p_epoch IS NULL OR p_actor IS NULL THEN RETURN '{"code":"request_invalid"}'::jsonb; END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  IF i.approval_epoch <> p_epoch OR i.approved_by <> p_actor THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  IF j.first_possible_at IS NOT NULL THEN RETURN '{"code":"cancel_too_late"}'::jsonb; END IF;
  IF j.state='cancelled' THEN RETURN jsonb_build_object('state','cancelled','simulated',true); END IF;
  IF j.state <> 'queued' THEN RETURN '{"code":"cancel_too_late"}'::jsonb; END IF;
  UPDATE app_send_private.jobs SET state='cancelled',next_action='none',next_check_at=NULL,
    cancel_requested_at=n,lease_id=NULL,lease_expires_at=NULL,updated_at=n WHERE send_id=p_send;
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,actor_id,from_state,to_state,recorded_at)
    VALUES(p_send,'cancel','cancel_requested',p_actor,'queued','cancelled',n);
  RETURN jsonb_build_object('state','cancelled','simulated',true);
END $$;

CREATE FUNCTION app_send_private.record_observation(p_send uuid,p_lease uuid,p_generation bigint,
  p_observation uuid,p_attempt uuid,p_kind text,p_receipt text,p_digest bytea)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; a app_send_private.attempts; n timestamptz := clock_timestamp(); target text;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_observation IS NULL OR p_attempt IS NULL
    OR p_kind IS NULL OR p_kind NOT IN ('accepted','rejected','unknown')
    OR p_digest IS NULL OR octet_length(p_digest) <> 32
    OR (p_kind='accepted') IS DISTINCT FROM (p_receipt IS NOT NULL)
    OR (p_receipt IS NOT NULL AND char_length(p_receipt) NOT BETWEEN 1 AND 256) THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  IF NOT FOUND OR j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation
    OR j.lease_expires_at <= n OR j.state NOT IN ('dispatching','unknown') THEN
    RETURN '{"code":"stale_lease"}'::jsonb;
  END IF;
  target := CASE p_kind WHEN 'accepted' THEN 'accepted' WHEN 'rejected' THEN 'rejected'
    ELSE CASE WHEN j.reconcile_count >= 4 THEN 'needs_review' ELSE 'unknown' END END;
  INSERT INTO app_send_private.observations(observation_id,attempt_id,kind,source,receipt_ref,evidence_digest,received_at)
    VALUES(p_observation,p_attempt,p_kind,'local_failure_driver',p_receipt,p_digest,n);
  UPDATE app_send_private.jobs SET state=target,next_action=CASE WHEN target='unknown' THEN 'reconcile' ELSE 'none' END,
    next_check_at=CASE WHEN target='unknown' THEN n+interval '1 minute' ELSE NULL END,
    lease_id=NULL,lease_expires_at=NULL,accepted_at=CASE WHEN target='accepted' THEN n ELSE accepted_at END,
    accepted_receipt_ref=CASE WHEN target='accepted' THEN p_receipt ELSE accepted_receipt_ref END,
    reconcile_count=CASE WHEN p_kind='unknown' THEN j.reconcile_count+1 ELSE j.reconcile_count END,
    hold_reason=CASE WHEN target='unknown' THEN 'uncertain' WHEN target='needs_review' THEN 'counter_exhausted' ELSE NULL END,
    updated_at=n WHERE send_id=p_send;
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,lease_generation,observation_id,from_state,to_state,recorded_at)
    VALUES(p_send,'observation:'||p_observation,'observation_applied',p_generation,p_observation,j.state,target,n);
  RETURN jsonb_build_object('state',target,'simulated',true);
END $$;

REVOKE ALL ON FUNCTION app_send_private.claim_job(uuid,uuid,uuid,integer),
  app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer),
  app_send_private.cancel_job(uuid,uuid,uuid),
  app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT USAGE ON SCHEMA app_send_private TO elevateo_worker;
GRANT EXECUTE ON FUNCTION app_send_private.claim_job(uuid,uuid,uuid,integer),
  app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer),
  app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea) TO elevateo_worker;
-- Cancellation is internal until the scoped API facade is agreed with Cassian.
SET LOCAL ROLE elevateo_owner;
