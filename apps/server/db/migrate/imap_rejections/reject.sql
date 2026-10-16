-- AIDEV-NOTE: The same transaction owns the lease check, scoped rejection receipt and cursor; raw mail stays at Mox.
CREATE FUNCTION app.leased_reject_imap_mail(p_account uuid,p_version integer,p_validity bigint,p_uid bigint,
  p_digest text,p_reason text,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account app.inbound_imap_accounts%ROWTYPE;
DECLARE receipt app.inbound_imap_rejections%ROWTYPE;
BEGIN
  IF p_lease IS NULL THEN RAISE EXCEPTION 'imap lease required' USING ERRCODE='42501'; END IF;
  PERFORM app.require_imap_poll_lease(p_account,p_version,p_lease);
  SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account;
  IF p_validity IS NULL OR p_validity NOT BETWEEN 1 AND 4294967295 OR p_uid IS NULL OR
     p_uid NOT BETWEEN 1 AND 4294967295 OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR
     p_reason IS NULL OR p_reason NOT IN ('invalid_mime','invalid_text','unsupported_mime','oversized_attachment','invalid_filename') THEN
    RAISE EXCEPTION 'invalid imap rejection' USING ERRCODE='22023';
  END IF;
  IF account.uidvalidity IS NOT NULL AND account.uidvalidity <> p_validity THEN
    RETURN jsonb_build_object('result','uidvalidity_changed');
  END IF;
  IF EXISTS (SELECT 1 FROM app.inbound_imap_receipts WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid) THEN
    RAISE EXCEPTION 'imap terminal outcome conflict' USING ERRCODE='23514';
  END IF;
  SELECT * INTO receipt FROM app.inbound_imap_rejections
    WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid;
  IF FOUND THEN
    IF receipt.content_sha256 <> p_digest OR receipt.reason <> p_reason THEN
      RAISE EXCEPTION 'imap rejection replay mismatch' USING ERRCODE='23514';
    END IF;
    -- AIDEV-NOTE: After an explicit epoch reset, replaying existing evidence must restore cursor progress atomically.
    UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=GREATEST(last_uid,p_uid) WHERE id=p_account;
    RETURN jsonb_build_object('result','duplicate_rejection');
  END IF;
  IF p_uid <= account.last_uid THEN
    RAISE EXCEPTION 'imap rejection replay missing' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.inbound_imap_rejections(account_id,organization_id,mailbox_id,uidvalidity,uid,content_sha256,reason)
    VALUES(p_account,account.organization_id,account.mailbox_id,p_validity,p_uid,p_digest,p_reason);
  UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=p_uid WHERE id=p_account;
  RETURN jsonb_build_object('result','rejected');
END $$;
REVOKE ALL ON FUNCTION app.leased_reject_imap_mail(uuid,integer,bigint,bigint,text,text,uuid)
  FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.leased_reject_imap_mail(uuid,integer,bigint,bigint,text,text,uuid) TO elevateo_worker;
