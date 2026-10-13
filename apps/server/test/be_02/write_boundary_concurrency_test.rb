# frozen_string_literal: true

require_relative "write_boundary_database_test_helper"

# AIDEV-NOTE: Exact blockers and database timestamps prove the intended race before accepting its outcome.
class WriteBoundaryConcurrencyTest < WriteBoundaryDatabaseTestCase
  def test_write_holds_session_against_concurrent_revocation_until_commit
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    with_api_connections(1) do |connections|
      contender = connections.fetch(0)
      contender.exec("SET lock_timeout = '100ms'")
      assert_lock_timeout(contender) { invoke("revoke_session", @digest, "local", connection: contender) }
      @api.exec("COMMIT")
      assert_equal "ok", invoke("revoke_session", @digest, "local", connection: contender).fetch("status")
    end
  end

  def test_committed_revocation_wins_when_write_was_waiting_on_session
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE cookie_digest = $1 FOR UPDATE", [@digest])
    begin_write
    with_guard_thread do |thread|
      wait_for_lock(@api, blocker: @admin.backend_pid, lock_kind: "transactionid")
      @admin.exec_params("UPDATE app_auth.sessions SET state = 'revoked', revoked_at = clock_timestamp() WHERE cookie_digest = $1", [@digest])
      @admin.exec("COMMIT")
      assert_equal "unauthorized", guard_result(thread).fetch("status")
    end
    @api.exec("ROLLBACK")
  end

  def test_wall_clock_expiry_is_checked_after_generation_wait
    expiry = @admin.exec_params(<<~SQL, [@digest]).getvalue(0, 0)
      UPDATE app_auth.sessions SET idle_expires_at = clock_timestamp() + interval '3 seconds'
      WHERE cookie_digest = $1 RETURNING idle_expires_at
    SQL
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, @user])
    begin_write
    # AIDEV-NOTE: These SQL-only race budgets leave margin around expiry; HTTP deadline policy stays unchanged.
    @api.exec("SET LOCAL lock_timeout = '8s'; SET LOCAL statement_timeout = '10s'; SET LOCAL transaction_timeout = '15s'")
    started = @api.exec("SELECT transaction_timestamp()").getvalue(0, 0)
    assert_operator Time.parse(started), :<, Time.parse(expiry), "writer must begin before recorded expiry"
    with_guard_thread do |thread|
      observed = wait_for_lock(@api, blocker: @admin.backend_pid, lock_kind: "transactionid", seconds: 2)
      assert_operator Time.parse(observed.fetch("observed_at")), :<, Time.parse(expiry),
        "generation wait must be observed before recorded expiry"
      limit = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
      loop do
        crossed = @admin.exec_params("SELECT clock_timestamp() >= $1::timestamptz", [expiry]).getvalue(0, 0)
        raise "database clock did not cross recorded expiry within 5 seconds" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= limit
        break if crossed == "t"
        sleep 0.01
      end
      # AIDEV-NOTE: A timeout/early return cannot masquerade as a successful post-expiry authorization check.
      wait_for_lock(@api, blocker: @admin.backend_pid, lock_kind: "transactionid")
      @admin.exec("COMMIT")
      assert_equal "unauthorized", guard_result(thread).fetch("status")
    end
    @api.exec("ROLLBACK")
  end

  def test_auth_revocation_committed_during_generation_wait_is_rechecked
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, @user])
    begin_write
    with_guard_thread do |thread|
      wait_for_lock(@api, blocker: @admin.backend_pid, lock_kind: "transactionid")
      @admin.exec_params("DELETE FROM auth.sessions WHERE id = $1", [@auth])
      @admin.exec("COMMIT")
      assert_equal "unauthorized", guard_result(thread).fetch("status")
    end
    @api.exec("ROLLBACK")
  end

  def test_session_is_locked_before_any_generation_insert
    target = remember_target
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE cookie_digest = $1 FOR UPDATE", [@digest])
    begin_write
    with_guard_thread(targets: [target]) do |thread|
      wait_for_lock(@api, blocker: @admin.backend_pid, lock_kind: "transactionid")
      # A conflicting uncommitted insert would block this unique key if the writer inserted before session lock.
      @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id,user_id) VALUES ($1,$2)", [@org, target])
      @admin.exec("COMMIT")
      assert_equal "ok", guard_result(thread).fetch("status")
    end
    @api.exec("ROLLBACK")
  end

  def test_missing_target_is_not_inserted_before_an_earlier_generation_lock
    @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, @user])
    first = remember_target("00000000-0000-4000-8000-000000000001")
    last = remember_target("ffffffff-ffff-4fff-8fff-ffffffffffff")
    @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id,user_id) VALUES ($1,$2)", [@org, first])
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, first])
    begin_write
    with_guard_thread(targets: [last, first]) do |thread|
      wait_for_lock(@api, blocker: @admin.backend_pid, lock_kind: "transactionid")
      # A batch-insert implementation would already own last's unique key and deadlock this insertion.
      @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id,user_id) VALUES ($1,$2)", [@org, last])
      @admin.exec("COMMIT")
      assert_equal "ok", guard_result(thread).fetch("status")
    end
    @api.exec("ROLLBACK")
  end

  def test_post_guard_membership_revocation_waits_for_actor_generation
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    @admin.exec("BEGIN")
    @admin.exec("SET LOCAL lock_timeout = '100ms'")
    assert_lock_timeout(@admin) do
      @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, $2)", [@org, @user])
    end
    @api.exec("COMMIT")
  end
end
