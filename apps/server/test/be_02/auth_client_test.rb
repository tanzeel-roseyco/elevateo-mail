# frozen_string_literal: true

require_relative "auth_test_helper"

class AuthClientTest < Minitest::Test
  include AuthFixtures

  def client(reply, calls: [], transaction: false)
    transport = ->(*args) { calls << args; reply.respond_to?(:call) ? reply.call : reply }
    Elevateo::AuthClient.new(config: config, transport: transport, transaction_open: -> { transaction })
  end

  def test_password_login_uses_fixed_internal_path_and_bounded_timeout
    calls = []
    result = client([200, "application/json", '{"access_token":"ok"}'], calls: calls).login("a@b.test", "pw", deadline: deadline)
    assert_equal "ok", result["access_token"]
    assert_equal [:post, "/token?grant_type=password"], calls.first.first(2)
    assert_operator calls.first.last, :<=, 2.0
    assert_equal 1, calls.length
  end

  def test_redirects_and_transient_failures_never_retry
    [302, 429, 500, 503].each do |status|
      calls = []
      assert_auth(503) { client([status, "application/json", "{}"], calls: calls).refresh("secret", deadline: deadline) }
      assert_equal 1, calls.length
    end
  end

  def test_auth_rejection_is_401_and_recovery_is_generic
    assert_auth(401) { client([401, "application/json", "{}"] ).user("token", deadline: deadline) }
    assert client([422, "application/json", "{}"] ).recover("missing@b.test", deadline: deadline)
  end

  def test_malformed_duplicate_or_oversize_json_is_503
    ["{", '{"id":"x","id":"y"}', "x" * 65_537].each do |body|
      assert_auth(503) { client([200, "application/json", body]).user("token", deadline: deadline) }
    end
  end

  def test_no_http_can_start_with_an_open_transaction
    calls = []
    assert_auth(503) { client([200, "application/json", "{}"], calls: calls, transaction: true).refresh("x", deadline: deadline) }
    assert_empty calls
  end

  def test_timeout_and_known_password_rejection_remain_distinct
    assert_auth(503) { client(-> { raise Net::ReadTimeout }).user("token", deadline: deadline) }
    assert_raises(Elevateo::AuthClient::PasswordRejected) do
      client([422, "application/json", "{}"]).password("access", "new password", deadline: deadline)
    end
  end
end
