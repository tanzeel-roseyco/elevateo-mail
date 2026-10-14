# frozen_string_literal: true

require_relative "write_boundary_database_test_helper"
require_relative "write_boundary_test_helper"
require "logger"
require "rails"

class WriteBoundaryPoolRecord < ActiveRecord::Base
  self.abstract_class = true
end

# AIDEV-NOTE: Only this separate real size-one API pool is under test; admin/API fixture observers are not members.
class WriteBoundaryPoolTestCase < WriteBoundaryDatabaseTestCase
  include AuthFixtures

  def setup
    super
    assert_equal "8.1.4", ActiveRecord.version.to_s
    assert_equal 170_006, @api.server_version
    @service = harness.first
    @identity = identity_for(@digest)
    @logs = StringIO.new
    @logger = Logger.new(@logs)
    WriteBoundaryPoolRecord.establish_connection(url: ENV.fetch("BE02_API_DATABASE_URL"),
      pool: 1, checkout_timeout: 1, reaping_frequency: nil, application_name: "be02-owned-write-test")
    @pool = WriteBoundaryPoolRecord.connection_pool
    @adapter = @pool.checkout(1)
    assert_equal "elevateo_api", @adapter.select_value("SELECT session_user")
    assert_equal ENV.fetch("BE02_TASK_DATABASE_NAME"), @adapter.select_value("SELECT current_database()")
    @pool.checkin(@adapter)
    @extra_orgs = []
  end

  def teardown
    WriteBoundaryPoolRecord.remove_connection
    (@extra_orgs || []).each do |org|
      @admin.exec_params("DELETE FROM app_auth.sessions WHERE organization_id=$1", [org])
      @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id=$1", [org])
      @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id=$1", [org])
      @admin.exec_params("DELETE FROM app.organizations WHERE id=$1", [org])
    end
    super
  end

  def identity_for(digest)
    data = JSON.parse(@admin.exec_params("SELECT app_auth.session_metadata(s) FROM app_auth.sessions s WHERE cookie_digest=$1", [digest]).getvalue(0, 0))
    Elevateo::SessionIdentity.new(user_id: @user, org_id: data.fetch("organization_id"),
      auth_session_id: @auth, digest: digest, display_name: nil, metadata: data)
  end

  def protected_call(identity: @identity, deadline: Elevateo::RequestDeadline.new, &operation)
    ActiveRecord::Base.stub(:connection_pool, @pool) do
      Rails.stub(:logger, @logger) do
        Elevateo::SessionWrites.new(sessions: @service).transaction(identity,
          context: identity.metadata.fetch("context_id"), version: @service.presentation.version(identity.metadata),
          csrf: identity.metadata.fetch("csrf_token"), guard_users: [], budget: 4096, deadline: deadline, &operation)
      end
    end
  end

  def response(status = 200) = Elevateo::WriteResponse.new(json: '{"saved":true}', status: status)

  def marker
    @admin.exec_params("SELECT write_transaction::text FROM app_auth.sessions WHERE cookie_digest=$1", [@digest]).getvalue(0, 0)
  end

  def assert_pool_integrity
    @pool.synchronize do
      registered = @pool.connections
      # AIDEV-NOTE: This test observes queue integrity; production's pinned seam only proves detached membership.
      available = @pool.instance_variable_get(:@available).instance_variable_get(:@queue)
      assert_operator registered.length, :<=, 1
      assert_empty available - registered
    end
  end

  def assert_next_tenant_request
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
    refute Thread.pending_interrupt?(Elevateo::RequestDeadline::Expired)
    org, digest = SecureRandom.uuid, SecureRandom.hex(32)
    @extra_orgs << org
    @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'next write tenant')", [org])
    @admin.exec_params("INSERT INTO app.organization_memberships(organization_id,user_id) VALUES ($1,$2)", [org, @user])
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [org, @user])
    assert_equal "ok", create(digest: digest).fetch("status")
    @admin.exec_params("UPDATE app_auth.sessions SET organization_id=$1, context_id=$2 WHERE cookie_digest=$3",
      [org, SecureRandom.uuid, digest])
    clean = @pool.checkout(1)
    assert_includes @pool.connections, clean
    assert_same ActiveSupport::IsolatedExecutionState.context, clean.owner
    assert_nil clean.select_value("SELECT NULLIF(current_setting('app.org_id',true),'')")
    refute clean.transaction_open?
    @pool.checkin(clean)
    value = protected_call(identity: identity_for(digest)) do |connection:, session:|
      assert_equal org, session.fetch("organization").fetch("id")
      row = connection.exec_query("SELECT current_setting('app.org_id') AS org, current_setting('app.user_id') AS actor", "claims", []).first
      assert_equal org, row.fetch("org")
      assert_equal @user, row.fetch("actor")
      response
    end
    assert_equal 200, value.status
    assert_pool_integrity
    count = nil
    wait_until do
      @admin.exec("SELECT pg_stat_clear_snapshot()")
      count = @admin.exec("SELECT count(*) FROM pg_stat_activity WHERE application_name='be02-owned-write-test' AND usename='elevateo_api'").getvalue(0, 0)
      count == "1"
    end
    assert_equal "1", count, "settled pool must have exactly its one API backend"
  end

  def wait_until(seconds: 2)
    limit = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
    until yield
      raise "observed barrier not reached" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= limit
      sleep 0.005
    end
  end

  def instrument(adapter, name, &replacement)
    original = adapter.method(name)
    adapter.define_singleton_method(name) { |*args, **kwargs, &block| replacement.call(original, *args, **kwargs, &block) }
    original
  end

  # AIDEV-NOTE: Waiters expose actual pool wait/lease events; queue gates select schedules without timing sleeps.
  def pool_waiter(acquired, release, expected_backend: nil)
    Thread.new do
      connection = @pool.checkout(3)
      begin
        assert_includes @pool.connections, connection
        assert_same ActiveSupport::IsolatedExecutionState.context, connection.owner
        # AIDEV-NOTE: Rails checkout is lazy; establish one real session before publishing the waiter barrier.
        backend = connection.select_value("SELECT pg_backend_pid()")
        assert_equal expected_backend, backend if expected_backend
        acquired << connection
        raise "waiter release barrier timed out" unless release.pop(timeout: 3)
        assert connection.active?, "a previous request disconnected this owner's adapter"
        assert_equal backend, connection.select_value("SELECT pg_backend_pid()"), "waiter backend must not reconnect"
      ensure
        @pool.checkin(connection)
      end
    end.tap { |thread| thread.report_on_exception = false }
  end

  def finish_pool_waiter(waiter, release)
    release << true
    assert waiter.join(3), "pool waiter did not finish"
    waiter.value
  end

  def stop_pool_waiter(waiter, release)
    release << true if release
    waiter&.join(3)
    waiter&.kill if waiter&.alive?
    waiter&.join(1)
  end
end
