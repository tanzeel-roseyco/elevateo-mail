-- AIDEV-NOTE: Lock provisioning and history before testing emptiness; rollback never discards quota evidence.
SET LOCAL ROLE elevateo_send_owner;
-- AIDEV-NOTE: Runtime inserts attempts before taking route locks; DDL must use the same order to avoid a cycle.
LOCK TABLE app_send_private.attempts,app_send_private.budget_routes,app_send_private.budget_limits,
  app_send_private.budget_usage,app_send_private.attempt_budgets IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM app_send_private.budget_routes) OR EXISTS(SELECT 1 FROM app_send_private.budget_limits)
    OR EXISTS(SELECT 1 FROM app_send_private.budget_usage) OR EXISTS(SELECT 1 FROM app_send_private.attempt_budgets) THEN
    RAISE EXCEPTION 'budget configuration or history prevents downgrade' USING ERRCODE='55000';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION app_send_private.authorize_attempt(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_capability_hash bytea,p_profile text,p_deadline_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; g jsonb; n timestamptz := clock_timestamp();
  pol bigint; mailbox_on boolean; snap jsonb; recipient jsonb; address text; suppressed boolean := false; account app_send_private.smtp_accounts;
BEGIN
  IF p_send IS NULL OR p_lease IS NULL OR p_generation IS NULL OR p_attempt IS NULL OR p_epoch IS NULL
    OR p_capability_hash IS NULL OR octet_length(p_capability_hash) <> 32
    OR p_profile IS NULL OR p_profile NOT IN ('synthetic-v1','mailpit-smtp-test-v1','mox-smtp-test-v1')
    OR p_deadline_seconds IS NULL OR p_deadline_seconds NOT BETWEEN 1 AND 60 THEN RETURN '{"code":"request_invalid"}'::jsonb; END IF;
  -- AIDEV-NOTE: Lock order is session, generation, policy, mailbox, SMTP account, then job. A concurrent cancel only needs the job lock.
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  g := app_auth.send_worker_guard(i.approval_session_digest,i.approved_by,i.organization_id);
  SELECT revision INTO pol FROM app_send_private.organization_policy
    WHERE organization_id=i.organization_id FOR SHARE;
  SELECT enabled INTO mailbox_on FROM app_send_private.mailbox_policy
    WHERE organization_id=i.organization_id AND mailbox_id=i.mailbox_id FOR SHARE;
  SELECT * INTO account FROM app_send_private.smtp_accounts
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
    OR (p_profile='mox-smtp-test-v1' AND (account.id IS NULL OR NOT account.active
      OR account.sender IS DISTINCT FROM (snap->5->>1)))
    OR suppressed OR NOT app_send_private.current_capability(i)
    OR NOT ((p_profile='synthetic-v1'
      AND p_capability_hash=sha256(convert_to('local:synthetic-v1','UTF8')))
      OR (p_profile='mailpit-smtp-test-v1'
        AND p_capability_hash=sha256(convert_to('local:mailpit-smtp-test-v1','UTF8')))
      OR (p_profile='mox-smtp-test-v1'
        AND p_capability_hash=sha256(convert_to('local:mox-smtp-test-v1','UTF8')))) THEN
    UPDATE app_send_private.jobs SET state='needs_review',next_action='none',next_check_at=NULL,
      lease_id=NULL,lease_expires_at=NULL,hold_reason='authorization_changed',updated_at=n WHERE send_id=p_send;
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  INSERT INTO app_send_private.attempts(send_id,attempt_no,attempt_id,lease_generation,authorized_at,
    call_deadline_at,capability_hash,profile,smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender)
    VALUES(p_send,j.attempt_count+1,p_attempt,p_generation,n,n+make_interval(secs=>p_deadline_seconds),p_capability_hash,p_profile,
      CASE WHEN p_profile='mox-smtp-test-v1' THEN account.id END,
      CASE WHEN p_profile='mox-smtp-test-v1' THEN account.credential_version END,
      CASE WHEN p_profile='mox-smtp-test-v1' THEN account.credential_ref END,
      CASE WHEN p_profile='mox-smtp-test-v1' THEN account.sender END);
  UPDATE app_send_private.jobs SET state='dispatching',attempt_count=j.attempt_count+1,
    first_possible_at=COALESCE(j.first_possible_at,n),retry_deadline_at=COALESCE(j.retry_deadline_at,n+interval '24 hours'),
    next_action='reconcile',next_check_at=n+make_interval(secs=>p_deadline_seconds),updated_at=n WHERE send_id=p_send;
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,lease_generation,from_state,to_state,recorded_at)
    VALUES(p_send,'attempt:'||(j.attempt_count+1),'attempt_authorized',p_generation,j.state,'dispatching',n);
  RETURN jsonb_build_object('attempt_id',p_attempt,'attempt_no',j.attempt_count+1,
    'call_deadline_at',n+make_interval(secs=>p_deadline_seconds),'simulated',true)
    || CASE WHEN p_profile='mox-smtp-test-v1' THEN jsonb_build_object('credential_binding',
      jsonb_build_object('organization_id',i.organization_id,'mailbox_id',i.mailbox_id,'account_id',account.id,
        'credential_version',account.credential_version,'credential_ref',account.credential_ref,'protocol','smtp'))
      ELSE '{}'::jsonb END;
END $$;

CREATE OR REPLACE FUNCTION app_send_private.final_attempt_check(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE i app_send_private.intents; j app_send_private.jobs; a app_send_private.attempts;
  g jsonb; pol bigint; mailbox_on boolean; snap jsonb; recipient jsonb; address text; suppressed boolean := false; account app_send_private.smtp_accounts;
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
  SELECT * INTO account FROM app_send_private.smtp_accounts
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
      OR (a.profile='mailpit-smtp-test-v1' AND a.capability_hash=sha256(convert_to('local:mailpit-smtp-test-v1','UTF8')))
      OR (a.profile='mox-smtp-test-v1' AND a.capability_hash=sha256(convert_to('local:mox-smtp-test-v1','UTF8'))))
    AND g->>'status'='ok' AND (g->>'organization_id')::uuid=i.organization_id
    AND (g->>'auth_session_id')::uuid=i.approval_auth_session_id
    AND (g->>'context_id')::uuid=i.approval_context_id
    AND (g->>'authorization_generation')::bigint=i.approval_generation
    AND pol=i.approval_policy_revision AND mailbox_on=true
    AND snap->>10='correspondence' AND snap->>11='human_correspondence_attestation'
    AND (a.profile<>'mox-smtp-test-v1' OR (account.active=true AND account.id=a.smtp_account_id
      AND account.credential_version=a.smtp_credential_version AND account.credential_ref=a.smtp_credential_ref
      AND account.sender=a.smtp_sender AND account.sender=snap->5->>1))
    AND NOT suppressed AND app_send_private.current_capability(i),false));
END $$;
DROP FUNCTION app_send_private.check_budget(uuid,uuid),app_send_private.reserve_budget(uuid,uuid);
DROP FUNCTION app_send_private.budget_requirements(uuid);
DROP TABLE app_send_private.attempt_budgets,app_send_private.budget_usage,app_send_private.budget_limits,
  app_send_private.budget_routes;
DROP FUNCTION app_send_private.guard_budget_limit(),app_send_private.guard_budget_route(),
  app_send_private.valid_budget_scope(text,jsonb);
SET LOCAL ROLE elevateo_owner;
