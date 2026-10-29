# frozen_string_literal: true

require_relative "budget_database_helper"

# AIDEV-NOTE: Separate PostgreSQL sessions prove lock ordering and quota decisions after a real wait.
class SendBudgetConcurrencyTest < SendBudgetDatabaseTestCase
  def test_concurrent_reservations_never_exceed_the_shared_ceiling
    update_limit("ceiling=1")
    second = connect("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    first_pair = prepare_submission
    second_pair = prepare_submission(connection: second)
    @worker.exec("BEGIN")
    refute_nil authorize(first_pair)
    thread = Thread.new { authorize(second_pair) }
    thread.report_on_exception = false
    wait_for_lock(second, blocker: @worker.backend_pid, seconds: 0.7)
    @worker.exec("COMMIT")
    assert thread.join(3), "second worker failed to finish"
    assert_nil thread.value
    assert_equal 7, usage.length
    assert(usage.all? { |row| row.fetch("used") == "1" })
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
    row = @admin.exec_params("SELECT state,hold_reason,attempt_count FROM app_send_private.jobs WHERE send_id=$1", [second_pair.last.send_id]).first
    assert_equal({ "state" => "queued", "hold_reason" => "counter_exhausted", "attempt_count" => "0" }, row)
  ensure
    @worker.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
    second&.close
  end

  def test_deadline_expiring_during_budget_lock_wait_rolls_back_every_charge
    pair = prepare_submission(deadline: 1)
    # AIDEV-NOTE: Production lock timeout is 1s; only this fixture extends it to expose the post-wait deadline fence.
    @worker.exec("SET lock_timeout='2500ms'; SET statement_timeout='4s'")
    @admin.exec("BEGIN; SELECT id FROM app_send_private.budget_limits WHERE kind='mailbox' FOR UPDATE")
    thread = Thread.new { authorize(pair) }
    thread.report_on_exception = false
    wait_for_lock(@worker, blocker: @admin.backend_pid, seconds: 0.7)
    sleep 1.1
    @admin.exec("COMMIT")
    assert thread.join(3), "deadline worker failed to finish"
    assert_nil thread.value
    assert_empty usage
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.attempt_budgets").getvalue(0, 0)
    assert_equal "control_unavailable", @admin.exec_params("SELECT hold_reason FROM app_send_private.jobs WHERE send_id=$1", [pair.last.send_id]).getvalue(0, 0)
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(5)
  end

  def test_limit_disabled_during_wait_cannot_reserve_with_stale_configuration
    pair = prepare_submission
    @admin.exec("BEGIN; UPDATE app_send_private.budget_limits SET enabled=false,version=2 WHERE kind='mailbox'")
    thread = Thread.new { authorize(pair) }
    thread.report_on_exception = false
    wait_for_lock(@worker, blocker: @admin.backend_pid, seconds: 0.7)
    @admin.exec("COMMIT")
    assert thread.join(3)
    assert_nil thread.value
    assert_empty usage
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.attempts").getvalue(0, 0)
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
  end

  def test_down_waiting_for_attempts_does_not_take_route_locks_first
    ddl = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    probe = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    ddl.exec("SET statement_timeout='5s'; BEGIN")
    probe.exec("SET lock_timeout='150ms'; SET statement_timeout='2s'")
    @admin.exec("BEGIN; LOCK TABLE app_send_private.attempts IN ACCESS SHARE MODE")
    ddl.send_query(File.read(File.join(budget_root, "budget_down.sql")))
    wait_for_lock(ddl, blocker: @admin.backend_pid, lock_kind: "relation", seconds: 0.7)
    # AIDEV-NOTE: Old downgrade held routes while waiting for attempts; this worker-order probe would time out.
    assert_equal "1", probe.exec("SELECT count(*) FROM (SELECT id FROM app_send_private.budget_routes FOR SHARE) routes").getvalue(0, 0)
    @admin.exec("ROLLBACK")
    assert_raises(PG::ObjectNotInPrerequisiteState) do
      while (result = ddl.get_result)
        result.check
      end
    end
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_send_private.budget_routes").getvalue(0, 0)
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    ddl&.close
    probe&.close
  end
end
