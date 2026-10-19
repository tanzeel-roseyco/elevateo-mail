-- AIDEV-NOTE: Private metadata is scoped by immutable intent identity; only send owner can call this bridge.
RESET ROLE;
-- AIDEV-NOTE: NOLOGIN send owner reads scoped consent and locks email rows; API/worker gain no table privileges.
GRANT SELECT (organization_id,email,consent_status,consent_recorded_at,consent_source,consent_recorded_by), UPDATE (email)
 ON app.campaign_leads TO elevateo_send_owner;
CREATE POLICY send_owner_consent_select ON app.campaign_leads FOR SELECT TO elevateo_send_owner USING (true);
-- AIDEV-NOTE: PostgreSQL row locks need UPDATE visibility; WITH CHECK rejects every actual mutation.
CREATE POLICY send_owner_consent_lock ON app.campaign_leads FOR UPDATE TO elevateo_send_owner
  USING (true) WITH CHECK (false);
GRANT USAGE, CREATE ON SCHEMA app_send_private TO elevateo_owner;
SET LOCAL ROLE elevateo_owner;
CREATE FUNCTION app_send_private.draft_attachment_binding(p_org uuid,p_mailbox uuid,p_draft uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.attachment_id,'object_key',s.object_key,
 'filename',s.filename,'content_type',s.content_type,'byte_size',s.byte_size,'sha256',s.sha256,
 'status',COALESCE(a.scan_status,'pending_scan')) ORDER BY s.attachment_id),'[]'::jsonb)
 FROM app_drafts_private.attachment_stage_operations s LEFT JOIN app.draft_attachments a ON a.id=s.attachment_id
 WHERE s.organization_id=p_org AND s.mailbox_id=p_mailbox AND s.draft_id=p_draft
 AND s.stage_state IN ('reserved','committed')
