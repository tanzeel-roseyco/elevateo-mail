-- AIDEV-NOTE: Verify populated recovery before any disposable migration reversal removes tables.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM app.resend_webhook_events WHERE event_id='msg_ops1040_recovery'
 AND body_digest=repeat('b',64) AND payload->>'type'='email.received' AND status='pending' AND attempts=2 AND lease IS NULL)
 OR NOT EXISTS (SELECT 1 FROM app.resend_inbound_routes WHERE address='recovery@ops1040.invalid'
 AND organization_id='10400000-0000-4000-8000-000000000001' AND mailbox_id='10400000-0000-4000-8000-000000000002' AND NOT active)
 OR NOT EXISTS (SELECT 1 FROM app.draft_attachments a JOIN app_drafts_private.attachment_stage_operations o ON o.attachment_id=a.id
 WHERE a.id='10400000-0000-4000-8000-000000000005' AND a.organization_id='10400000-0000-4000-8000-000000000001' AND a.mailbox_id='10400000-0000-4000-8000-000000000002' AND a.draft_id='10400000-0000-4000-8000-000000000004'
 AND a.scan_status='pending_scan' AND a.scan_attempt=0 AND o.stage_state='committed'
 AND o.object_key='drafts/10400000-0000-4000-8000-000000000001/10400000-0000-4000-8000-000000000005' AND o.sha256='cae81b29dfd7cb6103a87f58e7276abd897ee3844e4c2242554bfb6831ad40d4' AND o.byte_size=28)
 THEN RAISE EXCEPTION 'OPS1040 populated recovery mismatch'; END IF;
END $$;
