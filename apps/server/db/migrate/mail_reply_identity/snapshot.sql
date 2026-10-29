-- AIDEV-NOTE: V3 keeps fourteen slots, preserving all budget/suppression recipient indices and existing authority.
ALTER TABLE app_send_private.intents DROP CONSTRAINT intents_snapshot_format_check;
ALTER TABLE app_send_private.intents ADD CONSTRAINT intents_snapshot_format_check
  CHECK(snapshot_format IN ('elevateo.send.snapshot.v1','elevateo.send.snapshot.v2','elevateo.send.snapshot.v3'));
ALTER FUNCTION app_send_private.snapshot_validation(jsonb,bytea,text) RENAME TO snapshot_validation_without_rfc;
CREATE FUNCTION app_send_private.snapshot_validation(p_binding jsonb,p_bytes bytea,p_digest text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE snap jsonb; normalized bytea; identity text := p_binding->>'reply_message_id';
BEGIN
  IF p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 1 AND 1048576 THEN RETURN 'review_stale'; END IF;
  snap := convert_from(p_bytes,'UTF8')::jsonb;
  IF snap->>0 <> 'elevateo.send.snapshot.v3' THEN
    RETURN app_send_private.snapshot_validation_without_rfc(p_binding,p_bytes,p_digest);
  END IF;
  IF jsonb_array_length(snap)<>14 OR identity IS NULL OR p_binding->>'reply_to_thread_id' IS NULL
      OR identity !~ '^<[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$'
      OR octet_length(identity) NOT BETWEEN 5 AND 998
      OR snap->9 IS DISTINCT FROM jsonb_build_array(p_binding->'reply_to_thread_id',identity)
      OR jsonb_array_length(snap->12)<>0
      OR p_bytes<>convert_to(app_send_private.compact_json(snap),'UTF8')
      OR encode(sha256(p_bytes),'hex') IS DISTINCT FROM p_digest THEN RETURN 'review_stale'; END IF;
  -- Validate every preexisting binding/policy/content field through the unchanged canonical validator.
  snap := jsonb_set(jsonb_set(snap,'{0}','"elevateo.send.snapshot.v1"'),'{9}',p_binding->'reply_to_thread_id');
  normalized := convert_to(app_send_private.compact_json(snap),'UTF8');
  RETURN app_send_private.snapshot_validation_without_rfc(p_binding,normalized,encode(sha256(normalized),'hex'));
EXCEPTION WHEN invalid_text_representation OR character_not_in_repertoire OR data_exception THEN
  RETURN 'review_stale';
END $$;
REVOKE ALL ON FUNCTION app_send_private.snapshot_validation(jsonb,bytea,text) FROM PUBLIC,elevateo_api,elevateo_app_read,elevateo_worker;
CREATE OR REPLACE FUNCTION app_send_private.mox_dispatch_allowed(i app_send_private.intents) RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE snap jsonb := convert_from(i.snapshot_bytes,'UTF8')::jsonb; enabled boolean;
BEGIN
  IF jsonb_array_length(snap)<>14 OR snap->>0 NOT IN ('elevateo.send.snapshot.v1','elevateo.send.snapshot.v3')
      OR jsonb_array_length(snap->12)<>0 THEN RETURN false; END IF;
  SELECT d.enabled INTO enabled FROM app_send_private.mox_domains d
    WHERE d.organization_id=i.organization_id AND d.domain=split_part(snap->5->>1,'@',2) FOR SHARE;
  RETURN COALESCE(enabled,false) AND EXISTS (SELECT 1 FROM app_send_private.smtp_accounts a
    WHERE a.organization_id=i.organization_id AND a.mailbox_id=i.mailbox_id AND a.active
      AND a.sender=snap->5->>1 AND a.credential_ref LIKE 'secret:%');
END $$;
