-- AIDEV-NOTE: migration 00018 down must leave only the privileged bootstrap schema and LOGIN.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='app_attachment_gateway'
      AND nspowner='elevateo_owner'::regrole) OR
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elevateo_attachment_gateway'
      AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) OR
    has_schema_privilege('elevateo_attachment_gateway','app_attachment_gateway','USAGE,CREATE') OR
    to_regprocedure('app_attachment_gateway.private_binding(text,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,uuid)') IS NOT NULL OR
    has_function_privilege('elevateo_owner',
      'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)','EXECUTE')
  THEN RAISE EXCEPTION 'gateway down did not restore bootstrap-only state'; END IF;
END $$;
