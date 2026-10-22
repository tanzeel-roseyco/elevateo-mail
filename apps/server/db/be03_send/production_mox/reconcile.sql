CREATE OR REPLACE FUNCTION app_send_private.reconcile_no_evidence(p_send uuid,p_lease uuid,p_generation bigint,p_attempt uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE check_id uuid := gen_random_uuid(); profile text;
BEGIN
  -- AIDEV-NOTE: Live unknown results must retain provider provenance and simulated=false without another POST.
  SELECT a.profile INTO profile FROM app_send_private.attempts a WHERE a.send_id=p_send AND a.attempt_id=p_attempt;
  IF profile='mox-smtp-v1' THEN
    RETURN app_send_private.record_observation_v2(p_send,p_lease,p_generation,check_id,p_attempt,
      'unknown',NULL,sha256(convert_to('mox:no-evidence:'||check_id::text,'UTF8')),'mox_smtp_v1');
  END IF;
  IF profile='resend-v1' THEN
    RETURN app_send_private.record_observation_v2(p_send,p_lease,p_generation,check_id,p_attempt,
      'unknown',NULL,sha256(convert_to('resend:no-evidence:'||check_id::text,'UTF8')),'resend_v1');
  END IF;
  RETURN app_send_private.record_observation(p_send,p_lease,p_generation,check_id,p_attempt,
    'unknown',NULL,sha256(convert_to('local:no-evidence:'||check_id::text,'UTF8')));
END $$;
