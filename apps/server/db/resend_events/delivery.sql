SET LOCAL ROLE elevateo_send_owner;
GRANT USAGE ON SCHEMA app_send_private TO elevateo_owner;
-- AIDEV-NOTE: Delivery never rewrites acceptance. Suppression uses only recipients from the approved immutable intent.
CREATE TABLE app_send_private.resend_delivery (
 send_id uuid PRIMARY KEY REFERENCES app_send_private.intents(send_id),
 kind text NOT NULL, severity integer NOT NULL, occurred_at timestamptz NOT NULL
);
ALTER TABLE app_send_private.resend_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_send_private.resend_delivery FORCE ROW LEVEL SECURITY;
CREATE POLICY resend_delivery_owner ON app_send_private.resend_delivery TO elevateo_send_owner USING(true) WITH CHECK(true);
REVOKE ALL ON app_send_private.resend_delivery FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
-- AIDEV-NOTE: Signed provider tags bind ambiguous HTTP outcomes to the already-authorized immutable attempt.
CREATE TABLE app_send_private.resend_acceptance (
 attempt_id uuid PRIMARY KEY REFERENCES app_send_private.attempts(attempt_id),
 receipt_ref text NOT NULL UNIQUE, evidence_digest bytea NOT NULL CHECK(octet_length(evidence_digest)=32)
);
ALTER TABLE app_send_private.resend_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_send_private.resend_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY resend_acceptance_owner ON app_send_private.resend_acceptance TO elevateo_send_owner USING(true) WITH CHECK(true);
REVOKE ALL ON app_send_private.resend_acceptance FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
CREATE FUNCTION app_send_private.resend_acceptance_evidence(p_send uuid,p_attempt uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE evidence app_send_private.resend_acceptance%ROWTYPE;
BEGIN
 IF session_user<>'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
 SELECT e.* INTO evidence FROM app_send_private.resend_acceptance e
 JOIN app_send_private.attempts a USING(attempt_id)
 WHERE a.send_id=p_send AND a.attempt_id=p_attempt AND a.profile='resend-v1';
 IF NOT FOUND THEN RETURN jsonb_build_object('receipt_ref',NULL); END IF;
 RETURN jsonb_build_object('receipt_ref',evidence.receipt_ref,'evidence_digest',encode(evidence.evidence_digest,'hex'));
END $$;
REVOKE ALL ON FUNCTION app_send_private.resend_acceptance_evidence(uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.resend_acceptance_evidence(uuid,uuid) TO elevateo_worker;
CREATE FUNCTION app_send_private.apply_resend_delivery(p_event jsonb) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE intent app_send_private.intents%ROWTYPE; kind text := p_event->>'type';
 severity integer; occurred timestamptz; receipt text := 'resend:'||(p_event#>>'{data,email_id}');
 recipient jsonb; snapshot jsonb; tagged_attempt uuid;
BEGIN
 IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
 severity := CASE kind WHEN 'email.sent' THEN 1 WHEN 'email.delivery_delayed' THEN 2
 WHEN 'email.delivered' THEN 3 WHEN 'email.failed' THEN 4 WHEN 'email.bounced' THEN 5
 WHEN 'email.suppressed' THEN 6 WHEN 'email.complained' THEN 7 ELSE 0 END;
 IF severity=0 THEN RETURN 'ignored'; END IF;
 SELECT i.* INTO intent FROM app_send_private.intents i JOIN app_send_private.jobs j USING(send_id)
 WHERE j.accepted_receipt_ref=receipt OR EXISTS(
 SELECT 1 FROM app_send_private.attempts a JOIN app_send_private.observations o USING(attempt_id)
 WHERE a.send_id=i.send_id AND o.receipt_ref=receipt AND o.source='resend_v1') LIMIT 1;
 IF NOT FOUND THEN
  SELECT i.* INTO intent FROM app_send_private.intents i
  JOIN app_send_private.attempts a USING(send_id) JOIN app_send_private.jobs j USING(send_id)
  WHERE i.send_id::text=p_event#>>'{data,tags,send_id}'
    AND a.attempt_id::text=p_event#>>'{data,tags,attempt_id}'
    AND a.profile='resend-v1' AND NOT i.simulated AND a.attempt_no=j.attempt_count;
  IF NOT FOUND THEN RETURN 'pending'; END IF;
 END IF;
 snapshot := convert_from(intent.snapshot_bytes,'UTF8')::jsonb;
 IF p_event#>>'{data,from}' IS DISTINCT FROM snapshot#>>'{5,1}' OR
    jsonb_typeof(p_event#>'{data,to}') IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_event#>'{data,to}')<>jsonb_array_length(snapshot->6) OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(snapshot->6) r WHERE NOT ((p_event#>'{data,to}') ? (r->>1)))
 THEN RETURN 'ignored'; END IF;
 SELECT a.attempt_id INTO tagged_attempt FROM app_send_private.attempts a
 JOIN app_send_private.jobs j USING(send_id)
 WHERE a.send_id=intent.send_id AND a.attempt_id::text=p_event#>>'{data,tags,attempt_id}'
 AND a.profile='resend-v1' AND a.attempt_no=j.attempt_count
 AND intent.send_id::text=p_event#>>'{data,tags,send_id}';
 IF tagged_attempt IS NOT NULL AND kind IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained') THEN
  INSERT INTO app_send_private.resend_acceptance(attempt_id,receipt_ref,evidence_digest)
  VALUES(tagged_attempt,receipt,sha256(convert_to(p_event::text,'UTF8'))) ON CONFLICT DO NOTHING;
 END IF;
 occurred := (p_event->>'created_at')::timestamptz;
 INSERT INTO app_send_private.resend_delivery(send_id,kind,severity,occurred_at)
 VALUES(intent.send_id,kind,severity,occurred) ON CONFLICT(send_id) DO UPDATE SET
 kind=EXCLUDED.kind,severity=EXCLUDED.severity,occurred_at=EXCLUDED.occurred_at
 WHERE EXCLUDED.severity>resend_delivery.severity OR
 (EXCLUDED.severity=resend_delivery.severity AND EXCLUDED.occurred_at>resend_delivery.occurred_at);
 IF severity>=5 THEN
  PERFORM 1 FROM app_send_private.organization_policy WHERE organization_id=intent.organization_id FOR UPDATE;
  snapshot := convert_from(intent.snapshot_bytes,'UTF8')::jsonb;
  FOR recipient IN SELECT value FROM jsonb_array_elements(snapshot->6) LOOP
   IF (p_event#>'{data,to}') ? (recipient->>1) THEN
    INSERT INTO app_send_private.recipient_suppressions(organization_id,canonical_address,created_at)
    VALUES(intent.organization_id,app_send_private.canonical_address(recipient->>1),clock_timestamp()) ON CONFLICT DO NOTHING;
   END IF;
  END LOOP;
 END IF;
 RETURN 'processed';
END $$;
REVOKE ALL ON FUNCTION app_send_private.apply_resend_delivery(jsonb) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.apply_resend_delivery(jsonb) TO elevateo_owner;
SET LOCAL ROLE elevateo_owner;
CREATE FUNCTION app.apply_resend_event(p_id text,p_lease uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event app.resend_webhook_events%ROWTYPE; outcome text;
BEGIN
 IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
 SELECT * INTO event FROM app.resend_webhook_events WHERE event_id=p_id FOR UPDATE;
 IF NOT FOUND OR p_lease IS NULL OR event.lease IS NULL OR event.lease_until IS NULL OR
 event.status<>'pending' OR event.lease IS DISTINCT FROM p_lease OR
 event.lease_until<clock_timestamp() THEN RETURN jsonb_build_object('result','stale'); END IF;
 IF event.payload->>'type'='email.received' THEN RETURN jsonb_build_object('result','requires_content'); END IF;
 outcome := app_send_private.apply_resend_delivery(event.payload);
 UPDATE app.resend_webhook_events SET status=outcome,lease=NULL,lease_until=NULL,
 next_attempt_at=clock_timestamp()+interval '1 minute',
 completed_at=CASE WHEN outcome<>'pending' THEN clock_timestamp() END WHERE event_id=p_id;
 RETURN jsonb_build_object('result',outcome);
END $$;
REVOKE ALL ON FUNCTION app.apply_resend_event(text,uuid) FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.apply_resend_event(text,uuid) TO elevateo_worker;
