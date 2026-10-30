# frozen_string_literal: true

require "minitest/autorun"
require "ostruct"
require_relative "../../lib/elevateo/auth_entry"
require_relative "../../lib/elevateo/auth_revocations"
require_relative "../../lib/elevateo/session_challenges"

# AIDEV-NOTE: Fakes exercise Ruby decisions only; they cannot attest pinned Auth, SQL grants, or real SQL races.
module AuthFixtures
  USER = "11111111-1111-4111-8111-111111111111"
  SID = "22222222-2222-4222-8222-222222222222"
  ORG = "33333333-3333-4333-8333-333333333333"
  CONTEXT = "44444444-4444-4444-8444-444444444444"

  def config
    OpenStruct.new(session_key: "k" * 32, browser_origin: "https://app.test", auth_url: "http://auth:9999",
      auth_jwt_issuer: "http://auth:9999", auth_jwt_audience: "authenticated", auth_jwt_algorithm: "HS256",
      auth_password_minimum: 12, cookie_secure: true)
  end

  def jwt(overrides = {})
    header = Base64.urlsafe_encode64(JSON.generate({ "alg" => "HS256", "typ" => "JWT" }), padding: false)
    payload = { "sub" => USER, "session_id" => SID, "iss" => config.auth_jwt_issuer,
      "aud" => "authenticated", "exp" => Time.now.to_i + 3600 }.merge(overrides)
    [header, Base64.urlsafe_encode64(JSON.generate(payload), padding: false),
      Base64.urlsafe_encode64("s" * 32, padding: false)].join(".")
  end

  def metadata
    { "status" => "ok", "user_id" => USER, "auth_session_id" => SID, "organization_id" => ORG,
      "organization_name" => "Test org", "context_id" => CONTEXT, "csrf_token" => "x" * 43,
      "authorization_generation" => 1, "refresh_generation" => 0,
      "access_expires_at" => (Time.now + 3600).utc.iso8601 }
  end

  def deadline = Elevateo::RequestDeadline.new
  def assert_auth(status, &block) = assert_equal(status, assert_raises(Elevateo::AuthError, &block).status)

  class Client
    attr_accessor :refresh_gate, :failure, :password_failure
    attr_reader :calls
    def initialize(token, user)
      @token, @user, @calls = token, user, []
    end
    def response = { "access_token" => @token, "refresh_token" => "new-refresh", "token_type" => "bearer",
      "expires_in" => 3600, "user" => { "id" => @user } }
    def login(_email, _password, deadline:)
      @calls << :login
      raise @failure if @failure
      response
    end
    def refresh(_token, deadline:)
      @calls << :refresh
      @refresh_gate.call if @refresh_gate
      raise @failure if @failure
      response
    end
    def user(_access, deadline:)
      @calls << :user
      raise @failure if @failure
      { "id" => @user, "user_metadata" => { "display_name" => "Test" } }
    end
    def verify(_token, _kind, deadline:)
      @calls << :verify
      raise @failure if @failure
      response
    end
    def password(_access, _password, deadline:)
      @calls << :password
      raise @password_failure if @password_failure
      { "id" => @user }
    end
    def recover(_email, deadline:) = (@calls << :recover; true)
    def logout(_token, _scope, deadline:) = (@calls << :logout; true)
  end

  class Store
    attr_reader :calls, :state
    attr_accessor :row
    def initialize(row, crypto, access)
      @row, @crypto, @access = row, crypto, access
      @calls, @state, @mutex = [], {}, Mutex.new
      @row["access_token_ciphertext"] = @crypto.encrypt(access, purpose: "access")
    end

    def call(name, args, deadline:, connection: nil)
      deadline.check!
      @mutex.synchronize do
        @calls << [name, args]
        case name
        when "resolve_session", "authorize_session", "touch_session"
          @state[:revoked] ? { "status" => "unauthorized" } : @row.dup
        when "claim_refresh"
          return { "status" => "unauthorized" } if @state[:revoked]
          return { "status" => "temporarily_unavailable" } if @state[:refresh_claim]
          @state[:refresh_claim] = args[1]
          @row.merge("claim_id" => args[1], "refresh_token_ciphertext" => @crypto.encrypt("refresh", purpose: "refresh"))
        when "publish_refresh"
          return { "status" => "unauthorized" } if @state[:revoked] || @state[:refresh_claim] != args[1]
          @state.delete(:refresh_claim)
          @row["refresh_generation"] += 1
          @row.dup
        when "fail_refresh", "revoke_session"
          @state[:revoked] = true
          { "status" => "ok", "upstream_revocation_pending" => true }
        when "create_session"
          @state.delete(:revoked)
          @row.merge("session_created" => true)
        when "switch_organization"
          return { "status" => "context_changed" } unless args[6] == @row["context_id"] &&
            args[7] == @row["authorization_generation"]
          @row.merge!("organization_id" => args[3], "context_id" => args[4], "csrf_token" => args[5])
          @row.dup
        when "stage_entry"
          @state[:entry] = { "step" => "verify", "kind" => args[1], "token_ciphertext" => args[2] }
          { "status" => "ok", "expires_at" => (Time.now + 600).utc.iso8601 }
        when "claim_entry"
          return { "status" => "unauthorized" } if @state[:uncertain] || @state[:consumed]
          return { "status" => "temporarily_unavailable" } if @state[:entry_claim]
          @state[:entry_claim] = args[1]
          (@state[:entry] || {}).merge("status" => "ok")
        when "verify_entry"
          @state[:entry] = { "step" => "password", "user_id" => args[2], "auth_session_id" => args[3],
            "access_token_ciphertext" => args[4], "refresh_token_ciphertext" => args[5], "access_expires_at" => args[6] }
          { "status" => "ok" }
        when "fail_entry"
          @state.delete(:entry_claim)
          @state[:uncertain] = true unless args[2]
          { "status" => "ok" }
        when "complete_entry"
          @state[:consumed] = true
          @row.merge("session_created" => true)
        when "consume_entry_limits" then { "status" => "ok" }
        else raise "Unexpected fake DB call #{name}"
        end
      end
    end
  end

  def harness(token: jwt)
    crypto = Elevateo::SessionCrypto.new(config: config)
    store, client = Store.new(metadata, crypto, token), Client.new(token, USER)
    service = Elevateo::Sessions.new(config: config, store: store, client: client, crypto: crypto)
    [service, store, client, crypto.cookie]
  end
end
