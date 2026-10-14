-- Worker authority is removable without deleting durable BE03 history.
SET LOCAL ROLE elevateo_send_owner;
REVOKE USAGE ON SCHEMA app_send_private FROM elevateo_worker;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM app_send_private.reconciliation_checks) THEN
  RAISE EXCEPTION 'worker authority rollback refused: durable reconciliation evidence exists' USING ERRCODE='55000';
END IF; END $$;
DROP FUNCTION app_send_private.reconcile_no_evidence(uuid,uuid,bigint,uuid),
  app_send_private.final_attempt_check(uuid,uuid,bigint,uuid,uuid),
  app_send_private.worker_binding(uuid,uuid,bigint,uuid);
DROP FUNCTION app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea),
  app_send_private.cancel_job(uuid,uuid,uuid),
  app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer),
  app_send_private.claim_job(uuid,uuid,uuid,integer),
  app_send_private.next_due_send(uuid,uuid[]);
DROP TRIGGER suppression_policy_revision ON app_send_private.recipient_suppressions;
DROP TRIGGER mailbox_policy_revision ON app_send_private.mailbox_policy;
DROP FUNCTION app_send_private.bump_send_policy(),app_send_private.current_capability(app_send_private.intents);
DROP TABLE app_send_private.reconciliation_checks;
SET LOCAL ROLE elevateo_session_owner;
DROP FUNCTION app_auth.send_worker_guard(text,uuid,uuid);
SET LOCAL ROLE elevateo_owner;