$$;
REVOKE ALL ON FUNCTION app_send_private.draft_attachment_binding(uuid,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.draft_attachment_binding(uuid,uuid,uuid) TO elevateo_send_owner;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_send_private FROM elevateo_owner;
SET LOCAL ROLE elevateo_send_owner;
ALTER TABLE app_send_private.intents DROP CONSTRAINT intents_snapshot_format_check;
ALTER TABLE app_send_private.intents ADD CONSTRAINT intents_snapshot_format_check CHECK(snapshot_format IN ('elevateo.send.snapshot.v1','elevateo.send.snapshot.v2'));
CREATE FUNCTION app_send_private.attachment_tuples(p_items jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_array(x->'id',x->'object_key',x->'filename',x->'content_type',x->'byte_size',x->'sha256') ORDER BY x->>'id'),'[]'::jsonb) FROM jsonb_array_elements(p_items) x
$$;
REVOKE ALL ON FUNCTION app_send_private.attachment_tuples(jsonb) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
SET LOCAL ROLE elevateo_send_owner;
CREATE OR REPLACE FUNCTION app_send_private.review_policy(p_binding jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT p_binding || jsonb_build_object(
    'attachment_binding',app_send_private.draft_attachment_binding((p_binding->>'organization_id')::uuid,(p_binding->>'mailbox_id')::uuid,(p_binding->>'draft_id')::uuid),
    'policy_revision',(SELECT revision::text FROM app_send_private.organization_policy
      WHERE organization_id = (p_binding->>'organization_id')::uuid),
    'mailbox_enabled',COALESCE((SELECT enabled FROM app_send_private.mailbox_policy
      WHERE organization_id = (p_binding->>'organization_id')::uuid AND mailbox_id = (p_binding->>'mailbox_id')::uuid),false),
    'suppressed_addresses',COALESCE((SELECT jsonb_agg(canonical_address ORDER BY canonical_address)
      FROM app_send_private.recipient_suppressions WHERE organization_id = (p_binding->>'organization_id')::uuid
      AND canonical_address IN (SELECT app_send_private.canonical_address(value->>'address')
        FROM jsonb_array_elements(p_binding->'recipients'))),'[]'::jsonb),
    'consented_addresses',COALESCE((SELECT jsonb_agg(DISTINCT app_send_private.canonical_address(email) ORDER BY app_send_private.canonical_address(email))
      FROM app.campaign_leads WHERE organization_id=(p_binding->>'organization_id')::uuid
      AND consent_status='granted' AND consent_recorded_at IS NOT NULL AND consent_source IS NOT NULL
      AND consent_recorded_by IS NOT NULL AND app_send_private.canonical_address(email) IN
        (SELECT app_send_private.canonical_address(value->>'address')
          FROM jsonb_array_elements(p_binding->'recipients'))),'[]'::jsonb))
$$;
CREATE OR REPLACE FUNCTION app_send_private.snapshot_validation(p_binding jsonb,p_bytes bytea,p_digest text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE recipients jsonb := '[]'; item jsonb; address text; seen text[] := '{}'; expected jsonb; attachments jsonb := COALESCE(p_binding->'attachment_binding','[]'::jsonb);
BEGIN
  IF jsonb_array_length(attachments)>1 OR (jsonb_array_length(attachments)>0 AND (EXISTS(SELECT 1 FROM jsonb_array_elements(attachments) x WHERE x->>'status'<>'clean'))) THEN RETURN 'send_not_ready'; END IF;
  -- AIDEV-NOTE: Explicit C0/DEL ranges preserve C1 scalars; PostgreSQL's control class also includes C1.
  IF p_binding->>'policy_revision' IS NULL OR NOT (p_binding->>'mailbox_enabled')::boolean OR
    NOT (p_binding->>'reply_available')::boolean OR app_send_private.canonical_address(p_binding->>'sender_address') IS NULL OR
    (p_binding->>'subject') COLLATE "C" ~ U&'[\0001-\001f\007f]' OR jsonb_array_length(p_binding->'recipients') NOT BETWEEN 1 AND 100 THEN
    RETURN 'send_not_ready';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_binding->'recipients') LOOP
    address := app_send_private.canonical_address(item->>'address');
    IF address IS NULL OR address = ANY(seen) OR (item->>'display_name') COLLATE "C" ~ U&'[\0001-\001f\007f]'
      OR (p_binding->'suppressed_addresses') ? address THEN RETURN 'send_not_ready'; END IF;
    seen := array_append(seen,address);
    recipients := recipients || jsonb_build_array(jsonb_build_array(item->'display_name',address));
  END LOOP;
  expected := jsonb_build_array(CASE WHEN jsonb_array_length(attachments)>0 THEN 'elevateo.send.snapshot.v2' ELSE 'elevateo.send.snapshot.v1' END,p_binding->'organization_id',p_binding->'mailbox_id',
    p_binding->'draft_id',p_binding->'version',jsonb_build_array(NULL,app_send_private.canonical_address(p_binding->>'sender_address')),
    recipients,p_binding->'subject',p_binding->'body_text',p_binding->'reply_to_thread_id','correspondence',
    'human_correspondence_attestation',app_send_private.attachment_tuples(attachments),p_binding->'policy_revision');
  IF octet_length(convert_to(app_send_private.compact_json(expected),'UTF8')) > 1048576 THEN RETURN 'send_not_ready'; END IF;
  IF p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 1 AND 1048576 OR
    p_bytes <> convert_to(app_send_private.compact_json(expected),'UTF8') OR
    encode(sha256(p_bytes),'hex') IS DISTINCT FROM p_digest THEN RETURN 'review_stale'; END IF;
  RETURN NULL;
END $$;
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
    IF p_outbound_mode<>'resend' AND jsonb_array_length(binding->'attachment_binding')>0 THEN code := 'send_not_ready'; END IF;
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
    p_epoch,p_review_digest,p_snapshot_bytes,convert_from(p_snapshot_bytes,'UTF8')::jsonb->>0,p_outbound_mode<>'resend') RETURNING * INTO intent;
  INSERT INTO app_send_private.jobs(send_id,state,next_action,next_check_at,policy_profile,updated_at)
    VALUES(send,'queued','submit',now_at,'none',now_at);
  INSERT INTO app_send_private.audit_events(send_id,event_key,kind,actor_id,to_state,recorded_at)
    VALUES(send,'approved','approved',actor,'queued',now_at);
  PERFORM app_send_private.consume_draft(p_session_digest,p_mailbox,p_draft,p_expected);
  PERFORM app_send_private.record_approval_operation(org,actor,p_operation,p_mailbox,p_draft,p_expected,request_digest,send,NULL);
  RETURN app_send_private.approval_result(intent);
END $$;

