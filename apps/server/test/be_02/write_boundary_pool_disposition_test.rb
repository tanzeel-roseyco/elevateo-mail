# frozen_string_literal: true

require_relative "write_boundary_pool_test_helper"

# AIDEV-NOTE: Real Rails/PG schedules pin rejected checkin disposal separately from safe-transfer response expiry.
class WriteBoundaryPoolDispositionTest < WriteBoundaryPoolTestCase
  def test_waiter_cannot_cross_either_old_owner_observation_window
    [:before_owner, :after_owner].each do |window|
      target = @pool.checkout(1)
      @pool.checkin(target)
      acquired, release = Queue.new, Queue.new
      rejected, observed, removals, disconnects = false, false, 0, 0
      primary = RuntimeError.new("rejected completed checkin")
      original_checkin = instrument(@pool, :checkin) do |original, connection|
        assert @pool.mon_owned?, "protection must precede checkin publication" if connection.equal?(target)
        original.call(connection)
        if connection.equal?(target)
          rejected = true
          raise primary
        end
      end
      original_owner = instrument(target, :owner) do |original|
        owner = original.call
        if rejected && !observed
          observed = true
          assert_nil owner
          if window == :before_owner
            assert @pool.mon_owned?, "nil-owner observation must exclude a waiting lease"
            assert_empty acquired
          end
        end
        owner
      end
      original_remove = instrument(@pool, :remove) do |original, connection|
        removals += 1
        if window == :after_owner
          assert observed
          assert @pool.mon_owned?, "removal must retain the owner observation's monitor"
          assert_empty acquired
        end
        original.call(connection)
      end
      instrument(target, :disconnect!) do |original|
        disconnects += 1
        refute @pool.mon_owned?, "native disconnect must follow monitor release"
        original.call
      end
      waiter = nil
      assert_same primary, assert_raises(RuntimeError) {
        protected_call do
          waiter = pool_waiter(acquired, release)
          wait_until { @pool.stat.fetch(:waiting) == 1 }
          response
        end
      }
      leased = acquired.pop(timeout: 2)
      refute_nil leased
      refute_same target, leased
      assert observed
      assert_equal 1, removals
      assert_equal 1, disconnects
      refute target.active?
      refute_nil marker
      finish_pool_waiter(waiter, release)
      @pool.define_singleton_method(:checkin, original_checkin)
      @pool.define_singleton_method(:remove, original_remove)
      assert_pool_integrity
      assert_next_tenant_request
    ensure
      @pool.define_singleton_method(:checkin, original_checkin) if original_checkin
      @pool.define_singleton_method(:remove, original_remove) if original_remove
      target.define_singleton_method(:owner, original_owner) if original_owner
      stop_pool_waiter(waiter, release)
    end
  end

  def test_expiry_after_safe_transfer_never_disconnects_the_waiter_owner
    acquired, release = Queue.new, Queue.new
    checked_in, removals, disconnects = false, 0, 0
    target = @adapter
    backend = target.select_value("SELECT pg_backend_pid()")
    original_checkin = instrument(@pool, :checkin) do |original, connection|
      assert @pool.mon_owned?, "protection must precede checkin publication" if connection.equal?(target) && !checked_in
      original.call(connection)
      checked_in = true if connection.equal?(target)
    end
    instrument(@pool, :remove) { |original, connection| removals += 1; original.call(connection) }
    instrument(target, :disconnect!) { |original| disconnects += 1; original.call }
    deadline = Elevateo::RequestDeadline.new
    instrument(deadline, :check!) do |original|
      original.call
      if checked_in && !@pool.mon_owned?
        assert_same target, acquired.pop(timeout: 2)
        refute_same ActiveSupport::IsolatedExecutionState.context, target.owner
        raise Elevateo::RequestDeadline::Expired
      end
    end
    waiter = nil
    assert_raises(Elevateo::AuthError) do
      deadline.within do
        protected_call(deadline: deadline) do
          waiter = pool_waiter(acquired, release, expected_backend: backend)
          wait_until { @pool.stat.fetch(:waiting) == 1 }
          response(409)
        end
      end
    end
    assert_equal 0, removals
    assert_equal 0, disconnects
    assert_includes @pool.connections, target
    refute_nil marker, "expiry suppresses a committed terminal conflict without rolling it back"
    finish_pool_waiter(waiter, release)
    @pool.define_singleton_method(:checkin, original_checkin)
    assert_next_tenant_request
  ensure
    @pool.define_singleton_method(:checkin, original_checkin) if original_checkin
    stop_pool_waiter(waiter, release)
  end

  def test_callback_unregistration_return_error_and_throw_at_each_owner_phase
    [:before, :after].product([:return, :error, :throw]).each do |phase, exit_kind|
      target = @pool.checkout(1)
      @pool.checkin(target)
      pool, real_remove = @pool, @pool.method(:remove)
      acquired, release = Queue.new, Queue.new
      owners, removals = [], 0
      primary = RuntimeError.new("callback secret-payload")
      original_remove = instrument(pool, :remove) { |original, connection| removals += 1; original.call(connection) }
      callback = lambda do |connection|
        next unless connection.equal?(target)
        owners << connection.owner
        real_remove.call(connection)
        raise primary if exit_kind == :error
        throw :callback_exit, :escaped if exit_kind == :throw
      end
      target.class.set_callback(:checkin, phase, callback)
      waiter = nil
      operation = lambda do
        protected_call do
          waiter = pool_waiter(acquired, release)
          wait_until { pool.stat.fetch(:waiting) == 1 }
          response
        end
      end
      case exit_kind
      when :return
        assert_equal "internal_error", assert_raises(Elevateo::CollaborationError, &operation).code
      when :error
        assert_same primary, assert_raises(RuntimeError, &operation)
      when :throw
        assert_equal :escaped, catch(:callback_exit) { operation.call }
      end
      assert_equal 1, owners.length
      phase == :before ? assert_same(ActiveSupport::IsolatedExecutionState.context, owners.first) : assert_nil(owners.first)
      leased = acquired.pop(timeout: 2)
      refute_nil leased
      refute_same target, leased
      assert_equal 1, removals, "one cleanup removal, separate from the callback's explicit removal"
      refute_includes pool.connections, target
      refute target.active?
      refute_includes @logs.string, "secret-payload"
      finish_pool_waiter(waiter, release)
      target.class.skip_callback(:checkin, phase, callback)
      callback = nil
      pool.define_singleton_method(:remove, original_remove)
      assert_pool_integrity
      assert_next_tenant_request
    ensure
      target.class.skip_callback(:checkin, phase, callback) if callback
      pool.define_singleton_method(:remove, original_remove) if original_remove
      stop_pool_waiter(waiter, release)
    end
  end

  def test_removal_failures_distinguish_queue_detachment_from_registration_only
    [:before_remove, :before_queue_delete, :after_queue_delete, :after_remove].each do |phase|
      target = @pool.checkout(1)
      @pool.checkin(target)
      available = @pool.instance_variable_get(:@available)
      primary = RuntimeError.new("checkin failed after enqueue")
      removals, disconnects = 0, 0
      original_checkin = instrument(@pool, :checkin) do |original, connection|
        original.call(connection)
        raise primary if connection.equal?(target)
      end
      original_delete = instrument(available, :delete) do |original, connection|
        raise IOError, "queue secret-payload" if phase == :before_queue_delete
        original.call(connection)
        raise IOError, "queue secret-payload" if phase == :after_queue_delete
      end
      original_remove = instrument(@pool, :remove) do |original, connection|
        removals += 1
        assert @pool.mon_owned?
        raise IOError, "remove secret-payload" if phase == :before_remove
        original.call(connection)
        raise IOError, "remove secret-payload" if phase == :after_remove
      end
      instrument(target, :disconnect!) { |original| disconnects += 1; original.call }
      assert_same primary, assert_raises(RuntimeError) { protected_call { response } }
      assert_equal 1, removals, "outer cleanup must not retry removal"
      detached = [:after_queue_delete, :after_remove].include?(phase)
      assert_equal(detached ? 1 : 0, disconnects)
      assert_equal !detached, target.active?
      assert_match(/phase=remove class=IOError/, @logs.string)
      refute_includes @logs.string, "secret-payload"
      if detached
        assert_pool_integrity
      else
        assert_match(/phase=disposition/, @logs.string)
        assert_includes available.instance_variable_get(:@queue), target
        phase == :before_remove ? assert_includes(@pool.connections, target) : refute_includes(@pool.connections, target)
      end
      @pool.define_singleton_method(:checkin, original_checkin)
      @pool.define_singleton_method(:remove, original_remove)
      available.define_singleton_method(:delete, original_delete)
      # AIDEV-NOTE: Unresolved injected eviction failure is not a healthy pool; only the test repairs its fixture.
      @pool.remove(target)
      target.disconnect! unless detached
      assert_next_tenant_request
    ensure
      @pool.define_singleton_method(:checkin, original_checkin) if original_checkin
      @pool.define_singleton_method(:remove, original_remove) if original_remove
      available.define_singleton_method(:delete, original_delete) if original_delete
      if target
        @pool.remove(target)
        target.disconnect!
      end
    end
  end

  def test_unavailable_or_malformed_queue_inspection_never_proves_detachment
    [:missing_queue, :invalid_array, :invalid_entry, :inspection_error].each do |fault|
      target = @pool.checkout(1)
      @pool.checkin(target)
      available = @pool.instance_variable_get(:@available)
      removals, disconnects = 0, 0
      original_remove = instrument(@pool, :remove) { |original, connection| removals += 1; original.call(connection) }
      instrument(target, :disconnect!) { |original| disconnects += 1; original.call }
      original_pool_get = instrument(@pool, :instance_variable_get) do |original, name|
        fault == :missing_queue && name == :@available ? nil : original.call(name)
      end
      original_queue_get = instrument(available, :instance_variable_get) do |original, name|
        next original.call(name) unless name == :@queue
        case fault
        when :invalid_array then nil
        when :invalid_entry then [Object.new]
        when :inspection_error then raise IOError, "inspection secret-payload"
        else original.call(name)
        end
      end
      primary = RuntimeError.new("business primary")
      assert_same primary, assert_raises(RuntimeError) { protected_call { raise primary } }
      assert_equal 1, removals
      assert_equal 0, disconnects
      assert target.active?, "unknown detachment must not authorize disconnect"
      assert_match(/phase=inspection/, @logs.string)
      refute_includes @logs.string, "secret-payload"
      @pool.define_singleton_method(:instance_variable_get, original_pool_get)
      available.define_singleton_method(:instance_variable_get, original_queue_get)
      @pool.define_singleton_method(:remove, original_remove)
      target.disconnect!
      assert_pool_integrity
      assert_next_tenant_request
    ensure
      @pool.define_singleton_method(:instance_variable_get, original_pool_get) if original_pool_get
      available.define_singleton_method(:instance_variable_get, original_queue_get) if original_queue_get
      @pool.define_singleton_method(:remove, original_remove) if original_remove
      target&.disconnect!
    end
  end

  def test_callback_throw_before_and_after_owner_clear_without_unregistration
    [:before, :after].each do |phase|
      target = @pool.checkout(1)
      @pool.checkin(target)
      callback = ->(connection) { throw :callback_exit, :escaped if connection.equal?(target) }
      target.class.set_callback(:checkin, phase, callback)
      assert_equal :escaped, catch(:callback_exit) { protected_call { response } }
      refute_includes @pool.connections, target
      refute target.active?
      target.class.skip_callback(:checkin, phase, callback)
      callback = nil
      assert_pool_integrity
      assert_next_tenant_request
    ensure
      target.class.skip_callback(:checkin, phase, callback) if callback
    end
  end
end
