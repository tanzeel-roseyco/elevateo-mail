# frozen_string_literal: true

require_relative "../be_02/database_test_helper"

# AIDEV-NOTE: The API facade must exist under a private owner without granting worker/public invocation.
class QA817CancellationPrivilegesDatabaseTest < SessionDatabaseTestCase
  FUNCTION = "app.cancel_send(text,uuid,uuid,uuid)"

  def test_private_owner_and_api_execute_after_migration
    row = @admin.exec_params(<<~SQL, [FUNCTION]).first
      SELECT pg_get_userbyid(p.proowner) AS owner,
        has_function_privilege('elevateo_api',p.oid,'EXECUTE') AS api_execute,
        has_function_privilege('elevateo_worker',p.oid,'EXECUTE') AS worker_execute,
        EXISTS (SELECT 1 FROM aclexplode(p.proacl) AS acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p WHERE p.oid=$1::regprocedure
    SQL
    assert_equal "elevateo_send_owner", row.fetch("owner")
    assert_equal "t", row.fetch("api_execute")
    assert_equal "f", row.fetch("worker_execute")
    assert_equal "f", row.fetch("public_execute")
  end

  def test_runtime_roles_lack_app_schema_create_privilege
    %w[elevateo_api elevateo_worker].each do |role|
      assert_equal "f", @admin.exec_params("SELECT has_schema_privilege($1,'app','CREATE')", [role]).getvalue(0, 0)
    end
  end
end
