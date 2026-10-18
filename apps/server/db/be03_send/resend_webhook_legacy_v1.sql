-- AIDEV-NOTE: Reversible rollback restores the pre-ownership lookup without rerunning its shipped migration.
CREATE OR REPLACE FUNCTION app.ingest_resend_event(p_event text,p_type text,p_provider text,p_email text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid; target_org uuid; inserted boolean;
BEGIN
  SELECT j.send_id,i.organization_id INTO target,target_org FROM app_send_private.jobs j
    JOIN app_send_private.intents i USING(send_id) WHERE j.accepted_receipt_ref='resend:'||p_provider;
  INSERT INTO app_send_private.resend_events(event_id,event_type,provider_id,delivery_state,send_id)
    VALUES(p_event,p_type,p_provider,CASE p_type WHEN 'email.sent' THEN 'sent' WHEN 'email.delivered' THEN 'delivered'
      WHEN 'email.delivery_delayed' THEN 'delivery_delayed' WHEN 'email.bounced' THEN 'bounced'
      WHEN 'email.complained' THEN 'complained' ELSE 'received' END,target) ON CONFLICT(event_id) DO NOTHING;
  inserted := FOUND;
  RETURN jsonb_build_object('result',CASE WHEN inserted THEN 'created' ELSE 'duplicate' END);
END $$;
