-- AIDEV-NOTE: Wrappers couple transport profile to the immutable ledger and recheck live consent before provider I/O.
CREATE OR REPLACE FUNCTION app_send_private.authorize_attempt(p_send uuid,p_lease uuid,p_generation bigint,
  p_attempt uuid,p_epoch uuid,p_capability_hash bytea,p_profile text,p_deadline_seconds integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE i app_send_private.intents; snapshot jsonb;
BEGIN
  SELECT * INTO i FROM app_send_private.intents WHERE send_id=p_send;
  IF NOT FOUND OR i.simulated IS DISTINCT FROM (p_profile<>'resend-v1') THEN RETURN '{"code":"dispatch_held"}'::jsonb; END IF;
  IF p_profile='resend-v1' THEN
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
