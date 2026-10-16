-- AIDEV-NOTE: Replace owner-only cores; lease wrappers still fence every import and receipt replay.
CREATE OR REPLACE FUNCTION app.ingest_imap_mail_unleased_core(p_account uuid,p_version integer,p_validity bigint,p_uid bigint,
  p_digest text,p_sender jsonb,p_recipients jsonb,p_subject text,p_body text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account app.inbound_imap_accounts%ROWTYPE;
DECLARE receipt app.inbound_imap_receipts%ROWTYPE;
DECLARE new_thread uuid := gen_random_uuid();
DECLARE new_message uuid := gen_random_uuid();
BEGIN
  IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
  SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account FOR UPDATE;
  IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
  END IF;
  IF p_validity IS NULL OR p_validity <= 0 OR p_uid IS NULL OR p_uid <= 0 OR
     p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR
     p_sender IS NULL OR NOT app.thread_address_valid(p_sender) OR
     p_recipients IS NULL OR NOT app.thread_recipients_valid(p_recipients) OR
     p_subject IS NULL OR char_length(p_subject) > 255 OR
     p_body IS NULL OR octet_length(p_body) > 262144 THEN
    RAISE EXCEPTION 'invalid imap input' USING ERRCODE='22023';
  END IF;
  IF account.uidvalidity IS NOT NULL AND account.uidvalidity <> p_validity THEN
    RETURN jsonb_build_object('result','uidvalidity_changed');
  END IF;
  -- AIDEV-NOTE: Receipts outlive cursor/epoch resets; validate identity before restoring monotonic progress.
  IF EXISTS (SELECT 1 FROM app.inbound_imap_rejections
    WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid) THEN
    RAISE EXCEPTION 'imap terminal outcome conflict' USING ERRCODE='23514';
  END IF;
  SELECT * INTO receipt FROM app.inbound_imap_receipts
    WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid;
  IF FOUND THEN
    IF receipt.content_sha256 <> p_digest THEN
      RAISE EXCEPTION 'imap replay mismatch' USING ERRCODE='23514';
    END IF;
    UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=GREATEST(last_uid,p_uid) WHERE id=p_account;
    RETURN jsonb_build_object('result','duplicate','thread_id',receipt.thread_id,
      'message_id',receipt.message_id,'last_uid',GREATEST(account.last_uid,p_uid));
  END IF;
  IF p_uid <= account.last_uid THEN
    RAISE EXCEPTION 'imap replay missing' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.org_id',account.organization_id::text,true);
  INSERT INTO app.inbound_imap_receipts(account_id,organization_id,mailbox_id,uidvalidity,uid,
    content_sha256,thread_id,message_id) VALUES(p_account,account.organization_id,account.mailbox_id,
    p_validity,p_uid,p_digest,new_thread,new_message);
  INSERT INTO app.threads(id,organization_id,mailbox_id,subject)
    VALUES(new_thread,account.organization_id,account.mailbox_id,p_subject);
  INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,attachment_count)
    VALUES(new_message,account.organization_id,account.mailbox_id,new_thread,p_sender,p_recipients,
      clock_timestamp(),p_body,0);
  UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=p_uid WHERE id=p_account;
  RETURN jsonb_build_object('result','created','thread_id',new_thread,
    'message_id',new_message,'last_uid',p_uid);
END $$;

