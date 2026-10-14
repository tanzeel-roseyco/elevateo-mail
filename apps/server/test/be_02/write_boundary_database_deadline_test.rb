# frozen_string_literal: true

require_relative "write_boundary_database_test_helper"

class WriteBoundaryDatabaseDeadlineTest < WriteBoundaryDatabaseTestCase
  def test_native_deadline_bounds_multiple_statements_and_releases_guard_locks
    with_api_connections(1) do |connections|
      connection = connections.fetch(0)
      connection.set_error_verbosity(PG::PQERRORS_VERBOSE)
      backend = connection.backend_pid
      notices = capture_fatal_notices(connection)
      begin_write(connection: connection)
      assert_operator connection.server_version, :>=, 170_000
      connection.exec("SET LOCAL statement_timeout = '2s'; SET LOCAL lock_timeout = '1s'")
      connection.exec("SELECT set_config('transaction_timeout', '250ms', true)")
      assert_equal "ok", write_guard(connection: connection).fetch("status")
      connection.exec("SELECT pg_sleep(0.15)")
      # AIDEV-NOTE: Each statement fits its own timeout; only the cumulative PG17 deadline aborts this write.
      assert_transaction_timeout(connection, backend, notices) do
        connection.send_query("SELECT pg_sleep(0.15)")
        result = begin
          connection.get_result
        rescue PG::ConnectionBad => transport_error
          # AIDEV-NOTE: A failed async read may still retain the first structured result; never accept transport alone.
          buffered = connection.sync_get_result
          raise transport_error unless buffered
          buffered
        end
        refute_nil result, "first native result must be observed before draining the closed socket"
        result.check
      end
      assert_rolled_back_and_unlocked
    end
  end

  def test_native_deadline_includes_idle_serialization_time_before_commit
    with_api_connections(1) do |connections|
      connection = connections.fetch(0)
      connection.set_error_verbosity(PG::PQERRORS_VERBOSE)
      backend = connection.backend_pid
      notices = capture_fatal_notices(connection)
      begin_write(connection: connection)
      connection.exec("SELECT set_config('transaction_timeout', '150ms', true)")
      assert_equal "ok", write_guard(connection: connection).fetch("status")
      sleep 0.25
      assert_transaction_timeout(connection, backend, notices) do
        raise "native idle fatal readiness missing" unless connection.socket_io.wait_readable(2)
        begin
          connection.consume_input
        rescue PG::ConnectionBad
          # AIDEV-NOTE: A fatal idle message may already be buffered; parse it before COMMIT discards prior results.
        end
        connection.sync_get_result&.check
        connection.exec("COMMIT")
      end
      assert_rolled_back_and_unlocked
    end
  end

  def test_transaction_timeout_disabled_control_completes_same_cumulative_work
    begin_write
    @api.exec("SET LOCAL transaction_timeout = 0; SET LOCAL statement_timeout = '2s'")
    assert_equal "ok", write_guard.fetch("status")
    2.times { @api.exec("SELECT pg_sleep(0.15)") }
    @api.exec("COMMIT")
    assert_equal "1", @api.exec("SELECT 1").getvalue(0, 0)
  end

  def test_statement_timeout_has_distinct_diagnostic
    begin_write
    @api.exec("SET LOCAL transaction_timeout = '2s'; SET LOCAL statement_timeout = '100ms'")
    error = assert_raises(PG::QueryCanceled) { @api.exec("SELECT pg_sleep(0.2)") }
    assert_equal "57014", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    @api.exec("ROLLBACK")
  end

  def test_observed_lock_wait_has_distinct_diagnostic
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT 1 FROM app_auth.sessions WHERE cookie_digest=$1 FOR UPDATE", [@digest])
    begin_write
    @api.exec("SET LOCAL transaction_timeout = '2s'; SET LOCAL lock_timeout = '500ms'")
    thread = Thread.new do
      write_guard
    rescue PG::Error => error
      error
    end
    wait_for_lock(@api)
    error = guard_result(thread)
    assert_instance_of PG::LockNotAvailable, error
    assert_equal "55P03", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    @api.exec("ROLLBACK")
  ensure
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
    thread&.kill if thread&.alive?
    thread&.join(1)
  end

  private

  def capture_fatal_notices(connection)
    notices = []
    connection.set_notice_receiver do |result|
      # AIDEV-NOTE: libpq delivers idle ErrorResponse through notices; copy structured fields before it frees PGresult.
      if result.error_field(PG::Result::PG_DIAG_SEVERITY_NONLOCALIZED) == "FATAL"
        notices << { "sqlstate" => result.error_field(PG::Result::PG_DIAG_SQLSTATE), "severity" => "FATAL" }
      end
    end
    notices
  end

  def assert_transaction_timeout(connection, backend, notices)
    error = assert_raises(PG::Error) { yield }
    diagnostics = notices.dup
    if error.result
      diagnostics << { "sqlstate" => error.result.error_field(PG::Result::PG_DIAG_SQLSTATE),
        "severity" => error.result.error_field(PG::Result::PG_DIAG_SEVERITY_NONLOCALIZED) }
    end
    # AIDEV-NOTE: A transport failure alone is insufficient; only the original structured server fatal qualifies.
    puts JSON.generate(native_timeout_diagnostic: {
      backend: backend, error_class: error.class.name,
      result_sqlstate: error.result&.error_field(PG::Result::PG_DIAG_SQLSTATE),
      error_has_25p04: /\b25P04\b/.match?(error.message),
      connection_has_25p04: /\b25P04\b/.match?(connection.error_message),
      connection_bad: connection.status == PG::CONNECTION_BAD, structured_fatal: diagnostics
    })
    assert_includes diagnostics, { "sqlstate" => "25P04", "severity" => "FATAL" }
  end

  def assert_rolled_back_and_unlocked
    @admin.exec("BEGIN")
    @admin.exec("SET LOCAL lock_timeout = '200ms'")
    row = @admin.exec_params(<<~SQL, [@digest]).first
      SELECT write_transaction, write_guard_users FROM app_auth.sessions WHERE cookie_digest = $1 FOR UPDATE
    SQL
    assert_nil row.fetch("write_transaction")
    assert_nil row.fetch("write_guard_users")
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1,$2)", [@org, @user])
    @admin.exec("COMMIT")
  ensure
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
