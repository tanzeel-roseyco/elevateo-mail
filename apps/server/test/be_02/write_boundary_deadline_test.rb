# frozen_string_literal: true

require_relative "write_boundary_test_helper"

class WriteBoundaryDeadlineTest < Minitest::Test
  include AuthFixtures

  def setup
    @service, _store, _client, @cookie = harness
    @identity = @service.authenticate(cookie: @cookie, deadline: deadline)
    @connection = WriteBoundaryHarness::Connection.new(metadata)
    @pool = WriteBoundaryHarness::Pool.new(@connection)
    @now = 0.0
    @deadline = Elevateo::RequestDeadline.new(seconds: 1.0, clock: -> { @now })
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def test_pool_wait_is_bounded_and_expired_checkout_returns_without_opening_transaction
    @pool.before_checkout = -> { @now = 1.1 }
    assert_raises(Elevateo::AuthError) { invoke { flunk "expired checkout reached business" } }
    assert_equal [1.0], @pool.timeouts
    assert_empty @pool.checkins
    assert_equal [@connection], @pool.removed
    assert_equal [:disconnect], @connection.events
  end

  def test_native_transaction_budget_is_recomputed_after_checkout
    @pool.before_checkout = -> { @now = 0.75 }
    assert_equal 200, invoke { response }.status
    assert_equal %w[250 250 250], @connection.deadline_arguments
    assert_equal [@connection], @pool.checkins
  end

  def test_database_error_rolls_back_and_discards_connection
    error = assert_raises(Elevateo::CollaborationError) do
      invoke do
        @connection.business << :saved
        raise ActiveRecord::ActiveRecordError, "backend terminated"
      end
    end
    assert_equal "temporarily_unavailable", error.code
    assert_equal 1, error.retry_after
    assert_equal %i[begin guard rollback disconnect], @connection.events
    assert_empty @connection.business
    assert_empty @pool.checkins
    assert_equal [@connection], @pool.removed
  end

  def test_serialization_overflow_rolls_back_and_uses_closed_error
    error = assert_raises(Elevateo::CollaborationError) do
      invoke { @connection.business << :saved; raise Elevateo::ReadResponse::Invalid }
    end
    assert_equal "internal_error", error.code
    assert_empty @connection.business
    assert_equal %i[rollback disconnect], @connection.events.last(2)
  end

  def test_cumulative_business_time_expires_before_commit
    assert_raises(Elevateo::AuthError) do
      invoke do
        @connection.business << :saved
        @now = 1.01
        response
      end
    end
    assert_equal %i[rollback disconnect], @connection.events.last(2)
    assert_empty @connection.business
    assert_empty @pool.checkins
  end

  def test_outer_deadline_interrupt_unwinds_business_before_checkin
    # AIDEV-NOTE: Delivery is allowed only after Tenancy owns the transaction; unwind restores the deferred mask.
    assert_raises(Elevateo::AuthError) do
      @deadline.within do
        invoke do
          owner = Thread.current
          Thread.new { owner.raise(Elevateo::RequestDeadline::Expired) }.join
          flunk "business continued after injected expiry"
        end
      end
    end
    assert_equal %i[rollback disconnect], @connection.events.last(2)
    assert_empty @pool.checkins
  end

  def test_blocked_business_and_serializer_are_interrupted_without_opening_gate
    [:business, :serializer].each do |phase|
      setup
      entered, gate = Queue.new, Queue.new
      @deadline = Elevateo::RequestDeadline.new(seconds: 0.3)
      wire = response
      wire.define_singleton_method(:verify!) { |budget:| entered << true; gate.pop } if phase == :serializer
      thread = Thread.new do
        assert_raises(Elevateo::AuthError) do
          @deadline.within do
            invoke do
              @connection.business << :saved
              if phase == :business
                entered << true
                gate.pop
              end
              wire
            end
          end
        end
        assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
      end
      thread.report_on_exception = false
      assert entered.pop(timeout: 2), "Ruby phase never entered"
      assert thread.join(2), "deadline failed to interrupt closed Ruby gate"
      thread.value
      assert_empty gate
      assert_empty @connection.business
      assert_empty @pool.checkins
      assert_equal %i[rollback disconnect], @connection.events.last(2)
    ensure
      # The gate opens only for failed-test teardown; it cannot manufacture a deadline pass.
      gate << true if thread&.alive?
      thread&.join(2)
      thread&.kill if thread&.alive?
      thread&.join(1)
    end
  end

  def test_nonlocal_throw_and_swallowed_rollback_discard
    result = catch(:exit_write) { invoke { throw :exit_write, :escaped } }
    assert_equal :escaped, result
    assert_empty @pool.checkins
    assert_equal [@connection], @pool.removed
    setup
    assert_raises(Elevateo::CollaborationError) { invoke { raise ActiveRecord::Rollback } }
    assert_empty @pool.checkins
    assert_equal [@connection], @pool.removed
  end

  private

  def response = Elevateo::WriteResponse.new(json: '{"ok":true}', status: 200)

  def invoke(&operation)
    ActiveRecord::Base.stub(:connection_pool, @pool) do
      Elevateo::SessionWrites.new(sessions: @service).transaction(@identity,
        context: AuthFixtures::CONTEXT, version: @service.presentation.version(metadata),
        csrf: metadata.fetch("csrf_token"), guard_users: [], budget: 4096, deadline: @deadline,
        &operation)
    end
  end
end
