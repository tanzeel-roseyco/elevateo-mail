-- AIDEV-NOTE: Operational rollback retains durable send history; destructive down only supports an empty disposable schema.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM app_send_private.intents) OR EXISTS (SELECT 1 FROM app_send_private.approval_operations) THEN
    RAISE EXCEPTION 'send rollback refused: durable history exists' USING ERRCODE = '55000';
  END IF;
END $$;
DROP FUNCTION app.send_status(uuid,uuid,uuid),app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid),app.send_review(uuid,uuid);
DROP FUNCTION app_send_private.approval_result(app_send_private.intents);
DROP TABLE app_send_private.audit_events,app_send_private.observations,app_send_private.attempts,
  app_send_private.jobs,app_send_private.approval_operations,app_send_private.intents,
  app_send_private.recipient_suppressions,app_send_private.mailbox_policy,app_send_private.organization_policy;
DROP FUNCTION app_send_private.assert_complete_intent(),app_send_private.monotonic_job(),app_send_private.reject_mutation(),
  app_send_private.record_approval_operation(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text),
  app_send_private.snapshot_validation(jsonb,bytea,text),app_send_private.review_policy(jsonb),
  app_send_private.canonical_address(text),app_send_private.compact_json(jsonb);
SET LOCAL ROLE elevateo_owner;
DROP TRIGGER preserve_consumed_draft ON app.drafts;
DROP FUNCTION app_send_private.preserve_consumed_draft(),app_send_private.status_scope(uuid,uuid),
  app_send_private.consume_draft(text,uuid,uuid,integer),app_send_private.lock_draft_binding(text,uuid,uuid),
  app_send_private.read_draft_binding(uuid,uuid),app_send_private.consumed_draft_matches(uuid,uuid,uuid,uuid,integer);
REVOKE REFERENCES ON app.organizations,app.mailboxes,app.drafts FROM elevateo_send_owner;
REVOKE USAGE ON SCHEMA app FROM elevateo_send_owner;
SET LOCAL ROLE elevateo_session_owner;
DROP FUNCTION app_auth.send_approval_guard(text);
REVOKE USAGE ON SCHEMA app_auth FROM elevateo_send_owner;
SET LOCAL ROLE elevateo_owner;
