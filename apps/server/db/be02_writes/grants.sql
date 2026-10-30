-- AIDEV-NOTE: Revoke named-role default grants on ONLY these routines; never widen or reset existing A entrypoints.
REVOKE ALL ON FUNCTION app_auth.begin_protected_write(text,uuid,uuid,uuid[]),
  app_auth.assert_protected_write(text,uuid)
  FROM PUBLIC, elevateo_api, elevateo_worker, elevateo_app_read, elevateo_owner, elevateo_migrator;
GRANT EXECUTE ON FUNCTION app_auth.begin_protected_write(text,uuid,uuid,uuid[]) TO elevateo_api;
GRANT EXECUTE ON FUNCTION app_auth.assert_protected_write(text,uuid) TO elevateo_owner;

DO $$
DECLARE role_name text; routine regprocedure;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['public', 'elevateo_api', 'elevateo_worker', 'elevateo_app_read',
    'elevateo_owner', 'elevateo_migrator'] LOOP
    FOREACH routine IN ARRAY ARRAY['app_auth.begin_protected_write(text,uuid,uuid,uuid[])'::regprocedure,
      'app_auth.assert_protected_write(text,uuid)'::regprocedure] LOOP
      IF has_function_privilege(role_name, routine, 'EXECUTE') IS DISTINCT FROM
          ((role_name = 'elevateo_api' AND routine = 'app_auth.begin_protected_write(text,uuid,uuid,uuid[])'::regprocedure)
          OR (role_name = 'elevateo_owner' AND routine = 'app_auth.assert_protected_write(text,uuid)'::regprocedure))
        OR has_function_privilege(role_name, routine, 'EXECUTE WITH GRANT OPTION') THEN
        RAISE EXCEPTION 'protected write routine permission drift: %', role_name;
      END IF;
    END LOOP;
    IF has_table_privilege(role_name, 'app_auth.sessions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
      OR has_any_column_privilege(role_name, 'app_auth.sessions', 'SELECT, INSERT, UPDATE, REFERENCES')
      OR has_table_privilege(role_name, 'app_auth.authorization_generations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
      OR has_any_column_privilege(role_name, 'app_auth.authorization_generations', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION 'protected write private table permission drift: %', role_name;
    END IF;
  END LOOP;
  IF has_table_privilege('elevateo_api', 'app.mailbox_memberships', 'INSERT, UPDATE, DELETE')
    OR has_any_column_privilege('elevateo_api', 'app.mailbox_memberships', 'INSERT, UPDATE') THEN
    RAISE EXCEPTION 'runtime membership DML must remain denied';
  END IF;
END $$;
