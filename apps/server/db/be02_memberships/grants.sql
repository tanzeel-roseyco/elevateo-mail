-- AIDEV-NOTE: No runtime membership-table writes or private proof assertion; only checked operations are callable.
REVOKE ALL ON FUNCTION app.mailbox_membership_version(uuid), app.mailbox_members_page(uuid,uuid,integer),
  app.change_mailbox_membership(text,uuid,uuid,integer,boolean,boolean,boolean,boolean)
  FROM PUBLIC, elevateo_api, elevateo_app_read, elevateo_worker;
GRANT EXECUTE ON FUNCTION app.mailbox_membership_version(uuid), app.mailbox_members_page(uuid,uuid,integer),
  app.change_mailbox_membership(text,uuid,uuid,integer,boolean,boolean,boolean,boolean) TO elevateo_api;
DO $$ BEGIN
  IF has_table_privilege('elevateo_api', 'app.mailbox_memberships', 'INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_any_column_privilege('elevateo_api', 'app.mailbox_memberships', 'INSERT,UPDATE,REFERENCES')
    OR has_table_privilege('elevateo_api', 'app.mailbox_membership_revisions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateo_owner' AND (rolcanlogin OR rolsuper OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname IN ('mailbox_membership_version', 'mailbox_members_page',
        'change_mailbox_membership', 'bump_mailbox_membership_revision')
      AND p.proowner <> 'elevateo_owner'::regrole)
    THEN RAISE EXCEPTION 'membership boundary privilege postcondition failed'; END IF;
END $$;
