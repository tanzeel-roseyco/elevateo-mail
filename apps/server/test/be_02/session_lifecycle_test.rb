# frozen_string_literal: true

require_relative "auth_test_helper"

class SessionLifecycleTest < Minitest::Test
  include AuthFixtures

  def test_login_attests_identity_encrypts_credentials_and_replaces_caller
    service, store, client, cookie = harness
    result = service.login(email: "TEST@example.test", password: "password", source_ip: "192.0.2.1",
      caller_cookie: cookie, deadline: deadline)
    refute_equal cookie, result.cookie
    assert_equal [:login, :user], client.calls
    names = store.calls.map(&:first)
    assert_operator names.index("revoke_session"), :<, names.index("create_session")
    args = store.calls.find { |name, _args| name == "create_session" }.last
    assert_equal Digest::SHA256.hexdigest(result.cookie), args[0]
    assert_equal client.response["access_token"], service.crypto.decrypt(args[3], purpose: "access")
    refute_includes args, result.cookie
  end

  def test_no_membership_login_retains_cookie_and_returns_generic_404_on_presentation
    service, store, _client, _cookie = harness
    store.row.merge!("status" => "not_found", "organization_id" => nil, "organization_name" => nil)
    result = service.login(email: "test@example.test", password: "password", source_ip: "192.0.2.1",
      caller_cookie: nil, deadline: deadline)
    assert_match Elevateo::SessionCrypto::COOKIE, result.cookie
    assert_auth(404) { service.presentation.lifecycle(result.metadata, expires_at: result.expires_at) }
  end

  def test_two_concurrent_refreshes_make_one_upstream_call
    service, store, client, cookie = harness
    started, release = Queue.new, Queue.new
    client.refresh_gate = -> { started << true; release.pop }
    first = Thread.new { service.refresh(cookie: cookie, deadline: deadline) }
    started.pop
    assert_auth(503) { service.refresh(cookie: cookie, deadline: deadline) }
    release << true
    assert_equal cookie, first.value.cookie
    assert_equal 1, client.calls.count(:refresh)
    assert_equal 1, store.calls.count { |name, _| name == "publish_refresh" }
  ensure
    release << true if release && first&.alive?
    first&.join
  end

  def test_logout_racing_late_refresh_does_not_publish_local_access
    service, _store, client, cookie = harness
    started, release = Queue.new, Queue.new
    client.refresh_gate = -> { started << true; release.pop }
    refresh = Thread.new do
      service.refresh(cookie: cookie, deadline: deadline)
    rescue Elevateo::AuthError => error
      error
    end
    started.pop
    result = service.logout(cookie: cookie, scope: "local", deadline: deadline)
    assert_equal({ "local_revoked" => true, "upstream_status" => "pending" }, result)
    release << true
    assert_equal 401, refresh.value.status
    refute_includes client.calls, :logout
  ensure
    release << true if release && refresh&.alive?
    refresh&.join
  end

  def test_transient_refresh_becomes_terminal_and_never_retries
    service, store, client, cookie = harness
    client.failure = Elevateo::AuthError.new
    assert_auth(503) { service.refresh(cookie: cookie, deadline: deadline) }
    assert store.state[:revoked]
    assert_auth(401) { service.refresh(cookie: cookie, deadline: deadline) }
    assert_equal 1, client.calls.count(:refresh)
  end

  def test_transient_read_does_not_revoke_or_retry
    service, store, client, cookie = harness
    client.failure = Elevateo::AuthError.new
    assert_auth(503) { service.authenticate(cookie: cookie, deadline: deadline) }
    refute store.state[:revoked]
    assert_equal [:user], client.calls
  end

  def test_refresh_does_not_prevalidate_expired_access_token
    service, store, client, cookie = harness
    store.row["access_token_ciphertext"] = service.crypto.encrypt(jwt("exp" => Time.now.to_i - 1), purpose: "access")
    assert_equal cookie, service.refresh(cookie: cookie, deadline: deadline).cookie
    assert_equal [:refresh, :user], client.calls
    refute store.calls.any? { |name, _| name == "resolve_session" }
  end

  def test_local_absent_logout_is_idempotent_and_global_denies
    service, store, _client, _cookie = harness
    assert_equal "complete", service.logout(cookie: nil, scope: "local", deadline: deadline)["upstream_status"]
    assert_auth(401) { service.logout(cookie: nil, scope: "global", deadline: deadline) }
    assert_empty store.calls
  end

  def test_session_csrf_logout_needs_no_auth_http_and_allows_expired_access
    service, store, client, cookie = harness
    client.failure = Elevateo::AuthError.new
    store.row["access_token_ciphertext"] = service.crypto.encrypt(jwt("exp" => Time.now.to_i - 1), purpose: "access")
    assert_auth(400) { service.logout_csrf!(cookie: cookie, proof: "wrong", deadline: deadline) }
    assert service.logout_csrf!(cookie: cookie, proof: metadata["csrf_token"], deadline: deadline)
    assert_equal "pending", service.logout(cookie: cookie, scope: "local", deadline: deadline)["upstream_status"]
    assert_empty client.calls
  end

  def test_switch_supplies_expected_context_generation_and_rejects_old_context
    service, store, _client, cookie = harness
    identity = service.authenticate(cookie: cookie, deadline: deadline)
    version = service.presentation.version(identity.metadata)
    inputs = { organization_id: ORG, context: CONTEXT, version: version, csrf: metadata["csrf_token"] }
    result = service.switch(identity, **inputs, deadline: deadline)
    args = store.calls.find { |name, _| name == "switch_organization" }.last
    assert_equal [CONTEXT, 1], args.last(2)
    refute_equal CONTEXT, result.metadata["context_id"]
    assert_auth(409) { service.switch(identity, **inputs, deadline: deadline) }
    assert_equal 1, store.calls.count { |name, _| name == "switch_organization" }
  end
end