CREATE OR REPLACE FUNCTION app.ingest_imap_mail_with_attachments_unleased_core(p_account uuid,p_version integer,p_validity bigint,p_uid bigint,
  p_digest text,p_sender jsonb,p_recipients jsonb,p_subject text,p_body text,p_attachments jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account app.inbound_imap_accounts%ROWTYPE;
DECLARE receipt app.inbound_imap_receipts%ROWTYPE;
DECLARE new_thread uuid := gen_random_uuid();
DECLARE new_message uuid := gen_random_uuid();
DECLARE part jsonb;
DECLARE ordinal integer := 0;
DECLARE expected_key text;
BEGIN
  IF session_user <> 'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
  SELECT * INTO account FROM app.inbound_imap_accounts WHERE id=p_account FOR UPDATE;
  IF NOT FOUND OR NOT account.active OR account.credential_version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'imap account unavailable' USING ERRCODE='42501';
  END IF;
  IF p_validity IS NULL OR p_validity<=0 OR p_uid IS NULL OR p_uid<=0 OR
    p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR
    p_sender IS NULL OR NOT app.thread_address_valid(p_sender) OR
    p_recipients IS NULL OR NOT app.thread_recipients_valid(p_recipients) OR
    p_subject IS NULL OR char_length(p_subject)>255 OR
    p_body IS NULL OR octet_length(p_body)>262144 OR
    p_attachments IS NULL OR jsonb_typeof(p_attachments)<>'array' OR
    jsonb_array_length(p_attachments)>11 THEN
    RAISE EXCEPTION 'invalid imap input' USING ERRCODE='22023';
  END IF;
  IF account.uidvalidity IS NOT NULL AND account.uidvalidity<>p_validity THEN
    RETURN jsonb_build_object('result','uidvalidity_changed');
  END IF;
  -- AIDEV-NOTE: Receipts outlive cursor/epoch resets; validate identity before restoring monotonic progress.
  IF EXISTS (SELECT 1 FROM app.inbound_imap_rejections
    WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid) THEN
    RAISE EXCEPTION 'imap terminal outcome conflict' USING ERRCODE='23514';
  END IF;
  SELECT * INTO receipt FROM app.inbound_imap_receipts
    WHERE account_id=p_account AND uidvalidity=p_validity AND uid=p_uid;
  IF FOUND THEN
    IF receipt.content_sha256 <> p_digest THEN
      RAISE EXCEPTION 'imap replay mismatch' USING ERRCODE='23514';
    END IF;
    UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=GREATEST(last_uid,p_uid) WHERE id=p_account;
    RETURN jsonb_build_object('result','duplicate','thread_id',receipt.thread_id,
      'message_id',receipt.message_id,'last_uid',GREATEST(account.last_uid,p_uid));
  END IF;
  IF p_uid <= account.last_uid THEN
    RAISE EXCEPTION 'imap replay missing' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.org_id',account.organization_id::text,true);
  INSERT INTO app.inbound_imap_receipts(account_id,organization_id,mailbox_id,uidvalidity,uid,
    content_sha256,thread_id,message_id) VALUES(p_account,account.organization_id,account.mailbox_id,
    p_validity,p_uid,p_digest,new_thread,new_message);
  INSERT INTO app.threads(id,organization_id,mailbox_id,subject)
    VALUES(new_thread,account.organization_id,account.mailbox_id,p_subject);
  INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,attachment_count)
    VALUES(new_message,account.organization_id,account.mailbox_id,new_thread,p_sender,p_recipients,
      clock_timestamp(),p_body,jsonb_array_length(p_attachments));
  FOR part IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    expected_key := 'quarantine/imap/' || p_account::text || '/' || p_validity::text || '/' ||
      p_uid::text || '/' || ordinal::text;
    IF jsonb_typeof(part)<>'object' OR
      (SELECT count(*) FROM jsonb_object_keys(part))<>6 OR
      NOT (part ?& ARRAY['ordinal','storage_key','filename','content_type','byte_size','sha256']) OR
      (part->>'ordinal')::integer IS DISTINCT FROM ordinal OR
      part->>'storage_key' IS DISTINCT FROM expected_key OR
      part->>'content_type' NOT IN ('application/pdf','image/png','image/jpeg','text/plain') OR
      (part->>'byte_size')::integer NOT BETWEEN 1 AND 262144 OR
      part->>'sha256' !~ '^[0-9a-f]{64}$' OR
      octet_length(part->>'filename') NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'invalid imap attachment' USING ERRCODE='22023';
    END IF;
    PERFORM app.bind_imported_inbox_attachment(gen_random_uuid(),account.organization_id,account.mailbox_id,
      new_thread,new_message,p_account,p_validity,p_uid,ordinal,expected_key,part->>'filename',
      part->>'content_type',(part->>'byte_size')::integer,part->>'sha256',NULL);
    ordinal := ordinal+1;
  END LOOP;
  UPDATE app.inbound_imap_accounts SET uidvalidity=p_validity,last_uid=p_uid WHERE id=p_account;
  RETURN jsonb_build_object('result','created','thread_id',new_thread,
    'message_id',new_message,'last_uid',p_uid);
END $$;