-- AIDEV-NOTE: Both authority checks compare the immutable approved metadata and current scan state.
CREATE FUNCTION app_send_private.resend_attachments_allowed(p_intent app_send_private.intents) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(app_send_private.draft_attachment_binding(p_intent.organization_id,p_intent.mailbox_id,p_intent.draft_id)) x WHERE x->>'status'<>'clean')
 AND app_send_private.attachment_tuples(app_send_private.draft_attachment_binding(p_intent.organization_id,p_intent.mailbox_id,p_intent.draft_id)) = (convert_from(p_intent.snapshot_bytes,'UTF8')::jsonb->12)
$$;
REVOKE ALL ON FUNCTION app_send_private.resend_attachments_allowed(app_send_private.intents) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
-- AIDEV-NOTE: Wrappers couple transport profile to the immutable ledger and recheck live consent before provider I/O.
CREATE OR REPLACE FUNCTION app_send_private.authorize_attempt(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_capability_hash bytea,p_profile text,p_deadline_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i app_send_private.intents; snapshot jsonb;
BEGIN
  -- AIDEV-NOTE: Validate nullable profiles before comparing ledger mode; NULL must retain boundary errors.
  IF p_profile IS NULL OR p_profile NOT IN ('synthetic-v1','mailpit-smtp-test-v1','mox-smtp-test-v1','resend-v1') THEN
    RETURN '{"code":"request_invalid"}'::jsonb;
  END IF;
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  IF NOT FOUND OR i.simulated IS DISTINCT FROM (p_profile<>'resend-v1') THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
  IF p_profile='resend-v1' THEN
    IF NOT app_send_private.resend_attachments_allowed(i) THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
    snapshot := convert_from(i.snapshot_bytes,'UTF8')::jsonb;
    PERFORM 1 FROM app.campaign_leads l WHERE l.organization_id=i.organization_id
      AND app_send_private.canonical_address(l.email) IN
        (SELECT app_send_private.canonical_address(value->>1) FROM jsonb_array_elements(snapshot->6)) FOR SHARE;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->6) recipient WHERE NOT EXISTS (
      SELECT 1 FROM app.campaign_leads l WHERE l.organization_id=i.organization_id
        AND app_send_private.canonical_address(l.email)=app_send_private.canonical_address(recipient->>1)
        AND l.consent_status='granted' AND l.consent_recorded_at IS NOT NULL
        AND l.consent_source IS NOT NULL AND l.consent_recorded_by IS NOT NULL)) THEN
      RETURN '{"code":"dispatch_held"}'::jsonb;
    END IF;
  END IF;
  RETURN app_send_private.authorize_attempt_legacy_v1(p_send,p_lease,p_generation,p_attempt,p_epoch,
    p_capability_hash,p_profile,p_deadline_seconds);
END $$;

CREATE OR REPLACE FUNCTION app_send_private.final_attempt_check(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i app_send_private.intents; a app_send_private.attempts; snapshot jsonb;
BEGIN
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt;
  IF NOT FOUND OR i.simulated IS DISTINCT FROM (a.profile<>'resend-v1') THEN RETURN '{"allowed":false}'::jsonb; END IF;
  IF a.profile='resend-v1' THEN
    IF NOT app_send_private.resend_attachments_allowed(i) THEN RETURN '{"allowed":false}'::jsonb; END IF;
    snapshot := convert_from(i.snapshot_bytes,'UTF8')::jsonb;
    PERFORM 1 FROM app.campaign_leads l WHERE l.organization_id=i.organization_id
      AND app_send_private.canonical_address(l.email) IN
        (SELECT app_send_private.canonical_address(value->>1) FROM jsonb_array_elements(snapshot->6)) FOR SHARE;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->6) recipient WHERE NOT EXISTS (
      SELECT 1 FROM app.campaign_leads l WHERE l.organization_id=i.organization_id
        AND app_send_private.canonical_address(l.email)=app_send_private.canonical_address(recipient->>1)
        AND l.consent_status='granted' AND l.consent_recorded_at IS NOT NULL
        AND l.consent_source IS NOT NULL AND l.consent_recorded_by IS NOT NULL)) THEN RETURN '{"allowed":false}'::jsonb; END IF;
  END IF;
  RETURN app_send_private.final_attempt_check_legacy_v1(p_send,p_lease,p_generation,p_attempt,p_epoch);
END $$;

REVOKE ALL ON FUNCTION app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer) FROM PUBLIC,elevateo_api,elevateo_app_read;
REVOKE ALL ON FUNCTION app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer) TO elevateo_worker;
GRANT EXECUTE ON FUNCTION app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid) TO elevateo_worker;

RESET ROLE;
