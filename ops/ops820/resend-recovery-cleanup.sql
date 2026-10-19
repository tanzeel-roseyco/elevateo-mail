-- AIDEV-NOTE: Only after exact recovery assertions pass, remove this synthetic fixture for legacy down/up checks.
BEGIN;
DELETE FROM app.draft_attachments WHERE id='10400000-0000-4000-8000-000000000005';
DELETE FROM app_drafts_private.attachment_stage_operations WHERE operation_id='10400000-0000-4000-8000-000000000006' AND organization_id='10400000-0000-4000-8000-000000000001';
DELETE FROM app.drafts WHERE id='10400000-0000-4000-8000-000000000004';
DELETE FROM app.resend_inbound_routes WHERE address='recovery@ops1040.invalid' AND organization_id='10400000-0000-4000-8000-000000000001';
DELETE FROM app.resend_webhook_events WHERE event_id='msg_ops1040_recovery';
DELETE FROM app.mailboxes WHERE id='10400000-0000-4000-8000-000000000002';
DELETE FROM app.organizations WHERE id='10400000-0000-4000-8000-000000000001';
COMMIT;
