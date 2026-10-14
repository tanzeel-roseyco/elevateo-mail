-- AIDEV-NOTE: exact role boundary before any attachment helper migration grants.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='elevateo_attachment_gateway'
      AND rolcanlogin AND NOT (rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members
      WHERE member='elevateo_attachment_gateway'::regrole
         OR roleid='elevateo_attachment_gateway'::regrole)
    OR has_database_privilege('elevateo_attachment_gateway',current_database(),'CREATE')
    OR has_schema_privilege('elevateo_attachment_gateway','app','USAGE,CREATE')
    OR has_schema_privilege('elevateo_attachment_gateway','app_auth','USAGE,CREATE')
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('app','app_auth') AND c.relkind IN ('r','p','v','m','f')
        AND has_table_privilege('elevateo_attachment_gateway',c.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))
  THEN RAISE EXCEPTION 'gateway restricted login bootstrap smoke failed'; END IF;
END $$;
