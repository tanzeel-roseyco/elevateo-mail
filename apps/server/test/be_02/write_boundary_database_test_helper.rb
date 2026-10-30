# frozen_string_literal: true

require_relative "database_test_helper"

class WriteBoundaryDatabaseTestCase < SessionDatabaseTestCase
  def setup
    super
    assert_equal "ok", create.fetch("status")
    @extra_targets = []
  end

  def teardown
    @api&.exec("ROLLBACK") if @api && @api.transaction_status != PG::PQTRANS_IDLE
    @admin&.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    (@extra_targets || []).each do |user|
      @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, user])
    end
    super
  end

  def begin_write(connection: @api)
    connection.exec("BEGIN")
    connection.exec_params("SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)", [@user, @org])
  end

  def write_guard(targets: [], connection: @api, digest: @digest, user: @user, auth: @auth)
    JSON.parse(connection.exec_params(<<~SQL, [digest, user, auth, "{#{targets.join(',')}}"]).getvalue(0, 0))
      SELECT app_auth.begin_protected_write($1::text, $2::uuid, $3::uuid, $4::uuid[])
    SQL
  end

  def private_assert(target: @user, connection: @admin)
    JSON.parse(connection.exec_params("SELECT app_auth.assert_protected_write($1::text, $2::uuid)", [@digest, target]).getvalue(0, 0))
  end

  def remember_target(value = SecureRandom.uuid)
    @extra_targets << value
    value
  end

  # AIDEV-NOTE: Legacy callers default to the admin blocker; new races must supply their exact blocker PID.
  def wait_for_lock(connection, blocker: @admin.backend_pid, lock_kind: "transactionid", seconds: 0.7)
    limit = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
    loop do
      @admin.exec("SELECT pg_stat_clear_snapshot()")
      row = @admin.exec_params(<<~SQL, [connection.backend_pid, blocker, lock_kind]).first
        SELECT a.state, a.wait_event_type, a.wait_event, clock_timestamp() AS observed_at,
          pg_blocking_pids(a.pid)::text AS blockers,
          $2::integer = ANY(pg_blocking_pids(a.pid)) AS expected_blocker,
          EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND NOT l.granted
            AND l.locktype = $3) AS expected_kind
        FROM pg_stat_activity a WHERE a.pid = $1
      SQL
      if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= limit
        raise "lock prerequisite missed: waiter=#{connection.backend_pid} blocker=#{blocker} kind=#{lock_kind} observed=#{row.inspect}"
      end
      return row if row && row.fetch("wait_event_type") == "Lock" &&
        row.fetch("expected_blocker") == "t" && row.fetch("expected_kind") == "t"
      sleep 0.01
    end
  end

  # AIDEV-NOTE: Release the blocker before bounded joins; child exceptions must not strand a live query in teardown.
  def with_guard_thread(targets: [])
    thread = Thread.new { write_guard(targets: targets) }
    thread.report_on_exception = false
    yield thread
  ensure
    failure = $!
    begin
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
    rescue Exception => error # Preserve assertion failures while still draining the child.
      failure ||= error
    ensure
      begin
        unless thread.join(12)
          failure ||= RuntimeError.new("guard thread exceeded 12-second cleanup bound")
          thread.kill
          thread.join(1)
        end
      rescue Exception => error
        failure ||= error
      end
    end
    raise failure if failure
  end

  def guard_result(thread)
    raise "guard thread exceeded 12-second result bound" unless thread.join(12)
    thread.value
  end

  def assert_lock_timeout(connection)
    error = assert_raises(PG::LockNotAvailable) { yield }
    assert_equal "55P03", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
  ensure
    connection.exec("ROLLBACK") if connection.transaction_status != PG::PQTRANS_IDLE
  end
end
