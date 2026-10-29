-- AIDEV-NOTE: No public message projection changes; only protected approval reads this immutable wire identity.
ALTER TABLE app.messages ADD COLUMN rfc_message_id text CHECK (
  rfc_message_id IS NULL OR (octet_length(rfc_message_id) BETWEEN 5 AND 998
    AND rfc_message_id ~ '^<[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$'));
-- AIDEV-NOTE: FORCE RLS also applies to owner routines; metadata reads/backfill require explicit tenant fences.
CREATE POLICY reply_identity_owner_read ON app.messages FOR SELECT TO elevateo_owner
  USING (organization_id=app.context_uuid('app.org_id'));
CREATE POLICY reply_identity_owner_update ON app.messages FOR UPDATE TO elevateo_owner
  USING (organization_id=app.context_uuid('app.org_id'))
  WITH CHECK (organization_id=app.context_uuid('app.org_id'));
CREATE FUNCTION app.ingest_imap_mail_with_identity(p_account uuid,p_version integer,p_validity bigint,p_uid bigint,
  p_digest text,p_sender jsonb,p_recipients jsonb,p_subject text,p_body text,p_attachments jsonb,p_identity text,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; account app.inbound_imap_accounts%ROWTYPE;
BEGIN
  IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
  IF p_identity IS NULL OR octet_length(p_identity) NOT BETWEEN 5 AND 998 OR
      p_identity !~ '^<[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+>$' THEN
    RAISE EXCEPTION 'invalid message identity' USING ERRCODE='22023';
  END IF;
  PERFORM app.require_imap_poll_lease(p_account,p_version,p_lease);
  SELECT * INTO STRICT account FROM app.inbound_imap_accounts WHERE id=p_account;
  -- AIDEV-NOTE: Receipt replay skips the core insert path, so establish its locked account's RLS context here.
  PERFORM set_config('app.org_id',account.organization_id::text,true);
  IF p_attachments = '[]'::jsonb THEN
    result := app.ingest_imap_mail_unleased_core(p_account,p_version,p_validity,p_uid,p_digest,p_sender,p_recipients,p_subject,p_body);
  ELSE
    result := app.ingest_imap_mail_with_attachments_unleased_core(p_account,p_version,p_validity,p_uid,p_digest,p_sender,p_recipients,p_subject,p_body,p_attachments);
  END IF;
  IF result->>'result' IN ('created','duplicate') THEN
    -- AIDEV-NOTE: Scope identity backfill to the locked account, including duplicate receipt replay.
    UPDATE app.messages SET rfc_message_id=p_identity WHERE id=(result->>'message_id')::uuid
      AND organization_id=account.organization_id AND mailbox_id=account.mailbox_id
      AND (rfc_message_id IS NULL OR rfc_message_id=p_identity);
    IF NOT FOUND THEN RAISE EXCEPTION 'message identity mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.ingest_imap_mail_with_identity(uuid,integer,bigint,bigint,text,jsonb,jsonb,text,text,jsonb,text,uuid)
  FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.ingest_imap_mail_with_identity(uuid,integer,bigint,bigint,text,jsonb,jsonb,text,text,jsonb,text,uuid)
  TO elevateo_worker;
ALTER FUNCTION app_send_private.read_draft_binding(uuid,uuid) RENAME TO read_draft_binding_without_rfc;
CREATE FUNCTION app_send_private.read_draft_binding(p_mailbox uuid,p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb; identity text;
BEGIN
  binding := app_send_private.read_draft_binding_without_rfc(p_mailbox,p_draft);
  IF binding ? 'code' THEN RETURN binding; END IF;
  SELECT m.rfc_message_id INTO identity FROM app.messages m
    WHERE m.organization_id=(binding->>'organization_id')::uuid AND m.mailbox_id=p_mailbox
      AND m.thread_id=(binding->>'reply_to_thread_id')::uuid
    ORDER BY m.sent_at DESC,m.id DESC LIMIT 1;
  RETURN binding || jsonb_build_object('reply_message_id',identity);
END $$;
REVOKE ALL ON FUNCTION app_send_private.read_draft_binding(uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.read_draft_binding(uuid,uuid) TO elevateo_send_owner;
