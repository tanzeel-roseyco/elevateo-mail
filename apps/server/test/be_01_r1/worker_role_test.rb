# frozen_string_literal: true

require_relative "test_helper"

class WorkerRoleTest < RestrictedRoleTest
  def test_worker_cannot_read_business_tables
    assert_equal "elevateo_worker", @connection.select_value("SELECT current_user")
    %w[organizations organization_memberships mailboxes mailbox_memberships].each do |table|
      assert_equal false, @connection.select_value("SELECT has_table_privilege(current_user, 'app.#{table}', 'SELECT')")
      assert_raises(ActiveRecord::StatementInvalid) { @connection.select_all("SELECT * FROM app.#{table}") }
    end
  end
end
