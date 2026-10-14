-- AIDEV-NOTE: Reuse C/D UTC microsecond spelling so strict response projection accepts SQL-produced timestamps.
CREATE FUNCTION app_send_private.utc_timestamp(p_time timestamptz) RETURNS text
LANGUAGE sql STABLE STRICT SET search_path = pg_catalog AS $$
  SELECT to_char(p_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
-- AIDEV-NOTE: Scope precedes policy disclosure; return suppressions only for at most100 saved recipients.
CREATE FUNCTION app_send_private.review_policy(p_binding jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT p_binding || jsonb_build_object(
    'policy_revision',(SELECT revision::text FROM app_send_private.organization_policy
      WHERE organization_id = (p_binding->>'organization_id')::uuid),
    'mailbox_enabled',COALESCE((SELECT enabled FROM app_send_private.mailbox_policy
      WHERE organization_id = (p_binding->>'organization_id')::uuid AND mailbox_id = (p_binding->>'mailbox_id')::uuid),false),
    'suppressed_addresses',COALESCE((SELECT jsonb_agg(canonical_address ORDER BY canonical_address)
      FROM app_send_private.recipient_suppressions WHERE organization_id = (p_binding->>'organization_id')::uuid
      AND canonical_address IN (SELECT app_send_private.canonical_address(value->>'address')
        FROM jsonb_array_elements(p_binding->'recipients'))),'[]'::jsonb))
$$;
CREATE FUNCTION app.send_review(p_mailbox uuid,p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE binding jsonb;
BEGIN
  binding := app_send_private.read_draft_binding(p_mailbox,p_draft);
  IF binding ? 'code' THEN RETURN binding; END IF;
  RETURN app_send_private.review_policy(binding);
END $$;
CREATE FUNCTION app_send_private.approval_result(p_intent app_send_private.intents) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('send_id',p_intent.send_id,'draft_id',p_intent.draft_id,
    'approved_version',p_intent.draft_version,'review_digest',p_intent.review_digest,
    'approved_at',app_send_private.utc_timestamp(p_intent.approved_at),'simulated',true)
$$;
CREATE FUNCTION app_send_private.record_approval_operation(p_org uuid,p_actor uuid,p_operation uuid,p_mailbox uuid,
  p_draft uuid,p_expected integer,p_digest text,p_send uuid,p_code text) RETURNS void
LANGUAGE sql VOLATILE SET search_path = pg_catalog AS $$
  INSERT INTO app_send_private.approval_operations(organization_id,actor_id,operation_id,mailbox_id,draft_id,
    expected_version,request_digest,outcome,send_id,error_code,recorded_at)
  VALUES(p_org,p_actor,p_operation,p_mailbox,p_draft,p_expected,p_digest,
    CASE WHEN p_send IS NULL THEN 'conflict' ELSE 'approved' END,p_send,p_code,clock_timestamp())
$$;
