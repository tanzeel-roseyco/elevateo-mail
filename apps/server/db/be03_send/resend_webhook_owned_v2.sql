-- AIDEV-NOTE: Unknown provider ids are acknowledged without persistence so ownership is never disclosed.
CREATE OR REPLACE FUNCTION app.ingest_resend_event(p_event text,p_type text,p_provider text,p_email text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; target_org uuid; snapshot jsonb; inserted boolean; state text;
BEGIN
  SELECT a.send_id,i.organization_id,convert_from(i.snapshot_bytes,'UTF8')::jsonb
    INTO target,target_org,snapshot
    FROM app_send_private.observations o
    JOIN app_send_private.attempts a ON a.attempt_id=o.attempt_id
    JOIN app_send_private.intents i ON i.send_id=a.send_id
    WHERE o.receipt_ref='resend:'||p_provider AND o.kind='accepted' AND o.source='resend_v1'
    ORDER BY o.received_at DESC LIMIT 1;
  IF target IS NULL THEN RETURN '{"result":"ignored"}'::jsonb; END IF;
  state := CASE p_type WHEN 'email.sent' THEN 'sent' WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.delivery_delayed' THEN 'delivery_delayed' WHEN 'email.bounced' THEN 'bounced'
    WHEN 'email.complained' THEN 'complained' ELSE 'received' END;
  INSERT INTO app_send_private.resend_events(event_id,event_type,provider_id,delivery_state,send_id)
    VALUES(p_event,p_type,p_provider,state,target) ON CONFLICT(event_id) DO NOTHING;
  inserted := FOUND;
  IF inserted AND p_type IN ('email.bounced','email.complained') AND p_email IS NOT NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->6) recipient
      WHERE app_send_private.canonical_address(recipient->>1)=app_send_private.canonical_address(p_email)) THEN
    INSERT INTO app_send_private.recipient_suppressions(organization_id,canonical_address,created_at)
      VALUES(target_org,app_send_private.canonical_address(p_email),clock_timestamp()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('result',CASE WHEN inserted THEN 'created' ELSE 'duplicate' END,
    'delivery_state',state);
END $$;

REVOKE ALL ON FUNCTION app.ingest_resend_event(text,text,text,text) FROM PUBLIC,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.ingest_resend_event(text,text,text,text) TO elevateo_api;
