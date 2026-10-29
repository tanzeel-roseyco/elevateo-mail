# frozen_string_literal: true

require "/workspace/apps/server/test/sends/approval_database_helper"

# AIDEV-NOTE: Reuse production API-role fixture gates; retained rows prove restore cannot replay old authority.
class RestoreDrillSeed < SendDatabaseTestCase
  def test_seed_active_session_connector_and_queued_send
    result = approve
    assert_equal "queued", status(result.fetch("send_id")).fetch("state")
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    grant = JSON.parse(@api.exec_params(<<~SQL, [@digest, SecureRandom.uuid, SecureRandom.hex(32), @box]).getvalue(0, 0))
      SELECT app.connector_grant_issue($1::text,$2::uuid,$3::text,$4::uuid,'codex','{read,search}'::text[],3600)
    SQL
    assert_equal "ok", grant.fetch("status")
    @api.exec("COMMIT")
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_auth.sessions WHERE state='active'").getvalue(0, 0)
    assert_equal "1", @admin.exec("SELECT count(*) FROM app_connector_private.grants WHERE NOT revoked").getvalue(0, 0)
  end

  def teardown
    # The dedicated six-volume fixture is intentionally retained, never cleaned with generic test teardown.
    close_connections([@api, @worker, @admin])
  end
end
