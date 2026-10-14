-- AIDEV-NOTE: Worker sees only a due UUID; the fenced claim and protected admission own all authority.
SET LOCAL ROLE elevateo_owner;
CREATE FUNCTION app.send_membership_capability(p_org uuid,p_mailbox uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM app.mailbox_memberships WHERE organization_id=p_org
    AND mailbox_id=p_mailbox AND user_id=p_actor AND compose AND approve_send)
$$;
REVOKE ALL ON FUNCTION app.send_membership_capability(uuid,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.send_membership_capability(uuid,uuid,uuid) TO elevateo_send_owner;
SET LOCAL ROLE elevateo_send_owner;
CREATE FUNCTION app_send_private.next_due_send(p_epoch uuid) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT j.send_id FROM app_send_private.jobs j JOIN app_send_private.intents i ON i.send_id=j.send_id
    WHERE i.approval_epoch=p_epoch AND j.next_check_at <= clock_timestamp() AND j.next_action <> 'none'
      AND j.state NOT IN ('accepted','rejected','cancelled','needs_review')
      AND (j.cancel_requested_at IS NULL OR j.next_action='reconcile')
    ORDER BY j.next_check_at,j.send_id LIMIT 1
$$;

-- AIDEV-NOTE: One job lock spans capability checks and durable attempt authorization.
CREATE FUNCTION app_send_private.authorize_and_read(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_profile text,p_seconds integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; result jsonb; snapshot jsonb;
BEGIN
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id = p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id = p_send;
  IF j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation OR j.cancel_requested_at IS NOT NULL
    OR i.approval_epoch IS DISTINCT FROM p_epoch THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
  IF NOT app.send_membership_capability(i.organization_id,i.mailbox_id,i.approved_by) THEN
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  snapshot := convert_from(i.snapshot_bytes,'UTF8')::jsonb;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->6) recipient
    JOIN app_send_private.recipient_suppressions suppression
      ON suppression.organization_id=i.organization_id AND suppression.canonical_address=recipient->>1) THEN
    RETURN '{"code":"dispatch_held"}'::jsonb;
  END IF;
  result := app_send_private.authorize_attempt(p_send,p_lease,p_generation,p_attempt,p_epoch,
    sha256(convert_to(jsonb_build_array('elevateo.send.capability.v1',i.organization_id,i.mailbox_id,
      i.approved_by,i.approval_generation,i.approval_policy_revision,p_epoch,p_profile,true)::text,'UTF8')),
    p_profile,p_seconds);
  IF result ? 'code' THEN RETURN result; END IF;
  RETURN result || jsonb_build_object('snapshot_hex',encode(i.snapshot_bytes,'hex'));
END $$;

-- AIDEV-NOTE: A cancellation after authorization leaves the attempt uncertain; this fence blocks the call.
CREATE FUNCTION app_send_private.final_submission_check(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; guard jsonb;
BEGIN
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  IF j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation
    OR j.lease_expires_at <= clock_timestamp() OR j.state <> 'dispatching'
    OR j.cancel_requested_at IS NOT NULL OR i.approval_epoch IS DISTINCT FROM p_epoch
    OR NOT EXISTS (SELECT 1 FROM app_send_private.attempts WHERE send_id=p_send AND attempt_id=p_attempt)
    OR NOT app.send_membership_capability(i.organization_id,i.mailbox_id,i.approved_by) THEN RETURN false; END IF;
  guard := app_auth.send_worker_guard(i.approval_session_digest,i.approved_by,i.organization_id);
  IF guard->>'status' <> 'ok' OR (guard->>'authorization_generation')::bigint IS DISTINCT FROM i.approval_generation
    OR NOT EXISTS (SELECT 1 FROM app_send_private.organization_policy WHERE organization_id=i.organization_id
      AND revision=i.approval_policy_revision)
    OR NOT EXISTS (SELECT 1 FROM app_send_private.mailbox_policy WHERE organization_id=i.organization_id
      AND mailbox_id=i.mailbox_id AND enabled) THEN RETURN false; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(convert_from(i.snapshot_bytes,'UTF8')::jsonb->6) recipient
    JOIN app_send_private.recipient_suppressions suppression
      ON suppression.organization_id=i.organization_id AND suppression.canonical_address=recipient->>1);
END $$;

-- Reconciliation reads only the exact leased attempt and its immutable snapshot digest.
CREATE FUNCTION app_send_private.reconciliation_binding(p_send uuid,p_lease uuid,p_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE j app_send_private.jobs; i app_send_private.intents; a app_send_private.attempts;
BEGIN
  SELECT * INTO j FROM app_send_private.jobs WHERE send_id=p_send;
  IF NOT FOUND OR j.lease_id IS DISTINCT FROM p_lease OR j.lease_generation <> p_generation
    OR j.next_action <> 'reconcile' THEN RETURN '{"code":"stale_lease"}'::jsonb; END IF;
  SELECT * INTO STRICT i FROM app_send_private.intents WHERE send_id=p_send;
  SELECT * INTO a FROM app_send_private.attempts WHERE send_id=p_send ORDER BY attempt_no DESC LIMIT 1;
  IF NOT FOUND THEN RETURN '{"code":"not_available"}'::jsonb; END IF;
  RETURN jsonb_build_object('attempt_id',a.attempt_id,'snapshot_digest',encode(sha256(i.snapshot_bytes),'hex'));
END $$;
REVOKE ALL ON FUNCTION app_send_private.next_due_send(uuid),
  app_send_private.authorize_and_read(uuid,uuid,bigint,uuid,uuid,text,integer),
  app_send_private.final_submission_check(uuid,uuid,bigint,uuid,uuid),
  app_send_private.reconciliation_binding(uuid,uuid,bigint) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.next_due_send(uuid),
  app_send_private.authorize_and_read(uuid,uuid,bigint,uuid,uuid,text,integer),
  app_send_private.final_submission_check(uuid,uuid,bigint,uuid,uuid),
  app_send_private.reconciliation_binding(uuid,uuid,bigint) TO elevateo_worker;
SET LOCAL ROLE elevateo_owner;
