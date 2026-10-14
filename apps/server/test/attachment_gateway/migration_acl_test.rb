# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../config/environment"
require_relative "../../db/migrate/20261015000018_create_attachment_gateway_binding"

# AIDEV-NOTE: Only a disposable migrated database may run this transaction-scoped grant lifecycle probe.
class AttachmentGatewayMigrationAclTest < Minitest::Test
  def test_bootstrap_schema_and_gateway_grants_survive_up_down_up
    connection = ActiveRecord::Base.connection
    assert_equal ["elevateo_migrator", ENV.fetch("BE02_TASK_DATABASE_NAME")],
      connection.select_rows("SELECT session_user,current_database()").first
    applied = snapshot(connection)
    assert_applied(applied)

    connection.transaction do
      migration = CreateAttachmentGatewayBinding.new
      migration.down
      bootstrap_only = snapshot(connection)
      assert_bootstrap_only(bootstrap_only)
      migration.up
      assert_equal applied, snapshot(connection), "up must restore only the migration-owned grants/helper"
      migration.down
      assert_equal bootstrap_only, snapshot(connection), "down must restore the bootstrap-only ACL"
      migration.up
      assert_equal applied, snapshot(connection), "repeat up must restore the same narrow authority"
      raise ActiveRecord::Rollback
    end
    assert_equal applied, snapshot(connection), "the disposable probe must leave original state intact"
  end

  private

  def snapshot(connection)
    row = connection.select_one(<<~SQL)
      SELECT n.nspowner::regrole::text AS owner,
        has_schema_privilege('elevateo_attachment_gateway',n.oid,'USAGE')::text AS gateway_usage,
        has_schema_privilege('elevateo_attachment_gateway',n.oid,'CREATE')::text AS gateway_create,
        (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace=n.oid) AS functions,
        has_function_privilege('elevateo_owner',
          'app_auth.authorize_session(text,uuid,uuid,uuid,bigint)','EXECUTE')::text AS owner_auth
      FROM pg_namespace n WHERE n.nspname='app_attachment_gateway'
    SQL
    refute_nil row, "privileged bootstrap must preserve the private schema"
    row.merge("acl" => connection.select_rows(<<~SQL))
      SELECT a.grantee::regrole::text,a.privilege_type,a.is_grantable::text
      FROM pg_namespace n CROSS JOIN LATERAL
        aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE n.nspname='app_attachment_gateway'
      ORDER BY 1,2,3
    SQL
  end

  def assert_applied(state)
    assert_equal "elevateo_owner", state.fetch("owner")
    assert_equal "true", state.fetch("gateway_usage")
    assert_equal "false", state.fetch("gateway_create")
    assert_equal "1", state.fetch("functions")
    assert_equal "true", state.fetch("owner_auth")
    assert_equal [["elevateo_attachment_gateway", "USAGE", "false"]],
      (state.fetch("acl").select { |grant| grant.first != "elevateo_owner" })
  end

  def assert_bootstrap_only(state)
    assert_equal "elevateo_owner", state.fetch("owner")
    assert_equal "false", state.fetch("gateway_usage")
    assert_equal "false", state.fetch("gateway_create")
    assert_equal "0", state.fetch("functions")
    assert_equal "false", state.fetch("owner_auth")
    assert_empty(state.fetch("acl").reject { |grant| grant.first == "elevateo_owner" })
  end
end
