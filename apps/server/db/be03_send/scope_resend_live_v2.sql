-- AIDEV-NOTE: Approval responses preserve the immutable live/simulated ledger classification.
CREATE OR REPLACE FUNCTION app_send_private.approval_result(p_intent app_send_private.intents) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('send_id',p_intent.send_id,'draft_id',p_intent.draft_id,
    'approved_version',p_intent.draft_version,'review_digest',p_intent.review_digest,
    'approved_at',app_send_private.utc_timestamp(p_intent.approved_at),'simulated',p_intent.simulated)
$$;
