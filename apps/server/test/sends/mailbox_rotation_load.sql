-- AIDEV-NOTE: Synthetic selector fixture only; FK/deferred completeness stay active, but this is not approval proof.
DO $$
DECLARE template app_send_private.intents; draft app.drafts; operation app_send_private.approval_operations;
        audit app_send_private.audit_events; job app_send_private.jobs;
BEGIN
  SELECT * INTO STRICT template FROM app_send_private.intents
    WHERE send_id=current_setting('test.rotation_template')::uuid;
  SELECT * INTO STRICT draft FROM app.drafts WHERE id=template.draft_id;
  SELECT * INTO STRICT operation FROM app_send_private.approval_operations WHERE send_id=template.send_id;
  SELECT * INTO STRICT audit FROM app_send_private.audit_events WHERE send_id=template.send_id AND event_key='approved';
  SELECT * INTO STRICT job FROM app_send_private.jobs WHERE send_id=template.send_id;
  CREATE TEMP TABLE rotation_boxes ON COMMIT DROP AS
    SELECT ordinal,CASE WHEN ordinal=0 THEN template.mailbox_id ELSE gen_random_uuid() END AS mailbox_id
    FROM generate_series(0,711) ordinal;
  INSERT INTO app.mailboxes(id,organization_id,address,visibility)
    SELECT mailbox_id,template.organization_id,mailbox_id::text||'@example.invalid','private'
    FROM rotation_boxes WHERE ordinal>0;
  INSERT INTO app_send_private.mailbox_policy
    SELECT template.organization_id,mailbox_id,true FROM rotation_boxes WHERE ordinal>0;
  CREATE TEMP TABLE rotation_seed ON COMMIT DROP AS
    SELECT b.mailbox_id,b.ordinal,gen_random_uuid() AS send_id,gen_random_uuid() AS draft_id,
      gen_random_uuid() AS operation_id,n <= CASE WHEN b.ordinal=0 THEN 1000 ELSE 1 END AS active
    FROM rotation_boxes b CROSS JOIN LATERAL
      generate_series(1,20+CASE WHEN b.ordinal=0 THEN 1000 ELSE 1 END) n;
  ALTER TABLE rotation_seed ADD COLUMN snapshot_bytes bytea;
  -- AIDEV-NOTE: Rebind synthetic snapshots and their digests; no fixture identity points at another mailbox's draft.
  UPDATE rotation_seed SET snapshot_bytes=convert_to(jsonb_set(jsonb_set(jsonb_set(
    convert_from(template.snapshot_bytes,'UTF8')::jsonb,'{2}',to_jsonb(mailbox_id::text)),
    '{3}',to_jsonb(draft_id::text)),'{5,1}',to_jsonb(mailbox_id::text||'@example.invalid'))::text,'UTF8');
  INSERT INTO app.drafts SELECT (jsonb_populate_record(NULL::app.drafts,to_jsonb(draft)||
    jsonb_build_object('id',s.draft_id,'mailbox_id',s.mailbox_id))).* FROM rotation_seed s;
  INSERT INTO app_send_private.intents
    SELECT (jsonb_populate_record(NULL::app_send_private.intents,to_jsonb(template)||jsonb_build_object(
      'send_id',s.send_id,'draft_id',s.draft_id,'mailbox_id',s.mailbox_id,'snapshot_bytes',s.snapshot_bytes,
      'review_digest',encode(sha256(s.snapshot_bytes),'hex')))).* FROM rotation_seed s;
  INSERT INTO app_send_private.approval_operations
    SELECT (jsonb_populate_record(NULL::app_send_private.approval_operations,to_jsonb(operation)||jsonb_build_object(
      'send_id',s.send_id,'draft_id',s.draft_id,'mailbox_id',s.mailbox_id,'operation_id',s.operation_id))).*
    FROM rotation_seed s;
  INSERT INTO app_send_private.audit_events
    SELECT (jsonb_populate_record(NULL::app_send_private.audit_events,to_jsonb(audit)||
      jsonb_build_object('send_id',s.send_id))).* FROM rotation_seed s;
  INSERT INTO app_send_private.jobs
    SELECT (jsonb_populate_record(NULL::app_send_private.jobs,to_jsonb(job)||jsonb_build_object(
      'send_id',s.send_id,'state',CASE WHEN s.active THEN 'queued' ELSE 'cancelled' END,
      'next_action',CASE WHEN s.active THEN 'submit' ELSE 'none' END,
      'next_check_at',CASE WHEN s.active THEN clock_timestamp()-
        CASE WHEN s.ordinal=0 THEN interval '1 hour' ELSE interval '1 minute' END ELSE NULL END))).*
    FROM rotation_seed s;
  UPDATE app_send_private.jobs SET state='cancelled',next_action='none',next_check_at=NULL
    WHERE send_id=template.send_id;
END $$;
