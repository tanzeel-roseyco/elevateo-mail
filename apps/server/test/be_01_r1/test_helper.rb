# frozen_string_literal: true

require_relative "../../config/environment"
require "minitest/autorun"
require_relative "authority_guards"

# AIDEV-NOTE: No Rails fixture/schema-maintenance helper: this process must never acquire administrator authority.
class RestrictedRoleTest < Minitest::Test
  include R1AuthorityGuards

  def setup
    @connection = ActiveRecord::Base.connection
    role = ENV.fetch("ELEVATEO_DB_ROLE")
    assert_includes %w[elevateo_api elevateo_worker], role
    assert_equal role, @connection.select_value("SELECT session_user")
    assert_equal role, @connection.select_value("SELECT current_user")
    guard_authority(@connection, "repair") if role == "elevateo_api"
    flags = @connection.select_one(<<~SQL)
      SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = current_user
    SQL
    assert_equal [false] * 5, flags.values
    guard_no_object_ownership(@connection)
    guard_no_privileged_membership(@connection)
    assert_equal false, @connection.select_value("SELECT pg_has_role(current_user, 'elevateo_app_read', 'SET')")
    if role == "elevateo_worker"
      assert_equal false, @connection.select_value("SELECT pg_has_role(current_user, 'elevateo_app_read', 'USAGE')")
    end
  end
end