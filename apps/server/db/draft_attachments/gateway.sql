-- AIDEV-NOTE: Gateway resolves private object identity from an active reservation, never a caller-supplied key.
CREATE FUNCTION app_attachment_gateway.draft_binding(p_digest text,p_user uuid,p_auth uuid,
 p_context uuid,p_generation bigint,p_org uuid,p_mailbox uuid,p_draft uuid,p_operation uuid,p_token uuid)
RETURNS TABLE(storage_key text,byte_size integer,sha256 text,stage_state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb;
BEGIN
 IF session_user <> 'elevateo_attachment_gateway' OR current_user <> 'elevateo_owner' OR p_digest IS NULL OR p_user IS NULL OR
   p_auth IS NULL OR p_context IS NULL OR p_generation IS NULL THEN RETURN; END IF;
 proof := app_auth.authorize_session(p_digest,p_user,p_auth,p_context,p_generation);
 IF proof->>'status' IS DISTINCT FROM 'ok' OR (proof->>'organization_id')::uuid IS DISTINCT FROM p_org OR
   (proof->>'user_id')::uuid IS DISTINCT FROM p_user OR (proof->>'context_id')::uuid IS DISTINCT FROM p_context OR
   (proof->>'auth_session_id')::uuid IS DISTINCT FROM p_auth OR
   (proof->>'authorization_generation')::bigint IS DISTINCT FROM p_generation THEN RETURN; END IF;
 RETURN QUERY SELECT o.object_key,o.byte_size,o.sha256,o.stage_state
 FROM app_drafts_private.attachment_stage_operations o
 JOIN app.drafts d ON d.id=o.draft_id AND d.organization_id=o.organization_id AND d.mailbox_id=o.mailbox_id
 JOIN app.mailbox_memberships m ON m.organization_id=o.organization_id AND m.mailbox_id=o.mailbox_id AND m.user_id=p_user
 WHERE o.organization_id=p_org AND o.mailbox_id=p_mailbox AND o.draft_id=p_draft AND o.actor_id=p_user
 AND o.operation_id=p_operation AND o.reservation_token=p_token AND o.stage_state IN ('reserved','committed')
 AND d.actor_id=p_user AND d.state='editable' AND m.compose
 AND EXISTS (SELECT 1 FROM app.organization_memberships om WHERE om.organization_id=p_org AND om.user_id=p_user);
END $$;
REVOKE ALL ON FUNCTION app_attachment_gateway.draft_binding(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid)
 FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker;
GRANT EXECUTE ON FUNCTION app_attachment_gateway.draft_binding(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,uuid,uuid)
 TO elevateo_attachment_gateway;
