# frozen_string_literal: true

require_relative "database_test_helper"

# AIDEV-NOTE: Global logout captures committed sessions; login commit order is measured against that cut.
class SessionLogoutCutTest < SessionDatabaseTestCase
  def test_login_committed_before_logout_cut_is_revoked
    assert_logout_cut(login_commit: :before_cut)
  end

  def test_login_committed_after_cut_before_logout_commit_survives
    assert_logout_cut(login_commit: :before_logout_commit)
  end

  def test_login_committed_after_logout_commit_survives
    assert_logout_cut(login_commit: :after_logout_commit)
  end

  private

  def assert_logout_cut(login_commit:)
    concurrent = SecureRandom.hex(32)
    assert_equal "ok", create.fetch("status")
    with_api_connections(1) do |connections|
      logout = connections.fetch(0)
      @api.exec("BEGIN")
      assert_equal "ok", create(digest: concurrent).fetch("status")
      @api.exec("COMMIT") if login_commit == :before_cut

      logout.exec("BEGIN")
      result = invoke("revoke_session", @digest, "global", connection: logout)
      assert_equal "ok", result.fetch("status")
      assert result.fetch("upstream_revocation_pending")
      # AIDEV-NOTE: The function has captured its cut, but explicit BEGIN keeps the logout uncommitted here.
      assert_equal "active", session_state(@digest)
      @api.exec("COMMIT") if login_commit == :before_logout_commit
      logout.exec("COMMIT")
      @api.exec("COMMIT") if login_commit == :after_logout_commit
    end

    assert_equal "revoked", session_state(@digest)
    assert_equal "unauthorized", invoke("resolve_session", @digest).fetch("status")
    expected = login_commit == :before_cut ? "revoked" : "active"
    assert_equal expected, session_state(concurrent)
    expected_status = login_commit == :before_cut ? "unauthorized" : "ok"
    assert_equal expected_status, invoke("resolve_session", concurrent).fetch("status")
    expected_intents = login_commit == :before_cut ? 2 : 1
    assert_equal expected_intents, @admin.exec_params("SELECT count(*) FROM app_auth.revocation_intents WHERE cookie_digest IN ($1, $2)", [@digest, concurrent]).getvalue(0, 0).to_i
  end

  def session_state(digest)
    @admin.exec_params("SELECT state FROM app_auth.sessions WHERE cookie_digest = $1", [digest]).getvalue(0, 0)
  end
end
