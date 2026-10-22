# frozen_string_literal: true

require_relative "auth_test_helper"
require_relative "../../lib/elevateo/google_sso"
require_relative "../../lib/elevateo/auth_callback_redaction"

class GoogleSsoTest < Minitest::Test
  include AuthFixtures

  def config
    super.tap do |value|
      value.sso_enabled = true
      value.sso_only = false
      value.auth_public_url = "https://auth.test"
    end
  end

  def setup
    @service, @store = harness
    @calls, @consumed = [], false
    transport = lambda do |method, path, payload, _access, _timeout|
      @calls << [method, path, payload]
      if path == "/token?grant_type=pkce"
        if @consumed
          [400, "application/json", "{}"]
        else
          @consumed = true
          [200, "application/json", JSON.generate("access_token" => jwt, "refresh_token" => "refresh",
            "token_type" => "bearer", "expires_in" => 3600, "user" => { "id" => USER })]
        end
      else
        [200, "application/json", JSON.generate("id" => USER)]
      end
    end
    @client = Elevateo::AuthClient.new(config: config, transport: transport, transaction_open: -> { false })
    @service = Elevateo::Sessions.new(config: config, store: @store, client: @client)
    @sso = Elevateo::GoogleSso.new(sessions: @service, config: config)
    @issued = @sso.start
    @params = URI.decode_www_form(URI.parse(@issued.fetch(:location)).query).to_h
    @state = URI.decode_www_form(URI.parse(@params.fetch("redirect_to")).query).to_h.fetch("state")
  end

  def complete(state: @state, cookie: @issued.fetch(:cookie), query: nil)
    @sso.complete(raw_query: query || URI.encode_www_form("code" => "auth-code", "state" => state),
      cookie: cookie, caller_cookie: nil, deadline: deadline)
  end

  def test_pkce_happy_path_uses_existing_private_session_and_fixed_callback
    assert_equal "google", @params.fetch("provider")
    assert_equal "openid", @params.fetch("scopes")
    assert_equal "s256", @params.fetch("code_challenge_method")
    assert_equal "https://app.test/v1/auth/sso/callback", @params.fetch("redirect_to").split("?").first
    result = complete
    assert_match Elevateo::SessionCrypto::COOKIE, result.cookie
    assert_equal "ok", result.metadata.fetch("status")
    exchange = @calls.first
    assert_equal "/token?grant_type=pkce", exchange[1]
    verifier = exchange[2].fetch("code_verifier")
    assert_equal @params.fetch("code_challenge"), Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false)
    assert(@store.calls.any? { |name, _| name == "create_session" })
    refute_includes @issued.fetch(:location), verifier
  end

  def test_bad_state_and_missing_cookie_never_contact_auth
    assert_auth(400) { complete(state: "wrong") }
    assert_auth(400) { complete(cookie: nil) }
    assert_empty @calls
    assert_empty @store.calls
  end

  def test_replay_cannot_create_second_session
    complete
    assert_auth(401) { complete }
    assert_equal 1, (@store.calls.count { |name, _| name == "create_session" })
  end

  def test_identity_without_membership_is_revoked_and_denied
    @store.row["status"] = "not_found"
    assert_auth(401) { complete }
    assert(@store.calls.any? { |name, _| name == "revoke_session" })
    assert @store.state[:revoked]
  end

  def test_expired_flow_wrong_cookie_and_duplicate_query_fail_closed
    expired = Elevateo::GoogleSso.new(sessions: @service, config: config, clock: -> { Time.now.to_i + 301 })
    assert_auth(400) do
      expired.complete(raw_query: URI.encode_www_form(code: "auth-code", state: @state),
        cookie: @issued.fetch(:cookie), caller_cookie: nil, deadline: deadline)
    end
    assert_auth(503) { complete(cookie: "tampered") }
    assert_auth(400) { complete(query: "code=a&code=b&state=#{@state}") }
    assert_empty @calls
  end

  def test_disabled_and_password_only_guards_precede_provider_calls
    locked = config.tap { |value| value.sso_only = true; value.sso_enabled = false }
    sso = Elevateo::GoogleSso.new(sessions: @service, config: locked)
    assert_equal false, sso.status.fetch("enabled")
    assert_equal false, sso.status.fetch("password_login_enabled")
    assert_auth(503) { sso.start }
    sessions = Elevateo::Sessions.new(config: locked, store: @store, client: @client)
    assert_auth(401) do
      sessions.login(email: "a@example.test", password: "secret", source_ip: "127.0.0.1",
        caller_cookie: nil, deadline: deadline)
    end
    assert_auth(401) { sessions.recovery(email: "a@example.test", source_ip: "127.0.0.1", deadline: deadline) }
    assert_auth(401) do
      Elevateo::AuthEntry.new(sessions: sessions, config: locked).accept(pending_cookie: nil,
        password: "secret", caller_cookie: nil, deadline: deadline)
    end
    assert_empty @calls
  end

  def test_callback_redacts_secrets_before_downstream_logger
    environment = { "PATH_INFO" => Elevateo::GoogleSso::CALLBACK, "QUERY_STRING" => "code=private&state=secret" }
    Elevateo::AuthCallbackRedaction.new(->(env) { env }).call(environment)
    assert_equal "", environment.fetch("QUERY_STRING")
    assert_equal Elevateo::GoogleSso::CALLBACK, environment.fetch("REQUEST_URI")
    assert_equal "code=private&state=secret", environment.fetch(Elevateo::AuthCallbackRedaction::QUERY_KEY)
  end
end
