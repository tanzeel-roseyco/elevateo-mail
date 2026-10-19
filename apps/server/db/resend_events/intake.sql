CREATE FUNCTION app.receive_resend_event(p_id text,p_body text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event jsonb; existing text; digest text;
BEGIN
 IF session_user <> 'elevateo_api' THEN RAISE EXCEPTION 'api only' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_id !~ '^msg_[A-Za-z0-9_-]{1,120}$' OR p_body IS NULL OR
 octet_length(p_body) NOT BETWEEN 1 AND 262144 THEN RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF;
 event := p_body::jsonb;
 IF jsonb_typeof(event) <> 'object' OR event->>'type' IS NULL OR
 event->>'type' !~ '^email\.[a-z_]{1,40}$' OR
 event#>>'{data,email_id}' IS NULL OR event#>>'{data,email_id}' !~ '^[A-Za-z0-9_-]{1,128}$' THEN
 RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF;
 digest := encode(sha256(convert_to(p_body,'UTF8')),'hex');
 INSERT INTO app.resend_webhook_events(event_id,body_digest,payload) VALUES(p_id,digest,event)
 ON CONFLICT DO NOTHING;
 SELECT body_digest INTO existing FROM app.resend_webhook_events WHERE event_id=p_id;
 RETURN jsonb_build_object('result',CASE WHEN existing=digest THEN 'stored' ELSE 'conflict' END);
END $$;
REVOKE ALL ON FUNCTION app.receive_resend_event(text,text) FROM PUBLIC,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.receive_resend_event(text,text) TO elevateo_api;
CREATE FUNCTION app.claim_resend_event(p_lease uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event app.resend_webhook_events%ROWTYPE;
BEGIN
 IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
 IF p_lease IS NULL THEN RAISE EXCEPTION 'invalid lease' USING ERRCODE='22023'; END IF;
 SELECT * INTO event FROM app.resend_webhook_events WHERE status='pending' AND next_attempt_at<=clock_timestamp()
 AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY next_attempt_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('result','empty'); END IF;
 UPDATE app.resend_webhook_events SET lease=p_lease,lease_until=clock_timestamp()+interval '10 minutes',
 next_attempt_at=clock_timestamp()+interval '10 minutes',attempts=attempts+1 WHERE event_id=event.event_id;
 RETURN jsonb_build_object('result','claimed','id',event.event_id,'lease',p_lease,'payload',event.payload);
END $$;
REVOKE ALL ON FUNCTION app.claim_resend_event(uuid) FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.claim_resend_event(uuid) TO elevateo_worker;
