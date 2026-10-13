# frozen_string_literal: true

require_relative "draft_database_test_helper"

class DraftConcurrencyTest < DraftDatabaseTestCase
  def test_identical_cross_session_retry_waits_then_returns_original_without_second_increment
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    value = payload("body_text" => "once")
    with_api_connections(1) do |connections|
      contender = connections.fetch(0)
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      first = save_sql(value)
      waiting = Thread.new { save(value, connection: contender, digest: second_digest) }
      waiting.report_on_exception = false
      begin
        wait_for_draft_blocker(contender, @api)
        @api.exec("COMMIT")
        assert_equal first, draft_worker_result(waiting)
      ensure
        @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
        draft_worker_result(waiting)
      end
    end
    assert_equal "1", draft_row.fetch("version")
    assert_equal 1, ledger.length
  end

  def test_compose_removal_waits_for_save_generation_then_hides_retry
    revoker_digest = prepare_revoker
    generation = authorize.fetch("authorization_generation")
    with_api_connections(1) do |connections|
      revoker = connections.fetch(0)
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      first = save_sql(payload)
      removal = Thread.new do
        begin_write(connection: revoker)
        assert_equal "ok", write_guard(connection: revoker, digest: revoker_digest, targets: [@user]).fetch("status")
        revoke_compose(revoker, revoker_digest)
        revoker.exec("COMMIT")
      end
      removal.report_on_exception = false
      begin
        wait_for_draft_blocker(revoker, @api)
        @api.exec("COMMIT")
        draft_worker_result(removal)
        assert_equal 1, first.fetch("version")
        assert_equal "context_changed", authorize(generation: generation).fetch("status")
        assert_equal "ok", authorize.fetch("status")
        original = ledger
        assert_equal({ "code" => "not_available" }, save)
        assert_equal({ "code" => "not_available" }, lookup)
        assert_equal original, ledger
        assert_equal "1", draft_row.fetch("version")
      ensure
        @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
        begin
          draft_worker_result(removal)
        ensure
          revoker.exec("ROLLBACK") if revoker.transaction_status != PG::PQTRANS_IDLE
        end
      end
    end
  end

  def test_revocation_commits_first_and_waiting_save_has_no_effect
    revoker_digest = prepare_revoker
    with_api_connections(1) do |connections|
      revoker = connections.fetch(0)
      begin_write(connection: revoker)
      assert_equal "ok", write_guard(connection: revoker, digest: revoker_digest, targets: [@user]).fetch("status")
      revoke_compose(revoker, revoker_digest)
      waiting = Thread.new { save }
      waiting.report_on_exception = false
      begin
        wait_for_draft_blocker(@api, revoker)
        revoker.exec("COMMIT")
        assert_equal({ "code" => "not_available" }, draft_worker_result(waiting))
        assert_empty ledger
        assert_nil draft_row
      ensure
        revoker.exec("ROLLBACK") if revoker.transaction_status != PG::PQTRANS_IDLE
        draft_worker_result(waiting)
      end
    end
  end

  def prepare_revoker
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET manage_members = true WHERE mailbox_id = $1 AND user_id = $2", [@box, @user])
    end
    digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: digest).fetch("status")
    digest
  end

  def revoke_compose(connection, digest)
    revision = connection.exec_params("SELECT app.mailbox_membership_version($1)", [@box]).getvalue(0, 0)
    result = JSON.parse(connection.exec_params(
      "SELECT app.change_mailbox_membership($1,$2,$3,$4,false,false,false,true)", [digest, @box, @user, revision]).getvalue(0, 0))
    assert_equal "ok", result.fetch("status")
  end

  def wait_for_draft_blocker(waiter, holder)
    # AIDEV-NOTE: Independent observer proves the exact holder PID blocks the production guard, without prelocks.
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 0.7
    loop do
      blocked = @admin.exec_params(<<~SQL, [waiter.backend_pid, holder.backend_pid])
        SELECT $2::integer = ANY(pg_blocking_pids($1::integer))
          AND query LIKE '%app_auth.begin_protected_write%'
        FROM pg_stat_activity WHERE pid = $1::integer
      SQL
      return if blocked.getvalue(0, 0) == "t"
      raise "expected draft guard blocker was not observed" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      Thread.pass
    end
  end

  def draft_worker_result(thread)
    return thread.value if thread.join(4)
    thread.kill
    thread.join(1)
    raise "draft worker did not finish within database statement timeout"
  end

  def test_conflicting_concurrent_creates_record_one_applied_and_one_terminal_conflict
    values = [payload("subject" => "first"), payload("operation_id" => SecureRandom.uuid, "subject" => "second")]
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    results = with_api_connections(1) do |connections|
      contender = connections.fetch(0)
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      first = save_sql(values.first)
      waiting = Thread.new { save(values.last, connection: contender, digest: second_digest) }
      waiting.report_on_exception = false
      begin
        wait_for_draft_blocker(contender, @api)
        @api.exec("COMMIT")
        [first, draft_worker_result(waiting)]
      ensure
        @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
        draft_worker_result(waiting)
      end
    end
    assert_equal 1, results.count { |result| result["version"] == 1 }
    assert_equal 1, results.count { |result| result["code"] == "draft_conflict" }
    assert_equal 2, ledger.length
    conflict = values.find { |value| lookup(operation: value.operation_id)["outcome"] == "conflict" }
    refute_nil conflict
    assert_equal 1, lookup(operation: conflict.operation_id).fetch("current_version")
    assert_equal "1", draft_row.fetch("version")
  end

end
