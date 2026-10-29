-- AIDEV-NOTE: Preserve function ownership and ACL while fixing simultaneous source/storage-key replay conflicts.
CREATE OR REPLACE FUNCTION app.bind_imported_inbox_attachment(p_id uuid, p_org uuid, p_box uuid, p_thread uuid,
  p_message uuid, p_account uuid, p_epoch bigint, p_uid bigint, p_ordinal integer,
  p_key text, p_filename text, p_type text, p_bytes integer, p_sha text, p_reason text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE existing app.inbox_attachments%ROWTYPE;
BEGIN
  IF session_user <> 'elevateo_worker' OR p_account IS NULL OR p_epoch<=0 OR p_uid<=0 OR
    p_ordinal NOT BETWEEN 0 AND 999 THEN
    RAISE EXCEPTION 'attachment import unavailable' USING ERRCODE='42501';
  END IF;
  IF p_reason IS NULL AND (p_key IS DISTINCT FROM
    ('quarantine/imap/' || p_account::text || '/' || p_epoch::text || '/' || p_uid::text || '/' || p_ordinal::text)
    OR p_bytes NOT BETWEEN 1 AND 262144 OR p_sha IS NULL OR p_type='application/octet-stream') THEN
    RAISE EXCEPTION 'invalid staged attachment' USING ERRCODE='22023';
  END IF;
  IF p_reason IS NOT NULL AND (p_key IS NOT NULL OR p_sha IS NOT NULL OR p_bytes<>0) THEN
    RAISE EXCEPTION 'invalid rejected attachment' USING ERRCODE='22023';
  END IF;
  INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,storage_key,
    filename,content_type,byte_size,sha256,scan_status,rejection_reason,source_account_id,
    source_uidvalidity,source_uid,source_ordinal)
  VALUES (p_id,p_org,p_box,p_thread,p_message,p_key,p_filename,p_type,p_bytes,p_sha,
    CASE WHEN p_reason IS NULL THEN 'pending_scan' ELSE 'rejected' END,p_reason,
    p_account,p_epoch,p_uid,p_ordinal)
  -- AIDEV-NOTE: Storage-key uniqueness can win the race; every conflict must pass the exact binding check below.
  ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN p_id; END IF;
  -- AIDEV-NOTE: Immutable binding lookup needs SELECT, not UPDATE RLS, after a terminal scan verdict.
  SELECT * INTO existing FROM app.inbox_attachments a WHERE a.source_account_id=p_account
    AND a.source_uidvalidity=p_epoch AND a.source_uid=p_uid AND a.source_ordinal=p_ordinal;
  IF NOT FOUND OR existing.organization_id IS DISTINCT FROM p_org OR existing.mailbox_id IS DISTINCT FROM p_box OR
    existing.thread_id IS DISTINCT FROM p_thread OR existing.message_id IS DISTINCT FROM p_message OR
    existing.storage_key IS DISTINCT FROM p_key OR existing.sha256 IS DISTINCT FROM p_sha OR
    existing.filename IS DISTINCT FROM p_filename OR existing.content_type IS DISTINCT FROM p_type OR
    existing.byte_size IS DISTINCT FROM p_bytes OR existing.rejection_reason IS DISTINCT FROM p_reason THEN
    RAISE EXCEPTION 'attachment import conflict' USING ERRCODE='23505';
  END IF;
  RETURN existing.id;
END
$$;
