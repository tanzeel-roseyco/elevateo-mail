# frozen_string_literal: true

require_relative "test_helper"

class WorkerRoleTest < RestrictedRoleTest
  def test_worker_cannot_read_business_tables
    assert_equal "elevateo_worker", @connection.select_value("SELECT current_user")
    assert_equal false, @connection.select_value("SELECT has_schema_privilege(current_user, 'app', 'USAGE')")
    %w[organizations organization_memberships mailboxes mailbox_memberships].each do |table|
      # AIDEV-NOTE: Use catalog OIDs; resolving a qualified relation name itself requires schema USAGE.
      privileges = @connection.select_values(<<~SQL)
        SELECT has_table_privilege(current_user, c.oid, 'SELECT')
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = '#{table}' AND c.relkind = 'r'
      SQL
      assert_equal [false], privileges, "expected one existing table with no SELECT grant"
      error = assert_raises(ActiveRecord::StatementInvalid) { @connection.select_all("SELECT * FROM app.#{table}") }
      assert_kind_of PG::InsufficientPrivilege, error.cause
      assert_equal "42501", error.cause.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    end
  end
end
