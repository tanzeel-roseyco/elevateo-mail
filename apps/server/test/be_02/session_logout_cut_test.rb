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

  def test_global_logout_uses_caller_credential_and_preserves_old_local_intent
    old = SecureRandom.hex(32)
    assert_equal "ok", create(digest: old).fetch("status")
    assert_equal "ok", invoke("revoke_session", old, "local").fetch("status")
    assert_equal "ok", create.fetch("status")
    assert_equal "ok", invoke("revoke_session", @digest, "global").fetch("status")
    rows = @admin.exec_params(<<~SQL, [@user]).values
      SELECT i.cookie_digest, i.scope FROM app_auth.revocation_intents i
        JOIN app_auth.sessions s USING(cookie_digest) WHERE s.user_id = $1 ORDER BY i.id
    SQL
    assert_equal [[old, "local"], [@digest, "global"]], rows
    assert_equal "local", @admin.exec_params(
      "SELECT revocation_scope FROM app_auth.sessions WHERE cookie_digest = $1", [old]).getvalue(0, 0)
    assert_equal "global", @admin.exec_params(
      "SELECT revocation_scope FROM app_auth.sessions WHERE cookie_digest = $1", [@digest]).getvalue(0, 0)
    assert_equal "revoked", session_state(old)
    assert_equal "revoked", session_state(@digest)
    assert_equal "unauthorized", invoke("resolve_session", old).fetch("status")
    assert_equal "unauthorized", invoke("resolve_session", @digest).fetch("status")
    assert_equal "unauthorized", invoke("revoke_session", old, "global").fetch("status")
    assert_equal rows, @admin.exec_params(<<~SQL, [@user]).values
      SELECT i.cookie_digest, i.scope FROM app_auth.revocation_intents i
        JOIN app_auth.sessions s USING(cookie_digest) WHERE s.user_id = $1 ORDER BY i.id
    SQL
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
    assert_equal ["global"], @admin.exec_params(
      "SELECT scope FROM app_auth.revocation_intents WHERE cookie_digest = $1", [@digest]).column_values(0)
    assert_equal(login_commit == :before_cut ? ["local"] : [], @admin.exec_params(
      "SELECT scope FROM app_auth.revocation_intents WHERE cookie_digest = $1", [concurrent]).column_values(0))
    expected_intents = login_commit == :before_cut ? 2 : 1
    assert_equal expected_intents, @admin.exec_params("SELECT count(*) FROM app_auth.revocation_intents WHERE cookie_digest IN ($1, $2)", [@digest, concurrent]).getvalue(0, 0).to_i
  end

  def session_state(digest)
    @admin.exec_params("SELECT state FROM app_auth.sessions WHERE cookie_digest = $1", [digest]).getvalue(0, 0)
  end
end
