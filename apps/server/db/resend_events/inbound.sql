SET LOCAL ROLE elevateo_send_owner;
CREATE FUNCTION app_send_private.resend_reply_thread(p_org uuid,p_box uuid,p_reference text,p_sender text)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN (convert_from(i.snapshot_bytes,'UTF8')::jsonb)->>9 IS NOT NULL
 THEN ((convert_from(i.snapshot_bytes,'UTF8')::jsonb)->>9)::uuid END
 FROM app_send_private.intents i WHERE i.organization_id=p_org AND i.mailbox_id=p_box
 AND p_reference='<elevateo.'||i.send_id::text||'@'||
 split_part((convert_from(i.snapshot_bytes,'UTF8')::jsonb)#>>'{5,1}','@',2)||'>'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements((convert_from(i.snapshot_bytes,'UTF8')::jsonb)->6) recipient
 WHERE app_send_private.canonical_address(recipient->>1)=app_send_private.canonical_address(p_sender))
 AND session_user='elevateo_worker' LIMIT 1
$$;
REVOKE ALL ON FUNCTION app_send_private.resend_reply_thread(uuid,uuid,text,text) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app_send_private.resend_reply_thread(uuid,uuid,text,text) TO elevateo_owner;
SET LOCAL ROLE elevateo_owner;
CREATE POLICY resend_thread_owner_read ON app.threads FOR SELECT TO elevateo_owner
 USING(organization_id=app.context_uuid('app.org_id'));
-- AIDEV-NOTE: Only offline recipient routing selects a tenant; RFC references may resolve solely within that mailbox.
CREATE FUNCTION app.ingest_resend_email(p_id text,p_lease uuid,p_content jsonb) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event app.resend_webhook_events%ROWTYPE; route app.resend_inbound_routes%ROWTYPE;
 receipt app.resend_inbound_receipts%ROWTYPE; new_thread uuid; new_message uuid:=gen_random_uuid();
 provider_email_id uuid; reference text; route_count integer; sender text; part jsonb; ordinal integer:=0; expected_key text; reason text;
