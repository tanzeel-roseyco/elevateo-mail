-- Worker authority is removable without deleting durable BE03 history.
SET LOCAL ROLE elevateo_send_owner;
REVOKE USAGE ON SCHEMA app_send_private FROM elevateo_worker;
DROP FUNCTION app_send_private.record_observation(uuid,uuid,bigint,uuid,uuid,text,text,bytea),
  app_send_private.cancel_job(uuid,uuid,uuid),
  app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer),
  app_send_private.claim_job(uuid,uuid,uuid,integer);
SET LOCAL ROLE elevateo_owner;
SET LOCAL ROLE elevateo_session_owner;
DROP FUNCTION app_auth.send_worker_guard(text,uuid,uuid);
SET LOCAL ROLE elevateo_owner;
