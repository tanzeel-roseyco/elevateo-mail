-- AIDEV-NOTE: API uses only scoped facades; worker has no send authority until its reviewed SQL slice exists.
REVOKE ALL ON ALL TABLES IN SCHEMA app_send_private FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
-- AIDEV-NOTE: Existing-owner bridges already revoke runtime access; send owner cannot revoke their ACLs.
DO $$ DECLARE owned_function regprocedure; BEGIN
  FOR owned_function IN SELECT oid::regprocedure FROM pg_proc
    WHERE pronamespace = 'app_send_private'::regnamespace AND proowner = current_user::regrole LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read',owned_function);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.send_review(uuid,uuid),app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid),
  app.send_status(uuid,uuid,uuid) FROM PUBLIC,elevateo_api,elevateo_worker,elevateo_app_read;
GRANT EXECUTE ON FUNCTION app.send_review(uuid,uuid),app.approve_draft_send(text,uuid,uuid,uuid,integer,text,bytea,uuid),
  app.send_status(uuid,uuid,uuid) TO elevateo_api;