BEGIN
 IF session_user<>'elevateo_worker' THEN RAISE EXCEPTION 'worker only' USING ERRCODE='42501'; END IF;
 SELECT * INTO event FROM app.resend_webhook_events WHERE event_id=p_id FOR UPDATE;
 IF NOT FOUND OR p_lease IS NULL OR event.lease IS NULL OR event.lease_until IS NULL OR
 event.status<>'pending' OR event.lease IS DISTINCT FROM p_lease OR
 event.lease_until<clock_timestamp() THEN RETURN jsonb_build_object('result','stale'); END IF;
 provider_email_id := (event.payload#>>'{data,email_id}')::uuid;
 IF event.payload->>'type'<>'email.received' OR p_content->>'id' IS DISTINCT FROM provider_email_id::text OR
 jsonb_typeof(p_content->'to') IS DISTINCT FROM 'array' OR
 jsonb_array_length(p_content->'to') NOT BETWEEN 1 AND 100 OR
 p_content->>'from' IS NULL OR length(p_content->>'from')>256 OR
 p_content->>'text' IS NULL OR octet_length(p_content->>'text')>262144 OR
 p_content->>'subject' IS NULL OR length(p_content->>'subject')>255 OR
 jsonb_typeof(p_content->'attachments') IS DISTINCT FROM 'array' OR
 jsonb_array_length(p_content->'attachments')>11 THEN
 RAISE EXCEPTION 'invalid received content' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO route_count FROM app.resend_inbound_routes r WHERE active
 AND (event.payload#>'{data,to}') ? r.address AND (p_content->'to') ? r.address;
 IF route_count<>1 THEN RETURN jsonb_build_object('result','route_pending'); END IF;
 SELECT * INTO route FROM app.resend_inbound_routes r WHERE active
 AND (event.payload#>'{data,to}') ? r.address AND (p_content->'to') ? r.address FOR UPDATE;
 PERFORM set_config('app.org_id',route.organization_id::text,true);
 SELECT * INTO receipt FROM app.resend_inbound_receipts WHERE resend_inbound_receipts.email_id=provider_email_id;
 IF FOUND THEN
  IF receipt.organization_id<>route.organization_id OR receipt.mailbox_id<>route.mailbox_id THEN
   RETURN jsonb_build_object('result','route_pending');
  END IF;
  UPDATE app.resend_webhook_events SET status='processed',completed_at=clock_timestamp(),lease=NULL,lease_until=NULL WHERE event_id=p_id;
  RETURN jsonb_build_object('result','duplicate','thread_id',receipt.thread_id,'message_id',receipt.message_id);
 END IF;
 sender:=p_content->>'from'; reference:=p_content->>'in_reply_to';
 IF reference IS NOT NULL AND length(reference)<=998 THEN
  SELECT thread_id INTO new_thread FROM app.resend_inbound_receipts
  WHERE organization_id=route.organization_id AND mailbox_id=route.mailbox_id AND rfc_message_id=reference LIMIT 1;
  IF new_thread IS NULL THEN
   new_thread:=app_send_private.resend_reply_thread(route.organization_id,route.mailbox_id,reference,sender);
  END IF;
 END IF;
 IF new_thread IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.threads WHERE id=new_thread
 AND organization_id=route.organization_id AND mailbox_id=route.mailbox_id) THEN new_thread:=NULL; END IF;
 IF new_thread IS NULL THEN
  new_thread:=gen_random_uuid();
  INSERT INTO app.threads(id,organization_id,mailbox_id,subject)
  VALUES(new_thread,route.organization_id,route.mailbox_id,p_content->>'subject');
 END IF;
 INSERT INTO app.messages(id,organization_id,mailbox_id,thread_id,sender,recipients,sent_at,body_text,attachment_count)
 VALUES(new_message,route.organization_id,route.mailbox_id,new_thread,
 jsonb_build_object('display_name',NULL,'address',sender),
 (SELECT jsonb_agg(jsonb_build_object('display_name',NULL,'address',v)) FROM jsonb_array_elements_text(p_content->'to') v),
 (event.payload->>'created_at')::timestamptz,p_content->>'text',jsonb_array_length(p_content->'attachments'));

 -- AIDEV-NOTE: Only deterministic quarantined keys can bind; scan verdicts are never supplied by the ingestion worker.
 FOR part IN SELECT value FROM jsonb_array_elements(p_content->'attachments') LOOP
  expected_key:='quarantine/resend/'||provider_email_id::text||'/'||ordinal::text;
  reason:=part->>'rejection_reason';
  IF jsonb_typeof(part) IS DISTINCT FROM 'object' OR
    (part->>'ordinal')::integer IS DISTINCT FROM ordinal OR
    part->>'filename' IS NULL OR octet_length(part->>'filename') NOT BETWEEN 1 AND 120 OR
    part->>'content_type' IS NULL OR part->>'byte_size' IS NULL THEN
    RAISE EXCEPTION 'invalid attachment' USING ERRCODE='22023';
  END IF;
  IF reason IS NULL THEN
   IF part->>'storage_key' IS DISTINCT FROM expected_key OR
    part->>'sha256' IS NULL OR part->>'sha256' !~ '^[0-9a-f]{64}$' OR
    part->>'content_type' NOT IN ('application/pdf','image/png','image/jpeg','text/plain') OR
    (part->>'byte_size')::integer NOT BETWEEN 1 AND 262144 THEN
    RAISE EXCEPTION 'invalid attachment' USING ERRCODE='22023'; END IF;
  ELSE
   IF reason NOT IN ('oversize','unsupported_type','invalid_name','invalid_signature') OR
    part->>'storage_key' IS NOT NULL OR part->>'sha256' IS NOT NULL OR
    (part->>'byte_size')::integer<>0 OR part->>'content_type'<>'application/octet-stream' THEN
    RAISE EXCEPTION 'invalid rejected attachment' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO app.inbox_attachments(id,organization_id,mailbox_id,thread_id,message_id,
    storage_key,filename,content_type,byte_size,sha256,scan_status,rejection_reason)
  VALUES(gen_random_uuid(),route.organization_id,route.mailbox_id,new_thread,new_message,
    part->>'storage_key',part->>'filename',part->>'content_type',(part->>'byte_size')::integer,
    part->>'sha256',CASE WHEN reason IS NULL THEN 'pending_scan' ELSE 'rejected' END,reason);
  ordinal:=ordinal+1;
 END LOOP;

 INSERT INTO app.resend_inbound_receipts(email_id,organization_id,mailbox_id,thread_id,message_id,rfc_message_id)
 VALUES(provider_email_id,route.organization_id,route.mailbox_id,new_thread,new_message,left(p_content->>'message_id',998));
 UPDATE app.resend_webhook_events SET status='processed',completed_at=clock_timestamp(),lease=NULL,lease_until=NULL WHERE event_id=p_id;
 RETURN jsonb_build_object('result','created','thread_id',new_thread,'message_id',new_message);
END $$;
REVOKE ALL ON FUNCTION app.ingest_resend_email(text,uuid,jsonb) FROM PUBLIC,elevateo_api,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.ingest_resend_email(text,uuid,jsonb) TO elevateo_worker;
