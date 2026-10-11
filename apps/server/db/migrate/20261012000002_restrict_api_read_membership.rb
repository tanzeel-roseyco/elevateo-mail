# frozen_string_literal: true

# AIDEV-NOTE: Bootstrap retires its legacy edge; this owner-run migration owns only the replacement API grant.
class RestrictApiReadMembership < ActiveRecord::Migration[8.1]
  def up
    assert_prerequisites
    execute <<~SQL
      GRANT elevateo_app_read TO elevateo_api
        WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY elevateo_owner;
    SQL
    assert_api_edge(1)
  end

  def down
    assert_prerequisites
    execute "REVOKE elevateo_app_read FROM elevateo_api GRANTED BY elevateo_owner RESTRICT"
    assert_api_edge(0)
  end

  private

  def assert_prerequisites
    execute <<~SQL
      DO $$ BEGIN
        IF session_user <> 'elevateo_migrator' OR current_user <> 'elevateo_owner' THEN
          RAISE EXCEPTION 'membership migration requires migrator login and owner current role';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin' AND oid = 10
            AND rolsuper AND rolcreaterole AND rolbypassrls)
          OR (SELECT count(*) FROM pg_roles WHERE rolname IN
            ('elevateo_owner', 'elevateo_app_read', 'elevateo_migrator', 'elevateo_api', 'elevateo_worker')) <> 5
          OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
            ('elevateo_owner', 'elevateo_app_read', 'elevateo_migrator', 'elevateo_api', 'elevateo_worker')
            AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
              OR rolinherit <> (rolname = 'elevateo_api')
              OR rolcanlogin <> (rolname IN ('elevateo_migrator', 'elevateo_api', 'elevateo_worker'))))
        THEN RAISE EXCEPTION 'unexpected role attributes; run verified bootstrap'; END IF;
        IF (SELECT count(*) FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
            AND member = 'elevateo_owner'::regrole) <> 1
          OR NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
            AND member = 'elevateo_owner'::regrole AND grantor = 'supabase_admin'::regrole
            AND admin_option AND NOT inherit_option AND NOT set_option)
        THEN RAISE EXCEPTION 'owner ADMIN prerequisite missing or unexpected; run verified bootstrap'; END IF;
        IF EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
            AND member = 'elevateo_api'::regrole
            AND NOT (grantor = 'elevateo_owner'::regrole AND NOT admin_option AND inherit_option AND NOT set_option))
        THEN RAISE EXCEPTION 'legacy or unknown API grant remains; run verified bootstrap'; END IF;
      END $$;
    SQL
  end

  def assert_api_edge(expected_count)
    # The topology precondition plus explicit grantor makes absence on down an actual revocation, not a SQL no-op.
    execute <<~SQL
      DO $$ BEGIN
        IF (SELECT count(*) FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
            AND member = 'elevateo_api'::regrole) <> #{expected_count}
          OR EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole
            AND member = 'elevateo_api'::regrole
            AND NOT (grantor = 'elevateo_owner'::regrole AND NOT admin_option AND inherit_option AND NOT set_option))
        THEN RAISE EXCEPTION 'API membership postcondition failed'; END IF;
      END $$;
    SQL
  end
end
