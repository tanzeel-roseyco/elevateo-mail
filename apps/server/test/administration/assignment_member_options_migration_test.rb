# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../config/environment"
require_relative "../../db/migrate/20261015000019_create_assignment_member_options"

# AIDEV-NOTE: DDL cycles stay in a disposable rollback transaction; no existing table ACL is modified.
class AssignmentMemberOptionsMigrationTest < Minitest::Test
  SIGNATURE = "app.assignment_member_options(text,uuid,uuid,uuid,bigint,uuid,uuid,uuid,integer)"

  def test_up_down_up_preserves_owner_and_exact_runtime_grant
    connection = ActiveRecord::Base.connection
    assert_equal ["elevateo_migrator", ENV.fetch("BE02_TASK_DATABASE_NAME")],
      connection.select_rows("SELECT session_user,current_database()").first
    applied = snapshot(connection)
    assert_equal ["elevateo_owner", "t", "f", "f", "f"], applied
    connection.transaction do
      migration = CreateAssignmentMemberOptions.new
      migration.down
      assert_equal [nil, nil, nil, nil, nil], snapshot(connection)
      migration.up
      assert_equal applied, snapshot(connection)
      migration.down
      assert_equal [nil, nil, nil, nil, nil], snapshot(connection)
      migration.up
      assert_equal applied, snapshot(connection)
      raise ActiveRecord::Rollback
    end
    assert_equal applied, snapshot(connection)
  end

  private

  def snapshot(connection)
    connection.select_rows(<<~SQL).first
      WITH routine AS (SELECT to_regprocedure('#{SIGNATURE}') AS identity)
      SELECT (SELECT proowner::regrole::text FROM pg_proc WHERE oid = identity),
        CASE WHEN identity IS NULL THEN NULL ELSE has_function_privilege('elevateo_api',identity,'EXECUTE')::text END,
        CASE WHEN identity IS NULL THEN NULL ELSE has_function_privilege('elevateo_worker',identity,'EXECUTE')::text END,
        CASE WHEN identity IS NULL THEN NULL ELSE has_function_privilege('elevateo_app_read',identity,'EXECUTE')::text END,
        CASE WHEN identity IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM pg_proc p
          CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE p.oid=identity AND acl.grantee=0 AND acl.privilege_type='EXECUTE')::text END
      FROM routine
    SQL
  end
end
