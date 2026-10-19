-- AIDEV-NOTE: Synthetic recovery rows are committed only in the task-owned source drill.
BEGIN;
INSERT INTO app.organizations(id,name) VALUES ('10400000-0000-4000-8000-000000000001','OPS1040 recovery fixture');
INSERT INTO app.mailboxes(id,organization_id,address,visibility) VALUES ('10400000-0000-4000-8000-000000000002','10400000-0000-4000-8000-000000000001','recovery@ops1040.invalid','shared');
INSERT INTO app.drafts(id,organization_id,mailbox_id,actor_id,subject,recipients,body_text,version,state)
VALUES ('10400000-0000-4000-8000-000000000004','10400000-0000-4000-8000-000000000001','10400000-0000-4000-8000-000000000002','10400000-0000-4000-8000-000000000003','Recovery fixture','[]','Recovery fixture',1,'editable');
INSERT INTO app_drafts_private.attachment_stage_operations
(organization_id,actor_id,operation_id,mailbox_id,draft_id,request_digest,attachment_id,reservation_token,object_key,filename,content_type,byte_size,sha256,stage_state,reserved_at,completed_at)
VALUES ('10400000-0000-4000-8000-000000000001','10400000-0000-4000-8000-000000000003','10400000-0000-4000-8000-000000000006','10400000-0000-4000-8000-000000000002','10400000-0000-4000-8000-000000000004',repeat('a',64),'10400000-0000-4000-8000-000000000005','10400000-0000-4000-8000-000000000007','drafts/10400000-0000-4000-8000-000000000001/10400000-0000-4000-8000-000000000005','recovery.txt','text/plain',28,'cae81b29dfd7cb6103a87f58e7276abd897ee3844e4c2242554bfb6831ad40d4','committed','2026-10-17T00:00:00Z','2026-10-17T00:00:01Z');
INSERT INTO app.draft_attachments(id,organization_id,mailbox_id,draft_id,actor_id,scan_status,created_at,scan_updated_at)
VALUES ('10400000-0000-4000-8000-000000000005','10400000-0000-4000-8000-000000000001','10400000-0000-4000-8000-000000000002','10400000-0000-4000-8000-000000000004','10400000-0000-4000-8000-000000000003','pending_scan','2026-10-17T00:00:01Z','2026-10-17T00:00:01Z');
INSERT INTO app.resend_inbound_routes(address,organization_id,mailbox_id,active)
VALUES ('recovery@ops1040.invalid','10400000-0000-4000-8000-000000000001','10400000-0000-4000-8000-000000000002',false);
INSERT INTO app.resend_webhook_events(event_id,body_digest,payload,attempts)
VALUES ('msg_ops1040_recovery',repeat('b',64),'{"type":"email.received","data":{"email_id":"10400000-0000-4000-8000-000000000008"}}',2);
COMMIT;
