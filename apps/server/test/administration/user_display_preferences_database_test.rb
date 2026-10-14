# frozen_string_literal: true

require_relative "../be_02/write_boundary_database_test_helper"

# AIDEV-NOTE: Real API login and digest-bound claims prove one actor cannot choose another preference identity.
class UserDisplayPreferencesDatabaseTest < WriteBoundaryDatabaseTestCase
  def preference_read(connection: @api, digest: @digest)
    JSON.parse(connection.exec_params("SELECT app.read_user_display_preference($1::text)", [digest]).getvalue(0, 0))
  end

  def preference_write(name:, expected:, connection: @api)
    JSON.parse(connection.exec_params(<<~SQL, [@digest, expected, name]).getvalue(0, 0))
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
end
