# frozen_string_literal: true

require_relative "write_boundary_database_test_helper"

class WriteBoundaryDatabaseTest < WriteBoundaryDatabaseTestCase
  def test_cookie_bound_actor_metadata_and_no_secret_projection
    begin_write
    result = write_guard
    assert_equal "ok", result.fetch("status")
    assert_equal @user, result.fetch("user_id")
    assert_equal @org, result.fetch("organization_id")
    assert_kind_of Integer, result.fetch("authorization_generation")
    refute(result.keys.any? { |key| key.include?("ciphertext") || key.include?("write_") })
    @api.exec("COMMIT")
  end

  def test_wrong_identity_and_organization_claims_do_not_grant_authority
    begin_write
    assert_equal "unauthorized", write_guard(user: SecureRandom.uuid).fetch("status")
    @api.exec("ROLLBACK")
    begin_write
    @api.exec_params("SELECT set_config('app.org_id', $1, true)", [SecureRandom.uuid])
    assert_equal "context_changed", write_guard.fetch("status")
    @api.exec("ROLLBACK")
  end

  def test_api_cannot_read_or_forge_guard_state_or_call_private_assertion
    ["SELECT write_transaction FROM app_auth.sessions",
      "UPDATE app_auth.sessions SET write_transaction = pg_current_xact_id()",
      "SELECT * FROM app_auth.authorization_generations",
      "UPDATE app.mailbox_memberships SET compose = true",
      "SELECT app_auth.assert_protected_write('#{@digest}', '#{@user}')"].each do |sql|
      assert_raises(PG::InsufficientPrivilege) { @api.exec(sql) }
    end
  end

  def test_privileged_membership_helper_cannot_bypass_guard_or_replay_previous_transaction
    begin_write(connection: @admin)
    assert_raises(PG::InsufficientPrivilege) { private_assert }
    @admin.exec("ROLLBACK")
    begin_write(connection: @admin)
    assert_equal "ok", write_guard(connection: @admin).fetch("status")
    assert_equal "ok", private_assert.fetch("status")
    @admin.exec("COMMIT")
    begin_write(connection: @admin)
    assert_raises(PG::InsufficientPrivilege) { private_assert }
    @admin.exec("ROLLBACK")
  end

  def test_guard_includes_actor_and_deduplicated_target_then_asserts_exact_target
    target = remember_target
    begin_write(connection: @admin)
    assert_equal "ok", write_guard(targets: [target, target], connection: @admin).fetch("status")
    assert_equal "ok", private_assert(target: target).fetch("status")
    assert_equal "ok", private_assert(target: @user).fetch("status")
    assert_raises(PG::InsufficientPrivilege) { private_assert(target: SecureRandom.uuid) }
    @admin.exec("ROLLBACK")
  end

  def test_guards_are_bounded_and_read_committed_only
    begin_write
    assert_raises(PG::InvalidParameterValue) { write_guard(targets: Array.new(3) { SecureRandom.uuid }) }
    @api.exec("ROLLBACK")
    @api.exec("BEGIN ISOLATION LEVEL REPEATABLE READ")
    assert_raises(PG::ActiveSqlTransaction) { write_guard }
    @api.exec("ROLLBACK")
  end

  def test_failed_write_rolls_back_missing_tombstone_and_activity
    target = remember_target
    before = @admin.exec_params("SELECT idle_expires_at FROM app_auth.sessions WHERE cookie_digest = $1", [@digest]).getvalue(0, 0)
    begin_write
    assert_equal "ok", write_guard(targets: [target]).fetch("status")
    @api.exec("ROLLBACK")
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_auth.authorization_generations WHERE organization_id = $1 AND user_id = $2", [@org, target]).getvalue(0, 0)
    assert_equal before, @admin.exec_params("SELECT idle_expires_at FROM app_auth.sessions WHERE cookie_digest = $1", [@digest]).getvalue(0, 0)
  end

  def test_expired_local_or_auth_session_denies_even_with_matching_proofs
    @admin.exec_params("UPDATE auth.sessions SET not_after = clock_timestamp() - interval '1 second' WHERE id = $1", [@auth])
    begin_write
    assert_equal "unauthorized", write_guard.fetch("status")
    @api.exec("ROLLBACK")
  end

  def test_parameterized_target_shapes_have_deterministic_sqlstates
    target = remember_target
    [nil, "{NULL}", "{#{target},#{target},#{target}}", "{{#{target}}}",
      "{{#{target},#{target}}}"].each do |literal|
      begin_write
      error = assert_raises(PG::InvalidParameterValue) { guard_literal(literal) }
      assert_equal "22023", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE), literal.inspect
      @api.exec("ROLLBACK")
    end
    ["{}", "{#{target}}", "{#{target},#{target}}", "{#{@user},#{target}}"].each do |literal|
      begin_write
      assert_equal "ok", guard_literal(literal).fetch("status")
      @api.exec("ROLLBACK")
    end
  end

  def test_identical_target_reentry_rejects_with_active_transaction_state
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    error = assert_raises(PG::ActiveSqlTransaction) { write_guard }
    assert_equal "25001", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    @api.exec("ROLLBACK")
  end

  def test_reentry_rejects_before_generation_lock_inversion
    # AIDEV-NOTE: Analytical schedule becomes evidence only when this test observes T2 blocked by T1 on A.
    lower = remember_target("00000000-0000-0000-0000-000000000001")
    assert_operator lower, :<, @user
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    # AIDEV-NOTE: A committed tuple is required; NOWAIT cannot observe T2's still-uncommitted first insertion.
    @admin.exec_params("INSERT INTO app_auth.authorization_generations(organization_id,user_id) VALUES ($1,$2)", [@org, lower])
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app_auth.authorization_generations WHERE organization_id=$1 AND user_id=$2", [@org, lower]).getvalue(0, 0)
    with_api_connections(1) do |connections|
      second = connections.first
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      begin_write(connection: second)
      child = Thread.new { write_guard(connection: second, digest: second_digest, targets: [lower]) }
      child.report_on_exception = false
      wait_for_lock(second, blocker: @api.backend_pid)
      @admin.exec("BEGIN")
      # T2 already owns lower B; exact NOWAIT failure proves the other half of the would-be cycle.
      assert_raises(PG::LockNotAvailable) do
        @admin.exec_params("SELECT 1 FROM app_auth.authorization_generations WHERE organization_id=$1 AND user_id=$2 FOR UPDATE NOWAIT", [@org, lower])
      end
      @admin.exec("ROLLBACK")
      @api.exec("SET LOCAL lock_timeout = '200ms'")
      error = assert_raises(PG::ActiveSqlTransaction) { write_guard(targets: [lower]) }
      assert_equal "25001", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
      @api.exec("ROLLBACK")
      assert_equal "ok", guard_result(child).fetch("status")
    ensure
      @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
      child&.join(4)
      child&.kill if child&.alive?
      child&.join(1)
      second.exec("ROLLBACK") if second && second.transaction_status != PG::PQTRANS_IDLE
    end
  end

  private

  def guard_literal(literal)
    JSON.parse(@api.exec_params("SELECT app_auth.begin_protected_write($1::text,$2::uuid,$3::uuid,$4::uuid[])",
      [@digest, @user, @auth, literal]).getvalue(0, 0))
  end
end
