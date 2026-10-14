# frozen_string_literal: true

require_relative "auth_test_helper"
require_relative "../../lib/elevateo/auth_callback_redaction"

class AuthEntryTest < Minitest::Test
  include AuthFixtures

  def staged
    service, store, client, cookie = harness
    entry = Elevateo::AuthEntry.new(sessions: service, config: config)
    result = entry.stage(raw_query: "token=link_hash&type=invite", deadline: deadline)
    [entry, store, client, cookie, result[:cookie]]
  end

  def test_get_stages_encrypted_hash_without_verification_and_has_fixed_redirect
    service, store, client, _cookie = harness
    entry = Elevateo::AuthEntry.new(sessions: service, config: config)
    result = entry.stage(raw_query: "token=link_hash&type=recovery", deadline: deadline)
    assert_equal "/auth/complete", result[:location]
    assert_empty client.calls
    assert_equal ["stage_entry"], store.calls.map(&:first)
    refute_includes store.calls.first.last, "link_hash"
    assert_equal "link_hash", service.crypto.decrypt(store.calls.first.last.last, purpose: "entry")
    assert_auth(400) { entry.stage(raw_query: "token=a&type=invite&redirect_to=https%3A%2F%2Fevil.test", deadline: deadline) }
    assert_auth(400) { entry.stage(raw_query: "token=a&token=b&type=invite", deadline: deadline) }
  end

  def test_callback_query_is_removed_before_downstream_logging
    environment = { "PATH_INFO" => "/auth/accept", "QUERY_STRING" => "token=secret&type=invite",
      "REQUEST_URI" => "/auth/accept?token=secret&type=invite" }
    seen = nil
    middleware = Elevateo::AuthCallbackRedaction.new(->(env) { seen = env.dup; [303, {}, []] })
    middleware.call(environment)
    assert_equal "", seen["QUERY_STRING"]
    assert_equal "/auth/accept", seen["REQUEST_URI"]
    assert_equal "token=secret&type=invite", seen[Elevateo::AuthCallbackRedaction::QUERY_KEY]
  end

  def test_accept_sets_password_before_local_session_and_cannot_replay
    entry, store, client, cookie, pending = staged
    result = entry.accept(pending_cookie: pending, password: "strong password", caller_cookie: cookie, deadline: deadline)
    assert_match Elevateo::SessionCrypto::COOKIE, result.cookie
    assert_equal [:verify, :user, :password, :user], client.calls
    names = store.calls.map(&:first)
    assert_operator names.index("verify_entry"), :<, names.index("complete_entry")
    assert_auth(401) { entry.accept(pending_cookie: pending, password: "strong password", caller_cookie: cookie, deadline: deadline) }
    assert_equal 1, client.calls.count(:verify)
  end

  def test_ambiguous_verify_is_terminal_and_cannot_be_retried
    entry, store, client, cookie, pending = staged
    client.failure = Elevateo::AuthError.new
    assert_auth(503) { entry.accept(pending_cookie: pending, password: "strong password", caller_cookie: cookie, deadline: deadline) }
    assert store.state[:uncertain]
    client.failure = nil
    assert_auth(401) { entry.accept(pending_cookie: pending, password: "strong password", caller_cookie: cookie, deadline: deadline) }
    assert_equal [:verify], client.calls
    refute(store.calls.any? { |name, _| name == "complete_entry" })
  end

  def test_known_password_rejection_only_retries_password
    entry, store, client, cookie, pending = staged
    client.password_failure = Elevateo::AuthClient::PasswordRejected.new
    assert_auth(400) { entry.accept(pending_cookie: pending, password: "strong password", caller_cookie: cookie, deadline: deadline) }
    assert_equal "password", store.state[:entry]["step"]
    client.password_failure = nil
    entry.accept(pending_cookie: pending, password: "another password", caller_cookie: cookie, deadline: deadline)
    assert_equal 1, client.calls.count(:verify)
    assert_equal 2, client.calls.count(:password)
  end

  def test_short_password_is_rejected_before_database_or_auth
    entry, store, client, cookie, pending = staged
    before = store.calls.length
    assert_auth(400) { entry.accept(pending_cookie: pending, password: "short", caller_cookie: cookie, deadline: deadline) }
    assert_equal before, store.calls.length
    assert_empty client.calls
  end
end
