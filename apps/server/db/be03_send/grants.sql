-- AIDEV-NOTE: API uses only scoped facades; worker has no send authority until its reviewed SQL slice exists.
REVOKE ALL ON ALL TABLES IN SCHEMA app_send_private FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_send_private FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
REVOKE ALL ON FUNCTION app.send_review(uuid,uuid),app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid),
  app.send_status(uuid,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.send_review(uuid,uuid),app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid),
  app.send_status(uuid,uuid,uuid) TO elevateo_api;
