# frozen_string_literal: true

require "active_record"
require_relative "auth_test_helper"

class SessionStoreTest < Minitest::Test
  include AuthFixtures

  # AIDEV-NOTE: Real QueryAttribute bindings are inspected without connecting; SQL behavior needs container integration.
  class Connection
    attr_reader :calls, :transactions
    attr_accessor :open
    def initialize = (@calls, @transactions, @open = [], 0, false)
    def transaction_open? = @open
    def uncached = yield
    def transaction(requires_new:)
      raise "transaction must be independent" unless requires_new
      @transactions += 1
      yield
    end
    def exec_query(sql, _label, bindings)
      @calls << [sql, bindings.map(&:value_for_database)]
      [{ "result" => { "status" => "ok" } }]
    end
  end

  class Pool
    def initialize(connection) = (@connection = connection)
    def with_connection = yield(@connection)
  end

  def setup
    @connection = Connection.new
    @store = Elevateo::SessionStore.new(pool: Pool.new(@connection))
  end

  def test_values_are_bound_and_sql_timeouts_have_independent_caps
    budget = Elevateo::RequestDeadline.new(clock: -> { 0.0 })
    @store.call("resolve_session", ["'unsafe'"], deadline: budget)
    assert_equal ["3000", "1000"], @connection.calls.first.last
    assert_equal "SELECT app_auth.resolve_session($1::text) AS result", @connection.calls.last.first
    assert_equal ["'unsafe'"], @connection.calls.last.last
    assert_equal 1, @connection.transactions
  end

  def test_remaining_budget_clips_both_sql_caps
    now = 0.0
    budget = Elevateo::RequestDeadline.new(clock: -> { now })
    now = 9.5
    @store.call("resolve_session", ["digest"], deadline: budget)
    assert_equal ["500", "500"], @connection.calls.first.last
  end

  def test_open_transaction_and_non_allowlisted_calls_fail_before_sql
    @connection.open = true
    assert_auth(503) { @store.call("resolve_session", ["digest"], deadline: deadline) }
    assert_raises(KeyError) { @store.call("injected", [], deadline: deadline) }
    assert_raises(ArgumentError) do
      @store.call("revoke_session", ["digest", "local"], connection: @connection, deadline: deadline)
    end
    assert_empty @connection.calls
  end
end
