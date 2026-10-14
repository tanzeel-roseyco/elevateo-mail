-- AIDEV-NOTE: Versioned receipt provenance is limited to the internal simulated Mailpit profile.
-- An authorized attempt remains a single possible submission; unknown evidence never authorizes resend.
SET LOCAL ROLE elevateo_send_owner;
ALTER TABLE app_send_private.attempts DROP CONSTRAINT attempts_profile_check;
ALTER TABLE app_send_private.attempts ADD CONSTRAINT send_attempt_profile_v2
  CHECK (profile IN ('none','synthetic-v1','mailpit-smtp-test-v1'));
ALTER TABLE app_send_private.observations DROP CONSTRAINT observations_source_check;
ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_source_v2
  CHECK (source IN ('local_failure_driver','mailpit_smtp_test_v1'));
ALTER TABLE app_send_private.observations ADD CONSTRAINT send_observation_receipt_source_v2
  CHECK ((source='local_failure_driver' AND (receipt_ref IS NULL OR receipt_ref ~ '^local:[0-9a-f]{64}$'))
    OR (source='mailpit_smtp_test_v1' AND (receipt_ref IS NULL OR receipt_ref ~ '^mailpit-test-v1:[0-9a-f]{64}$')));

CREATE OR REPLACE FUNCTION app_send_private.authorize_attempt(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_capability_hash bytea,p_profile text,p_deadline_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; g jsonb; n timestamptz := clock_timestamp();
  pol bigint; mailbox_on boolean; snap jsonb; recipient jsonb; address text; suppressed boolean := false;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_attempt IS NULL OR p_epoch IS NULL
    OR p_capability_hash IS NULL OR octet_length(p_capability_hash) <> 32
    OR p_profile IS NULL OR p_profile NOT IN ('synthetic-v1','mailpit-smtp-test-v1')
    OR p_deadline_seconds IS NULL OR p_deadline_seconds NOT BETWEEN 1 AND 60 THEN RETURN '{"code":"request_invalid"}'::jsonb; END IF;
  -- Lock order matches approval/revocation: session, generation, policy, mailbox,
  -- then job. A concurrent cancel only needs the job lock.
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  g := app_auth.send_worker_guard(i.approval_session_digest,i.approved_by,i.organization_id);
  SELECT revision INTO pol FROM app_send_private.organization_policy
    WHERE organization_id=i.organization_id FOR SHARE;
  SELECT enabled INTO mailbox_on FROM app_send_private.mailbox_policy
    WHERE organization_id=i.organization_id AND mailbox_id=i.mailbox_id FOR SHARE;
  snap := convert_from(i.snapshot_bytes,'UTF8')::jsonb;
  IF jsonb_typeof(snap)='array' AND jsonb_array_length(snap)=14
      AND jsonb_typeof(snap->6)='array' THEN
    FOR recipient IN SELECT value FROM jsonb_array_elements(snap->6) LOOP
      address := app_send_private.canonical_address(recipient->>1);
      IF address IS NULL OR EXISTS (SELECT 1 FROM app_send_private.recipient_suppressions
          WHERE organization_id=i.organization_id AND canonical_address=address) THEN
        suppressed := true;
      END IF;
    END LOOP;
  ELSE
    suppressed := true;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  n := clock_timestamp();
  IF j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation OR j.lease_expires_at <= n
    OR j.state <> 'queued' OR j.next_action <> 'submit' OR j.cancel_requested_at IS NOT NULL
    OR i.approval_epoch <> p_epoch THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
  IF j.attempt_count >= 3 OR (j.retry_deadline_at IS NOT NULL AND n >= j.retry_deadline_at) THEN
    UPDATE app_send_private.jobs SET state='needs_review',next_action='none',next_check_at=NULL,
      lease_id=NULL,lease_expires_at=NULL,hold_reason=CASE WHEN j.attempt_count>=3 THEN 'attempt_limit' ELSE 'retry_expired' END,
      updated_at=n WHERE send_id=p_send;
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  IF g->>'status' <> 'ok' OR (g->>'organization_id')::uuid IS DISTINCT FROM i.organization_id
    OR (g->>'auth_session_id')::uuid IS DISTINCT FROM i.approval_auth_session_id
    OR (g->>'context_id')::uuid IS DISTINCT FROM i.approval_context_id
    OR (g->>'authorization_generation')::bigint IS DISTINCT FROM i.approval_generation
    OR pol IS DISTINCT FROM i.approval_policy_revision OR mailbox_on IS DISTINCT FROM true
    OR snap->>10 <> 'correspondence' OR snap->>11 <> 'human_correspondence_attestation'
    OR suppressed OR NOT app_send_private.current_capability(i)
    OR p_capability_hash <> CASE p_profile
      WHEN 'synthetic-v1' THEN sha256(convert_to('local:synthetic-v1','UTF8'))
      WHEN 'mailpit-smtp-test-v1' THEN sha256(convert_to('local:mailpit-smtp-test-v1','UTF8')) END THEN
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

CREATE OR REPLACE FUNCTION app_send_private.final_attempt_check(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE i app_send_private.intents; j app_send_private.jobs; a app_send_private.attempts;
  g jsonb; pol bigint; mailbox_on boolean; snap jsonb; recipient jsonb; address text; suppressed boolean := false;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_attempt IS NULL OR p_epoch IS NULL THEN
    RETURN '{"allowed":false}'::jsonb; END IF;
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  IF NOT FOUND THEN RETURN '{"allowed":false}'::jsonb; END IF;
  g := app_auth.send_worker_guard(i.approval_session_digest,i.approved_by,i.organization_id);
  SELECT revision INTO pol FROM app_send_private.organization_policy
    WHERE organization_id=i.organization_id FOR SHARE;
  SELECT enabled INTO mailbox_on FROM app_send_private.mailbox_policy
    WHERE organization_id=i.organization_id AND mailbox_id=i.mailbox_id FOR SHARE;
  snap := convert_from(i.snapshot_bytes,'UTF8')::jsonb;
  IF jsonb_typeof(snap)='array' AND jsonb_array_length(snap)=14
    AND jsonb_typeof(snap->6)='array' THEN
    FOR recipient IN SELECT value FROM jsonb_array_elements(snap->6) LOOP
      address := app_send_private.canonical_address(recipient->>1);
      IF address IS NULL OR EXISTS (SELECT 1 FROM app_send_private.recipient_suppressions
        WHERE organization_id=i.organization_id AND canonical_address=address) THEN suppressed := true; END IF;
    END LOOP;
  ELSE suppressed := true;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  RETURN jsonb_build_object('allowed',COALESCE(j.send_id IS NOT NULL AND a.attempt_id IS NOT NULL
    AND j.lease_id=p_lease AND j.lease_generation=p_generation AND j.lease_expires_at>clock_timestamp()
    AND j.state='dispatching' AND j.cancel_requested_at IS NULL AND i.approval_epoch=p_epoch
    AND a.lease_generation=p_generation AND a.call_deadline_at>clock_timestamp()
    AND ((a.profile='synthetic-v1' AND a.capability_hash=sha256(convert_to('local:synthetic-v1','UTF8')))
      OR (a.profile='mailpit-smtp-test-v1' AND a.capability_hash=sha256(convert_to('local:mailpit-smtp-test-v1','UTF8'))))
    AND g->>'status'='ok' AND (g->>'organization_id')::uuid=i.organization_id
    AND (g->>'auth_session_id')::uuid=i.approval_auth_session_id
    AND (g->>'context_id')::uuid=i.approval_context_id
    AND (g->>'authorization_generation')::bigint=i.approval_generation
    AND pol=i.approval_policy_revision AND mailbox_on=true
    AND snap->>10='correspondence' AND snap->>11='human_correspondence_attestation'
    AND NOT suppressed AND app_send_private.current_capability(i),false));
END $$;

CREATE OR REPLACE FUNCTION app_send_private.record_observation(p_send uuid,p_lease uuid,p_generation bigint,
  p_observation uuid,p_attempt uuid,p_kind text,p_receipt text,p_digest bytea)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; a app_send_private.attempts; n timestamptz := clock_timestamp(); target text;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_observation IS NULL OR p_attempt IS NULL
    OR p_kind IS NULL OR p_kind NOT IN ('accepted','rejected','unknown')
    OR p_digest IS NULL OR octet_length(p_digest) <> 32
    OR (p_kind='accepted') IS DISTINCT FROM (p_receipt IS NOT NULL)
    OR (p_receipt IS NOT NULL AND (char_length(p_receipt) NOT BETWEEN 1 AND 256
      OR p_receipt !~ '^local:[0-9a-f]{64}$')) THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  IF NOT FOUND OR a.attempt_no <> j.attempt_count
    OR (p_kind <> 'unknown' AND a.profile <> 'synthetic-v1')
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
      VALUES(p_observation,p_attempt,p_kind,'local_failure_driver',p_receipt,p_digest,n);
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
  RETURN jsonb_build_object('state',target,'simulated',true);
END $$;

CREATE FUNCTION app_send_private.record_observation_v2(p_send uuid,p_lease uuid,p_generation bigint,
  p_observation uuid,p_attempt uuid,p_kind text,p_receipt text,p_digest bytea,p_source text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; a app_send_private.attempts; n timestamptz := clock_timestamp(); target text;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_observation IS NULL OR p_attempt IS NULL
    OR p_kind IS NULL OR p_kind NOT IN ('accepted','rejected','unknown')
    OR p_source IS DISTINCT FROM 'mailpit_smtp_test_v1'
    OR p_digest IS NULL OR octet_length(p_digest) <> 32
    OR (p_kind='accepted') IS DISTINCT FROM (p_receipt IS NOT NULL)
    OR (p_receipt IS NOT NULL AND (char_length(p_receipt) NOT BETWEEN 1 AND 256
      OR p_receipt !~ '^mailpit-test-v1:[0-9a-f]{64}$')) THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  IF NOT FOUND OR a.attempt_no <> j.attempt_count OR a.profile <> 'mailpit-smtp-test-v1'
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
  RETURN jsonb_build_object('state',target,'simulated',true);
END $$;

REVOKE ALL ON FUNCTION app_send_private.record_observation_v2(uuid,uuid,bigint,uuid,uuid,text,text,bytea,text)
  FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.record_observation_v2(uuid,uuid,bigint,uuid,uuid,text,text,bytea,text)
  TO elevateo_worker;
SET LOCAL ROLE elevateo_owner;
