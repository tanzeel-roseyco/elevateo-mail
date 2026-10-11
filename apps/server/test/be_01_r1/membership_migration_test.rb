# frozen_string_literal: true

require_relative "../../config/environment"
require "minitest/autorun"
require_relative "../../db/migrate/20261012000002_restrict_api_read_membership"

# AIDEV-NOTE: This migrator-only suite rolls back only the new membership migration, never the foundation/data.
class MembershipMigrationTest < Minitest::Test
  VERSION = 20_261_012_000_002
  FOUNDATION = 20_261_012_000_001

  def setup
    @connection = ActiveRecord::Base.connection
    assert_equal %w[elevateo_migrator elevateo_owner], @connection.select_rows("SELECT session_user, current_user").first
    assert_equal [false] * 5, @connection.select_rows(<<~SQL).first
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = current_user
    SQL
    @context = ActiveRecord::Base.connection_pool.migration_context
    assert_includes versions, FOUNDATION.to_s
    assert_empty versions - [FOUNDATION.to_s, VERSION.to_s]
    @context.up(VERSION)
    assert_equal [["elevateo_owner", false, true, false]], edges
  end

  def versions
    @connection.select_values("SELECT version FROM app_meta.schema_migrations ORDER BY version")
  end

  def edges
    @connection.select_rows(<<~SQL)
      SELECT grantor::regrole::text, admin_option, inherit_option, set_option
      FROM pg_auth_members WHERE roleid = 'elevateo_app_read'::regrole AND member = 'elevateo_api'::regrole
    SQL
  end

  def test_up_down_up_changes_only_runtime_membership
    @context.down(FOUNDATION)
    assert_empty edges
    assert_equal [FOUNDATION.to_s], versions
    @context.up(VERSION)
    assert_equal [["elevateo_owner", false, true, false]], edges
    assert_equal [FOUNDATION.to_s, VERSION.to_s], versions
  end

  def test_failure_after_grant_rolls_back_membership_and_migration_version
    @context.down(FOUNDATION)
    assert_mutation_rollback("GRANT elevateo_app_read TO elevateo_api", [["elevateo_owner", false, true, false]]) do
      @context.up(VERSION)
    end
  ensure
    @context.up(VERSION) if @context
  end

  def test_failure_after_revoke_rolls_back_membership_and_migration_version
    assert_mutation_rollback("REVOKE elevateo_app_read FROM elevateo_api", []) { @context.down(FOUNDATION) }
  end

  # AIDEV-NOTE: A pre-mutation failure cannot prove rollback; observe actual catalog mutation before injecting failure.
  def assert_mutation_rollback(statement, mutated_edges)
    before_versions = versions
    before_edges = edges
    observed = nil
    returned = false
    original = @connection.method(:execute)
    read_edges = method(:edges)
    marker = "R1 deliberate failure after completed membership mutation"
    @connection.singleton_class.define_method(:execute) do |sql, *arguments, **keywords, &block|
      result = original.call(sql, *arguments, **keywords, &block)
      if sql.include?(statement)
        returned = true
        observed = read_edges.call
        raise marker
      end
      result
    end
    error = assert_raises(StandardError) { yield }
    assert returned, "injected failure was never reached after SQL returned"
    assert_equal mutated_edges, observed, "catalog mutation was not observed before failure"
    assert_includes error.message, marker
    assert_equal before_edges, edges
    assert_equal before_versions, versions
  ensure
    @connection.singleton_class.define_method(:execute, original) if original
  end

  def test_unknown_owner_edge_options_abort_without_partial_normalization
    @context.down(FOUNDATION)
    @connection.transaction do
      @connection.execute <<~SQL
        GRANT elevateo_app_read TO elevateo_api
          WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY elevateo_owner
      SQL
      unexpected = edges
      @connection.transaction(requires_new: true) do
        assert_raises(ActiveRecord::StatementInvalid) { RestrictApiReadMembership.new.up }
        raise ActiveRecord::Rollback
      end
      assert_equal unexpected, edges
      refute_includes versions, VERSION.to_s
      raise ActiveRecord::Rollback
    end
    assert_empty edges
  ensure
    @context.up(VERSION) if @context
  end
end
