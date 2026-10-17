# frozen_string_literal: true

require_relative "write_boundary_pool_test_helper"

# AIDEV-NOTE: A matching outer catch exposes cleanup throws that would otherwise appear as ordinary exceptions.
class WriteBoundaryPoolUnwindTest < WriteBoundaryPoolTestCase
  def test_removal_throw_after_eviction_preserves_identical_checkin_error
    target = @adapter
    primary = RuntimeError.new("checkin secret-payload")
    removals, disconnects = 0, 0
    original_checkin = instrument(@pool, :checkin) do |original, connection|
      assert @pool.mon_owned? if connection.equal?(target)
      original.call(connection)
      raise primary if connection.equal?(target)
    end
    original_remove = instrument(@pool, :remove) do |original, connection|
      removals += 1
      assert_same target, connection
      assert @pool.mon_owned?
      original.call(connection)
      throw :cleanup_abort, "remove secret-payload"
    end
    original_disconnect = instrument(target, :disconnect!) do |original|
      disconnects += 1
      refute @pool.mon_owned?, "disconnect must follow monitor release"
      @pool.synchronize do
        refute_includes @pool.connections, target
        refute_includes @pool.instance_variable_get(:@available).instance_variable_get(:@queue), target
      end
      original.call
    end

    escaped = assert_raises(RuntimeError) do
      catch(:cleanup_abort) { protected_call { response } }
    end
    assert_same primary, escaped
    assert_equal 1, removals
    assert_equal 1, disconnects
    refute target.active?
    assert_match(/phase=remove class=Elevateo::Tenancy::ContextError/, @logs.string)
    refute_includes @logs.string, "secret-payload"
    refute_nil marker
    @pool.define_singleton_method(:checkin, original_checkin)
    @pool.define_singleton_method(:remove, original_remove)
    assert_pool_integrity
    assert_next_tenant_request
  ensure
    @pool.define_singleton_method(:checkin, original_checkin) if original_checkin
    @pool.define_singleton_method(:remove, original_remove) if original_remove
    target.define_singleton_method(:disconnect!, original_disconnect) if original_disconnect
  end

  def test_valid_callback_throw_survives_successful_cleanup_without_raised_primary
    target = @adapter
    removals, disconnects = 0, 0
    callback = ->(connection) { throw :caller_exit, :escaped if connection.equal?(target) }
    target.class.set_callback(:checkin, :after, callback)
    original_remove = instrument(@pool, :remove) do |original, connection|
      removals += 1
      assert @pool.mon_owned?
      original.call(connection)
    end
    original_disconnect = instrument(target, :disconnect!) do |original|
      disconnects += 1
      refute @pool.mon_owned?
      original.call
    end

    assert_equal :escaped, catch(:caller_exit) { protected_call { response } }
    assert_equal 1, removals
    assert_equal 1, disconnects
    refute_includes @pool.connections, target
    refute target.active?
    assert_empty @logs.string
    target.class.skip_callback(:checkin, :after, callback)
    callback = nil
    @pool.define_singleton_method(:remove, original_remove)
    assert_pool_integrity
    assert_next_tenant_request
  ensure
    target.class.skip_callback(:checkin, :after, callback) if callback
    @pool.define_singleton_method(:remove, original_remove) if original_remove
    target.define_singleton_method(:disconnect!, original_disconnect) if original_disconnect
  end
end
