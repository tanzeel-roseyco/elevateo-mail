# frozen_string_literal: true

require_relative "../be_02/write_boundary_database_test_helper"

# AIDEV-NOTE: Real API login and digest-bound claims prove one actor cannot choose another preference identity.
class UserDisplayPreferencesDatabaseTest < WriteBoundaryDatabaseTestCase
  def preference_read(connection: @api, digest: @digest)
    JSON.parse(connection.exec_params("SELECT app.read_user_display_preference($1::text)", [digest]).getvalue(0, 0))
  end

  def preference_write(name:, expected:, connection: @api, digest: @digest)
    JSON.parse(connection.exec_params(<<~SQL, [digest, expected, name]).getvalue(0, 0))
      SELECT app.write_user_display_preference($1::text,$2::integer,$3::text)
    SQL
  end

  def test_own_default_then_versioned_update_and_conflict
    begin_write
    assert_equal({ "status" => "ok", "display_name" => nil, "revision" => 0 }, preference_read)
    @api.exec("ROLLBACK")

    begin_write
    assert_equal "ok", write_guard(targets: [@user]).fetch("status")
    first = preference_write(name: "Ada", expected: 0)
    assert_equal ["ok", "Ada", 1], first.values_at("status", "display_name", "revision")
    @api.exec("COMMIT")

    begin_write
    assert_equal "ok", write_guard(targets: [@user]).fetch("status")
    assert_equal "preference_conflict", preference_write(name: "Old", expected: 0).fetch("status")
    @api.exec("ROLLBACK")
    begin_write
    assert_equal ["Ada", 1], preference_read.values_at("display_name", "revision")
    @api.exec("ROLLBACK")
  end

  def test_mismatched_claims_and_direct_table_access_are_denied
    other = SecureRandom.uuid
    @api.exec("BEGIN")
    @api.exec_params("SELECT set_config('app.user_id',$1,true),set_config('app.org_id',$2,true)", [other, @org])
    assert_equal "not_found", preference_read.fetch("status")
    @api.exec("ROLLBACK")

    @api.exec("BEGIN")
    @api.exec_params("SELECT set_config('app.user_id',$1,true),set_config('app.org_id',$2,true)",
      [@user, SecureRandom.uuid])
    assert_equal "not_found", preference_read.fetch("status")
    @api.exec("ROLLBACK")

    begin_write
    assert_equal "ok", write_guard(targets: [@user]).fetch("status")
    @api.exec_params("SELECT set_config('app.user_id',$1,true)", [other])
    error = assert_raises(PG::InsufficientPrivilege) { preference_write(name: "Foreign", expected: 0) }
    assert_equal "42501", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    @api.exec("ROLLBACK")
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT * FROM app.user_display_preferences") }
  end

  def test_different_sessions_serialize_first_write_and_reject_stale_revision
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    with_api_connections(1) do |connections|
      second = connections.first
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      assert_equal "ok", preference_write(name: "First", expected: 0).fetch("status")
      begin_write(connection: second)
      child = Thread.new { write_guard(connection: second, digest: second_digest) }
      child.report_on_exception = false
      # AIDEV-NOTE: Observe an actual cross-session lock before releasing the first writer; sleep is not proof.
      wait_for_lock(second, blocker: @api.backend_pid)
      @api.exec("COMMIT")
      assert_equal "ok", guard_result(child).fetch("status")
      assert_equal "preference_conflict",
        preference_write(name: "Stale", expected: 0, connection: second, digest: second_digest).fetch("status")
      second.exec("ROLLBACK")
      begin_write
      assert_equal ["First", 1], preference_read.values_at("display_name", "revision")
    ensure
      @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
      child&.join(4)
      second.exec("ROLLBACK") if second && second.transaction_status != PG::PQTRANS_IDLE
    end
  end

  def test_invalid_database_input_cannot_mutate
    begin_write
    assert_equal "ok", write_guard(targets: [@user]).fetch("status")
    error = assert_raises(PG::InvalidParameterValue) { preference_write(name: "bad\nname", expected: 0) }
    assert_equal "22023", error.result.error_field(PG::Result::PG_DIAG_SQLSTATE)
    @api.exec("ROLLBACK")
    begin_write
    assert_equal 0, preference_read.fetch("revision")
    @api.exec("ROLLBACK")
  end

  def test_missing_expired_and_deleted_auth_sessions_cannot_read
    begin_write
    assert_equal "unauthorized", preference_read(digest: SecureRandom.hex(32)).fetch("status")
    @api.exec("ROLLBACK")
    @admin.exec_params("UPDATE app_auth.sessions SET idle_expires_at=clock_timestamp()-interval '1 second' " \
      "WHERE cookie_digest=$1", [@digest])
    begin_write
    assert_equal({ "status" => "unauthorized" }, preference_read)
    @api.exec("ROLLBACK")
    @admin.exec_params("UPDATE app_auth.sessions SET idle_expires_at=clock_timestamp()+interval '1 hour' " \
      "WHERE cookie_digest=$1", [@digest])
    @admin.exec_params("DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2", [@auth, @user])
    begin_write
    assert_equal({ "status" => "unauthorized" }, preference_read)
    @api.exec("ROLLBACK")
  end

  def test_withdrawn_membership_cannot_read_and_runtime_grants_stay_narrow
    # AIDEV-NOTE: Fixing the reader must not expose token-bearing session proofs to the application table owner.
    grants = @admin.exec(<<~SQL).first
      SELECT has_function_privilege('elevateo_owner','app_auth.resolve_session(text)','EXECUTE') AS owner_proof,
        has_function_privilege('elevateo_worker','app.read_user_display_preference(text)','EXECUTE') AS worker_read,
        has_table_privilege('elevateo_api','app.user_display_preferences','SELECT') AS api_table,
        pg_get_userbyid(proowner) AS reader_owner
      FROM pg_proc WHERE oid='app.read_user_display_preference(text)'::regprocedure
    SQL
    assert_equal({ "owner_proof" => "f", "worker_read" => "f", "api_table" => "f",
      "reader_owner" => "elevateo_session_owner" }, grants)
    membership(present: false)
    begin_write
    assert_equal({ "status" => "not_found" }, preference_read)
    @api.exec("ROLLBACK")
  end
end
