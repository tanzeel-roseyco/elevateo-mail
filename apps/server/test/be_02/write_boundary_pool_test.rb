# frozen_string_literal: true

require_relative "write_boundary_pool_test_helper"

class WriteBoundaryPoolTest < WriteBoundaryPoolTestCase
  def test_success_and_terminal_conflict_reuse_registered_adapter
    [200, 409].each do |status|
      assert_equal status, protected_call { response(status) }.status
      assert_includes @pool.connections, @adapter
      refute_nil marker
      assert_pool_integrity
    end
    assert_next_tenant_request
  end

  def test_business_failure_and_rollback_nil_discard
    error = assert_raises(Elevateo::CollaborationError) do
      protected_call { raise Elevateo::CollaborationError.new("not_available") }
    end
    assert_equal "not_available", error.code
    refute_includes @pool.connections, @adapter
    assert_nil marker
    assert_next_tenant_request
    assert_raises(Elevateo::CollaborationError) { protected_call { raise ActiveRecord::Rollback } }
    assert_next_tenant_request
  end

  def test_nonlocal_exit_is_not_a_pool_handoff
    assert_equal :escaped, catch(:outside) { protected_call { throw :outside, :escaped } }
    refute_includes @pool.connections, @adapter
    assert_next_tenant_request
  end

  def test_commit_failure_before_real_commit_removes_adapter
    assert_commit_fault(after: false)
    assert_nil marker
    assert_next_tenant_request
  end

  def test_lost_ack_after_real_commit_retains_durable_marker_but_no_success
    assert_commit_fault(after: true)
    refute_nil marker, "public uncertainty does not mean rollback"
    assert_next_tenant_request
  end

  def test_already_removed_adapter_is_never_checked_back_in
    assert_raises(Elevateo::CollaborationError) do
      protected_call { @pool.remove(@adapter); response }
    end
    refute_includes @pool.connections, @adapter
    refute @adapter.active?
    assert_pool_integrity
    assert_next_tenant_request
  end

  def test_checkin_callback_failures_before_and_after_owner_clear
    [:before, :after].each do |phase|
      target = @pool.checkout(1)
      @pool.checkin(target)
      observed = []
      callback = lambda do |connection|
        if connection.equal?(target)
          observed << connection.owner
          raise ActiveRecord::ConnectionNotEstablished, "test callback failure"
        end
      end
      target.class.set_callback(:checkin, phase, callback)
      begin
        error = assert_raises(Elevateo::CollaborationError) { protected_call { response } }
        assert_equal "temporarily_unavailable", error.code
        assert_equal 1, observed.length
        phase == :before ? assert_same(ActiveSupport::IsolatedExecutionState.context, observed.first) : assert_nil(observed.first)
        refute_includes @pool.connections, target
        refute target.active?
        assert_pool_integrity
      ensure
        target.class.skip_callback(:checkin, phase, callback)
      end
      assert_next_tenant_request
    end
  end

  def test_removal_replacement_failure_still_disconnects_and_preserves_primary
    original_remove = @pool.method(:remove)
    disconnected = false
    instrument(@adapter, :disconnect!) { |original| disconnected = true; original.call }
    @pool.define_singleton_method(:remove) do |connection|
      original_remove.call(connection)
      raise ActiveRecord::ConnectionNotEstablished, "test replacement failure with secret-payload"
    end
    primary = Elevateo::CollaborationError.new("not_available")
    assert_same primary, assert_raises(Elevateo::CollaborationError) { protected_call { raise primary } }
    assert disconnected
    refute_includes @pool.connections, @adapter
    assert_match(/phase=remove class=ActiveRecord::ConnectionNotEstablished correlation=[0-9a-f-]+/, @logs.string)
    refute_includes @logs.string, "secret-payload"
    @pool.define_singleton_method(:remove, original_remove)
    assert_next_tenant_request
  end

  def test_disconnect_failure_leaves_adapter_evicted_and_is_reported
    original_disconnect = instrument(@adapter, :disconnect!) do |_original|
      raise ActiveRecord::ConnectionNotEstablished, "test disconnect secret-payload"
    end
    assert_raises(Elevateo::CollaborationError) do
      protected_call { raise Elevateo::CollaborationError.new("not_available") }
    end
    refute_includes @pool.connections, @adapter
    assert_match(/phase=disconnect class=ActiveRecord::ConnectionNotEstablished/, @logs.string)
    refute_includes @logs.string, "secret-payload"
    # A deliberately failed disconnect can leave a backend; test teardown closes it before asserting settled counts.
    original_disconnect.call
    assert_next_tenant_request
  ensure
    original_disconnect&.call
  end

  def test_foreign_owner_is_not_stolen_or_disconnected
    original_checkin = @pool.method(:checkin)
    removals, disconnects = 0, 0
    original_remove = instrument(@pool, :remove) { |original, connection| removals += 1; original.call(connection) }
    instrument(@adapter, :disconnect!) { |original| disconnects += 1; original.call }
    foreign = Fiber.new {}
    @pool.define_singleton_method(:checkin) do |connection|
      connection.instance_variable_set(:@owner, foreign)
      raise ActiveRecord::ConnectionNotEstablished, "test transferred owner"
    end
    assert_raises(Elevateo::CollaborationError) { protected_call { response } }
    assert_same foreign, @adapter.owner
    assert @adapter.active?
    assert_includes @pool.connections, @adapter
    assert_match(/phase=ownership/, @logs.string)
    assert_equal 0, removals
    assert_equal 0, disconnects
  ensure
    # Synthetic ownership corruption belongs to this test, not a real competing request.
    @pool.define_singleton_method(:checkin, original_checkin) if original_checkin
    @pool.define_singleton_method(:remove, original_remove) if original_remove
    @adapter.instance_variable_set(:@owner, ActiveSupport::IsolatedExecutionState.context)
    @pool.remove(@adapter)
    @adapter.disconnect!
  end

  def test_second_waiter_cannot_acquire_unregistered_spare_after_commit_fault
    assert_commit_fault(after: false)
    current = @pool.checkout(1)
    assert_includes @pool.connections, current
    assert_same ActiveSupport::IsolatedExecutionState.context, current.owner
    acquired, release = Queue.new, Queue.new
    waiter = Thread.new do
      connection = @pool.checkout(2)
      begin
        assert_includes @pool.connections, connection
        assert_same ActiveSupport::IsolatedExecutionState.context, connection.owner
        acquired << connection
        release.pop
      ensure
        @pool.checkin(connection)
      end
    end
    waiter.report_on_exception = false
    wait_until { @pool.stat.fetch(:waiting) == 1 }
    assert_empty acquired
    assert_pool_integrity
    @pool.checkin(current)
    current = nil
    assert acquired.pop(timeout: 2)
    release << true
    assert waiter.join(2)
    waiter.value
    assert_next_tenant_request
  ensure
    @pool.checkin(current) if current && current.owner.equal?(ActiveSupport::IsolatedExecutionState.context)
    release << true if release
    waiter&.join(3)
    waiter&.kill if waiter&.alive?
    waiter&.join(1)
  end

  def test_real_deadline_interrupts_closed_business_and_serializer_gates
    [:business, :serializer].each do |phase|
      entered, gate = Queue.new, Queue.new
      deadline = Elevateo::RequestDeadline.new(seconds: 0.5)
      wire = response
      wire.define_singleton_method(:verify!) { |budget:| entered << true; gate.pop } if phase == :serializer
      thread = Thread.new do
        assert_raises(Elevateo::AuthError) do
          deadline.within do
            protected_call(deadline: deadline) do
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
      assert entered.pop(timeout: 2)
      assert thread.join(3), "deadline did not interrupt the closed Ruby gate"
      thread.value
      assert_empty gate
      assert_nil marker
      assert_next_tenant_request
    ensure
      gate << true if thread&.alive?
      thread&.join(3)
      thread&.kill if thread&.alive?
      thread&.join(1)
    end
  end

  def test_checkout_verification_failure_cannot_requeue_failed_adapter
    instrument(@adapter, :clean!) { |_original| raise ActiveRecord::ConnectionNotEstablished, "test verify failure" }
    assert_raises(Elevateo::CollaborationError) { protected_call { flunk "checkout failure reached business" } }
    refute_includes @pool.connections, @adapter
    assert_pool_integrity
    assert_next_tenant_request
  end

  def test_expiry_at_checkout_assignment_and_inner_entry_disposes_owned_adapter
    [:checkout, :inner_entry].each do |phase|
      target = @pool.checkout(1)
      @pool.checkin(target)
      original_checkout = @pool.method(:checkout)
      if phase == :checkout
        @pool.define_singleton_method(:checkout) do |timeout|
          connection = original_checkout.call(timeout)
          Thread.current.raise(Elevateo::RequestDeadline::Expired)
          connection
        end
      else
        instrument(target, :exec_query) do |original, *args, **kwargs|
          result = original.call(*args, **kwargs)
          Thread.current.raise(Elevateo::RequestDeadline::Expired) if args[1] == "Tenant context"
          result
        end
      end
      deadline = Elevateo::RequestDeadline.new
      assert_raises(Elevateo::AuthError) do
        deadline.within { protected_call(deadline: deadline) { flunk "pending expiry reached business" } }
      end
      refute_includes @pool.connections, target
      assert_nil marker
      @pool.define_singleton_method(:checkout, original_checkout)
      assert_next_tenant_request
    ensure
      @pool.define_singleton_method(:checkout, original_checkout) if original_checkout
    end
  end

  def test_expiry_after_actual_sql_return_rolls_back_before_more_ruby_work
    instrument(@adapter, :exec_query) do |original, *args, **kwargs|
      result = original.call(*args, **kwargs)
      Thread.current.raise(Elevateo::RequestDeadline::Expired) if args[1] == "business expiry"
      result
    end
    deadline = Elevateo::RequestDeadline.new
    assert_raises(Elevateo::AuthError) do
      deadline.within do
        protected_call(deadline: deadline) do |connection:, **_rest|
          connection.exec_query("SELECT 1", "business expiry", [])
          flunk "pending SQL expiry reached further business work"
        end
      end
    end
    assert_nil marker
    refute_includes @pool.connections, @adapter
    assert_next_tenant_request
  end

  def test_pending_expiry_after_safe_checkin_suppresses_response_but_preserves_handoff
    target = @adapter
    callback = ->(connection) { Thread.current.raise(Elevateo::RequestDeadline::Expired) if connection.equal?(target) }
    target.class.set_callback(:checkin, :after, callback)
    deadline = Elevateo::RequestDeadline.new
    assert_raises(Elevateo::AuthError) do
      deadline.within { protected_call(deadline: deadline) { response } }
    end
    assert_includes @pool.connections, target
    assert_nil target.owner
    assert target.active?
    assert_pool_integrity
    refute_nil marker, "late expiry must not claim rollback of a completed COMMIT"
    target.class.skip_callback(:checkin, :after, callback)
    callback = nil
    assert_next_tenant_request
  ensure
    target.class.skip_callback(:checkin, :after, callback) if callback
  end

  def test_callback_removal_without_exception_cannot_resurrect_adapter
    target, pool = @adapter, @pool
    callback = ->(connection) { pool.remove(connection) if connection.equal?(target) }
    target.class.set_callback(:checkin, :after, callback)
    assert_raises(Elevateo::CollaborationError) { protected_call { response } }
    refute_includes @pool.connections, target
    assert_pool_integrity
    target.class.skip_callback(:checkin, :after, callback)
    callback = nil
    assert_next_tenant_request
  ensure
    target.class.skip_callback(:checkin, :after, callback) if callback
  end

  def test_native_lock_wait_defers_ruby_expiry_until_libpq_returns
    native = @adapter.raw_connection
    in_native, disconnected_in_native, sqlstate = false, false, nil
    instrument(@adapter, :exec_query) do |original, *args, **kwargs|
      in_native = true
      begin
        original.call(*args, **kwargs)
      rescue ActiveRecord::StatementInvalid => error
        sqlstate = error.cause.result.error_field(PG::Result::PG_DIAG_SQLSTATE) if error.cause.is_a?(PG::Error)
        raise
      ensure
        in_native = false
      end
    end
    instrument(@adapter, :disconnect!) do |original|
      disconnected_in_native ||= in_native
      original.call
    end
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT 1 FROM app_auth.sessions WHERE cookie_digest=$1 FOR UPDATE", [@digest])
    thread = Thread.new do
      deadline = Elevateo::RequestDeadline.new(seconds: 5)
      assert_raises(Elevateo::AuthError) do
        deadline.within { protected_call(deadline: deadline) { flunk "blocked guard reached business" } }
      end
      assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
    end
    thread.report_on_exception = false
    wait_for_lock(native)
    thread.raise(Elevateo::RequestDeadline::Expired)
    wait_for_lock(native)
    assert in_native
    assert thread.join(3)
    thread.value
    assert_equal "55P03", sqlstate
    refute disconnected_in_native
    @admin.exec("ROLLBACK")
    assert_nil marker
    assert_next_tenant_request
  ensure
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
    thread&.kill if thread&.alive?
    thread&.join(1)
  end

  def test_real_remove_with_waiter_replacement_failure_preserves_primary
    attempted, removals = false, 0
    original_remove = instrument(@pool, :remove) { |original, connection| removals += 1; original.call(connection) }
    original = instrument(@pool, :bulk_make_new_connections) do |_method, _count|
      assert @pool.mon_owned?, "accepted exceptional removal retains the outer monitor across replacement"
      attempted = true
      raise ActiveRecord::ConnectionNotEstablished, "replacement fault"
    end
    primary = Elevateo::CollaborationError.new("not_available")
    waiter = nil
    assert_same primary, assert_raises(Elevateo::CollaborationError) {
      protected_call do
        waiter = Thread.new do
          connection = @pool.checkout(0.5)
          @pool.checkin(connection)
        rescue ActiveRecord::ConnectionTimeoutError
          :timed_out
        end
        waiter.report_on_exception = false
        wait_until { @pool.stat.fetch(:waiting) == 1 }
        raise primary
      end
    }
    assert attempted, "Rails remove must reach its replacement path with an observed waiter"
    assert_equal 1, removals
    refute_includes @pool.connections, @adapter
    refute @adapter.active?
    assert_match(/phase=remove/, @logs.string)
    assert waiter.join(2)
    assert_equal :timed_out, waiter.value
    @pool.define_singleton_method(:bulk_make_new_connections, original)
    @pool.define_singleton_method(:remove, original_remove)
    assert_pool_integrity
    assert_next_tenant_request
  ensure
    @pool.define_singleton_method(:bulk_make_new_connections, original) if original
    @pool.define_singleton_method(:remove, original_remove) if original_remove
    waiter&.join(2)
    waiter&.kill if waiter&.alive?
    waiter&.join(1)
  end

  def test_failed_cleanup_logger_cannot_replace_primary
    original = instrument(@adapter, :disconnect!) { |_method| raise IOError, "disconnect fault" }
    @logger.define_singleton_method(:error) { |_message| raise IOError, "logging fault" }
    primary = Elevateo::CollaborationError.new("not_available")
    assert_same primary, assert_raises(Elevateo::CollaborationError) { protected_call { raise primary } }
    refute_includes @pool.connections, @adapter
  ensure
    original&.call
  end

  private

  def assert_commit_fault(after:)
    instrument(@adapter, :commit_db_transaction) do |original|
      original.call if after
      raise ActiveRecord::ConnectionNotEstablished, "test ambiguous commit"
    end
    error = assert_raises(Elevateo::CollaborationError) { protected_call { response } }
    assert_equal "temporarily_unavailable", error.code
    refute_includes @pool.connections, @adapter
    refute @adapter.active?
    assert_pool_integrity
  end
end
