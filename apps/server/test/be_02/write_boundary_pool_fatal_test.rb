# frozen_string_literal: true

require_relative "write_boundary_pool_test_helper"

# AIDEV-NOTE: Real-pool fault schedules prove fatal precedence and disposal without retrying pool removal.
class WriteBoundaryPoolFatalTest < WriteBoundaryPoolTestCase
  def test_fatal_after_removal_still_disconnects_once
    target = @adapter
    removals, disconnects = 0, 0
    original_remove = instrument(@pool, :remove) do |remove, connection|
      removals += 1
      remove.call(connection)
      raise SystemExit.new(73)
    end
    original_disconnect = instrument(target, :disconnect!) do |disconnect|
      disconnects += 1
      refute @pool.mon_owned?
      disconnect.call
    end
    error = assert_raises(SystemExit) do
      protected_call { raise Elevateo::CollaborationError.new("not_available") }
    end
    assert_equal 73, error.status
    assert_equal [1, 1], [removals, disconnects]
    refute_includes @pool.connections, target
    refute target.active?
    assert_nil marker
    @pool.define_singleton_method(:remove, original_remove)
    assert_next_tenant_request
  ensure
    @pool.define_singleton_method(:remove, original_remove) if original_remove
    target.define_singleton_method(:disconnect!, original_disconnect) if original_disconnect
  end

  def test_fatal_quarantine_supersedes_ordinary_checkin_error
    target = @adapter
    removals = 0
    original_checkin = instrument(@pool, :checkin) do |checkin, connection|
      checkin.call(connection)
      raise "ordinary checkin error"
    end
    original_remove = instrument(@pool, :remove) do |remove, connection|
      removals += 1
      remove.call(connection)
      raise SystemExit.new(74)
    end
    error = assert_raises(SystemExit) { protected_call { response } }
    assert_equal 74, error.status
    assert_equal 1, removals
    refute_includes @pool.connections, target
    refute target.active?
    refute_nil marker, "already committed work is not rolled back by fatal checkin cleanup"
    @pool.define_singleton_method(:checkin, original_checkin)
    @pool.define_singleton_method(:remove, original_remove)
    assert_next_tenant_request
  ensure
    @pool.define_singleton_method(:checkin, original_checkin) if original_checkin
    @pool.define_singleton_method(:remove, original_remove) if original_remove
  end

  def test_fatal_before_native_close_leaves_detached_session_for_fixture_disposal
    target = @adapter
    backend = target.select_value("SELECT pg_backend_pid()")
    attempts = 0
    original_disconnect = instrument(target, :disconnect!) do |_disconnect|
      attempts += 1
      raise SystemExit.new(75)
    end
    error = assert_raises(SystemExit) do
      protected_call { raise Elevateo::CollaborationError.new("not_available") }
    end
    assert_equal 75, error.status
    assert_equal 1, attempts
    refute_includes @pool.connections, target
    assert target.active?, "a failing disposal callback cannot certify that the physical session closed"
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM pg_stat_activity WHERE pid=$1", [backend]).getvalue(0, 0)
    assert_nil marker
    target.define_singleton_method(:disconnect!, original_disconnect)
    original_disconnect.call
    assert_next_tenant_request
  ensure
    target.define_singleton_method(:disconnect!, original_disconnect) if original_disconnect
    original_disconnect.call if original_disconnect && target.active?
  end
end
