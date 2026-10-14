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
  SELECT * INTO s FROM app_auth.sessions WHERE cookie_digest=p_digest FOR SHARE;
  PERFORM 1 FROM app_auth.authorization_generations WHERE organization_id=p_org AND user_id=p_actor FOR SHARE;
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
-- AIDEV-NOTE: Each ambiguous reconciliation has its own immutable evidence record;
-- BE03 observations retain their original one-kind-per-attempt constraint.
CREATE TABLE app_send_private.reconciliation_checks (
  check_id uuid PRIMARY KEY, send_id uuid NOT NULL REFERENCES app_send_private.intents ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES app_send_private.attempts(attempt_id) ON DELETE RESTRICT,
  lease_generation bigint NOT NULL CHECK (lease_generation > 0),
  evidence_digest bytea NOT NULL CHECK (octet_length(evidence_digest)=32),
  checked_at timestamptz NOT NULL CHECK (isfinite(checked_at)),
  UNIQUE (attempt_id,evidence_digest)
);
ALTER TABLE app_send_private.reconciliation_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_send_private.reconciliation_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY send_owner ON app_send_private.reconciliation_checks TO elevateo_send_owner USING (true) WITH CHECK (true);
CREATE TRIGGER immutable_send_history BEFORE UPDATE OR DELETE ON app_send_private.reconciliation_checks
  FOR EACH ROW EXECUTE FUNCTION app_send_private.reject_mutation();
-- Policy mutations serialize on the organization policy row and invalidate prior
-- approval revisions. Existing bootstrap mailbox insertion stays unchanged.
CREATE FUNCTION app_send_private.bump_send_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE org uuid := COALESCE(NEW.organization_id,OLD.organization_id);
BEGIN
  UPDATE app_send_private.organization_policy SET revision=revision+1,updated_at=clock_timestamp()
    WHERE organization_id=org;
  IF TG_OP='UPDATE' AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    UPDATE app_send_private.organization_policy SET revision=revision+1,updated_at=clock_timestamp()
      WHERE organization_id=OLD.organization_id;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION app_send_private.bump_send_policy() FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
CREATE TRIGGER suppression_policy_revision AFTER INSERT OR UPDATE OR DELETE
  ON app_send_private.recipient_suppressions FOR EACH ROW EXECUTE FUNCTION app_send_private.bump_send_policy();
CREATE TRIGGER mailbox_policy_revision AFTER UPDATE OR DELETE
  ON app_send_private.mailbox_policy FOR EACH ROW EXECUTE FUNCTION app_send_private.bump_send_policy();
-- AIDEV-NOTE: Reuse BE03's current compose + approve_send + draft scope gate.
-- The actor/org GUC is derived only from immutable intent and restored before return.
CREATE FUNCTION app_send_private.current_capability(p_intent app_send_private.intents)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE prior_user text := current_setting('app.user_id',true);
  prior_org text := current_setting('app.org_id',true); binding jsonb;
BEGIN
  PERFORM set_config('app.user_id',p_intent.approved_by::text,true);
  PERFORM set_config('app.org_id',p_intent.organization_id::text,true);
  binding := app_send_private.read_draft_binding(p_intent.mailbox_id,p_intent.draft_id);
  PERFORM set_config('app.user_id',COALESCE(prior_user,''),true);
  PERFORM set_config('app.org_id',COALESCE(prior_org,''),true);
  RETURN NOT (binding ? 'code') AND binding->>'actor_id'=p_intent.approved_by::text
    AND binding->>'state'='consumed';
END $$;
REVOKE ALL ON FUNCTION app_send_private.current_capability(app_send_private.intents)
  FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
-- Discovery reveals only a due UUID in the currently readable control epoch.
-- It takes no row lock; claim_job is the serialized authority decision.
CREATE FUNCTION app_send_private.next_due_send(p_epoch uuid) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT j.send_id FROM app_send_private.jobs j
    JOIN app_send_private.intents i ON i.send_id=j.send_id
    WHERE p_epoch IS NOT NULL AND i.approval_epoch=p_epoch AND i.simulated
      AND j.next_check_at <= clock_timestamp() AND j.next_action IN ('submit','reconcile')
      AND j.state NOT IN ('accepted','rejected','cancelled','needs_review')
      AND (j.cancel_requested_at IS NULL OR j.next_action='reconcile')
      AND (j.lease_id IS NULL OR j.lease_expires_at <= clock_timestamp())
    ORDER BY j.next_check_at,j.send_id LIMIT 1
