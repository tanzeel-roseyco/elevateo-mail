# frozen_string_literal: true

require_relative "write_boundary_test_helper"

class WriteStatementsTest < Minitest::Test
  def setup
    @now = 0.0
    @deadline = Elevateo::RequestDeadline.new(seconds: 1, clock: -> { @now })
    @adapter = WriteBoundaryHarness::Connection.new({})
    @statements = Elevateo::WriteStatements.new(@adapter, @deadline)
  end

  def test_materialized_result_and_narrow_capability
    result = @statements.exec_query("SELECT 1", "test", [])
    assert_instance_of ActiveRecord::Result, result
    %i[execute transaction disconnect! raw_connection checkout checkin].each do |method|
      refute_respond_to @statements, method
    end
  end

  def test_observed_expiry_prevents_sql
    @now = 1.1
    assert_raises(Elevateo::AuthError) { @statements.exec_query("SELECT 1", "test", []) }
    assert_empty @adapter.sql
  end

  def test_post_sql_check_rejects_result_after_budget
    @adapter.define_singleton_method(:exec_query) { |*_args| @finished = true; ActiveRecord::Result.new([], []) }
    ticks = [0.0, 0.0, 1.1]
    deadline = Elevateo::RequestDeadline.new(seconds: 1, clock: -> { ticks.shift })
    assert_raises(Elevateo::AuthError) do
      Elevateo::WriteStatements.new(@adapter, deadline).exec_query("SELECT 1", "test", [])
    end
    assert @adapter.instance_variable_get(:@finished)
  end

  def test_pending_expiry_is_delivered_only_after_adapter_returns
    finished = false
    @adapter.define_singleton_method(:exec_query) do |*_args|
      owner = Thread.current
      Thread.new { owner.raise(Elevateo::RequestDeadline::Expired) }.join
      finished = true
      ActiveRecord::Result.new([], [])
    end
    assert_raises(Elevateo::RequestDeadline::Expired) do
      Thread.handle_interrupt(Elevateo::RequestDeadline::Expired => :immediate) do
        @statements.exec_query("SELECT 1", "test", [])
      end
    end
    assert finished, "timeout interrupted the actual adapter call"
  end

  def test_adapter_error_is_preserved
    failure = ActiveRecord::StatementInvalid.new("test-only failure")
    @adapter.define_singleton_method(:exec_query) { |*_args| raise failure }
    assert_same failure, assert_raises(ActiveRecord::StatementInvalid) {
      @statements.exec_query("SELECT 1", "test", [])
    }
  end
end
