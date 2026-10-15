# frozen_string_literal: true

require_relative "approval_database_helper"

# AIDEV-NOTE: This isolated test process injects disposal failures without opening a database connection.
class SendFixtureCleanupTest < Minitest::Test
  class Connection
    attr_reader :commands

    def initialize
      @commands = []
    end

    def transaction_status = PG::PQTRANS_IDLE
    def exec(sql) = @commands << sql
    def exec_params(*) = raise(IOError, "injected delete failure")
  end

  def with_parent_teardown(callback)
    installed = false
    refute DraftDatabaseTestCase.instance_methods(false).include?(:teardown)
    DraftDatabaseTestCase.define_method(:teardown, &callback)
    installed = true
    yield
  ensure
    DraftDatabaseTestCase.remove_method(:teardown) if installed
  end

  def fixture(connection)
    instance = SendDatabaseTestCase.allocate
    instance.instance_variable_set(:@admin, connection)
    instance.instance_variable_set(:@org, "fixture")
    instance
  end

  def test_failed_delete_still_runs_parent_cleanup
    connection = Connection.new
    parent_called = false
    callback = proc { parent_called = true; connection.exec("ROLLBACK") }
    with_parent_teardown(callback) do
      failure = assert_raises(IOError) { fixture(connection).teardown }
      assert_equal "injected delete failure", failure.message
    end
    assert parent_called
    assert_equal "ROLLBACK", connection.commands.last
  end

  def test_parent_failure_preserves_the_primary_failure
    connection = Connection.new
    cleanup = RuntimeError.new("injected parent failure")
    with_parent_teardown(proc { raise cleanup }) do
      failure = assert_raises(IOError) { fixture(connection).teardown }
      assert_equal "injected delete failure", failure.message
      assert_same cleanup, failure.cause
      assert_instance_of IOError, cleanup.cause
    end
  end

  def test_success_still_calls_parent
    connection = Connection.new
    connection.define_singleton_method(:exec_params) { |*| nil }
    parent_called = false
    with_parent_teardown(proc { parent_called = true }) { fixture(connection).teardown }
    assert parent_called
    assert_equal "COMMIT", connection.commands.last
  end

  def test_parent_only_failure_is_not_replaced
    connection = Connection.new
    connection.define_singleton_method(:exec_params) { |*| nil }
    cleanup = RuntimeError.new("injected parent failure")
    with_parent_teardown(proc { raise cleanup }) do
      assert_same cleanup, assert_raises(RuntimeError) { fixture(connection).teardown }
    end
  end
end