$$;
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
    'action',j.next_action,'attempts',j.attempt_count,'simulated',true);
END $$;

CREATE FUNCTION app_send_private.authorize_attempt(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_capability_hash bytea,p_profile text,p_deadline_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; g jsonb; n timestamptz := clock_timestamp();
  pol bigint; mailbox_on boolean; snap jsonb; recipient jsonb; address text; suppressed boolean := false;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_attempt IS NULL OR p_epoch IS NULL
    OR p_capability_hash IS NULL OR octet_length(p_capability_hash) <> 32
    OR p_profile IS DISTINCT FROM 'synthetic-v1'
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
  IF jsonb_typeof(snap)='array' AND jsonb_array_length(snap)=13
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
    OR p_capability_hash <> sha256(convert_to('local:synthetic-v1','UTF8')) THEN
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

-- Fenced read of the one immutable approved snapshot. Reconciliation receives the
-- latest attempt identity and digest, never an authorization to submit again.
CREATE FUNCTION app_send_private.worker_binding(p_send uuid,p_lease uuid,p_generation bigint,p_epoch uuid)
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
    'snapshot_hex',CASE WHEN j.next_action='submit' THEN encode(i.snapshot_bytes,'hex') ELSE NULL END);
END $$;

-- The final check is a fresh authority decision immediately before local I/O.
-- Locks are released at statement commit; later revocation cannot undo a possible call.
CREATE FUNCTION app_send_private.final_attempt_check(p_send uuid,p_lease uuid,p_generation bigint,
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
  IF jsonb_typeof(snap)='array' AND jsonb_array_length(snap)=13
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
    AND a.profile='synthetic-v1' AND a.capability_hash=sha256(convert_to('local:synthetic-v1','UTF8'))
    AND g->>'status'='ok' AND (g->>'organization_id')::uuid=i.organization_id
    AND (g->>'auth_session_id')::uuid=i.approval_auth_session_id
    AND (g->>'context_id')::uuid=i.approval_context_id
    AND (g->>'authorization_generation')::bigint=i.approval_generation
    AND pol=i.approval_policy_revision AND mailbox_on=true
    AND snap->>10='correspondence' AND snap->>11='human_correspondence_attestation'
    AND NOT suppressed AND app_send_private.current_capability(i),false));
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
    OR (p_receipt IS NOT NULL AND (char_length(p_receipt) NOT BETWEEN 1 AND 256
      OR p_receipt !~ '^local:[0-9a-f]{64}$')) THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  IF NOT FOUND OR a.attempt_no <> j.attempt_count
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

-- A no-evidence reconciliation consumes its lease and a bounded durable counter.
CREATE FUNCTION app_send_private.reconcile_no_evidence(p_send uuid,p_lease uuid,p_generation bigint,p_attempt uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE check_id uuid := gen_random_uuid();
BEGIN
  RETURN app_send_private.record_observation(p_send,p_lease,p_generation,check_id,p_attempt,
    'unknown',NULL,sha256(convert_to('local:no-evidence:'||check_id::text,'UTF8')));
END $$;

REVOKE ALL ON FUNCTION app_send_private.next_due_send(uuid),
  app_send_private.claim_job(uuid,uuid,uuid,integer),
  app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer),
  app_send_private.cancel_job(uuid,uuid,uuid),
  app_send_private.worker_binding(uuid,uuid,bigint,uuid),
  app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid),
  app_send_private.reconcile_no_evidence(uuid,uuid,bigint,uuid),
  app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
REVOKE ALL ON app_send_private.reconciliation_checks FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT USAGE ON SCHEMA app_send_private TO elevateo_worker;
GRANT EXECUTE ON FUNCTION app_send_private.next_due_send(uuid),
  app_send_private.claim_job(uuid,uuid,uuid,integer),
  app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer),
  app_send_private.worker_binding(uuid,uuid,bigint,uuid),
  app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid),
  app_send_private.reconcile_no_evidence(uuid,uuid,bigint,uuid),
  app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea) TO elevateo_worker;
-- Cancellation is internal until the scoped API facade is agreed with Cassian.
SET LOCAL ROLE elevateo_owner;
