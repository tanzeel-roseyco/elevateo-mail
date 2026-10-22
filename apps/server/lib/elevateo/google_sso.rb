# frozen_string_literal: true

require_relative "sessions"

module Elevateo
  class GoogleSso
    CALLBACK = "/v1/auth/sso/callback"
    def initialize(sessions:, config: Config.current, clock: -> { Time.now.to_i })
      @sessions, @config, @clock = sessions, config, clock
    end

    def status
      { "enabled" => @config.sso_enabled, "provider" => "google", "password_login_enabled" => !@config.sso_only }
    end

    # AIDEV-NOTE: Auth owns Google's OIDC nonce; this browser's encrypted verifier binds the app PKCE exchange.
    def start
      public_url = @config.auth_public_url
      raise AuthError.new unless @config.sso_enabled && public_url.is_a?(String)
      verifier, state = @sessions.crypto.cookie, @sessions.crypto.cookie
      callback = @config.browser_origin + CALLBACK + "?state=" + state
      query = URI.encode_www_form("provider" => "google", "scopes" => "openid", "redirect_to" => callback,
        "code_challenge" => Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false),
        "code_challenge_method" => "s256")
      payload = JSON.generate({ "verifier" => verifier, "state" => state, "expires" => @clock.call + 300 })
      { cookie: @sessions.crypto.encrypt(payload, purpose: "google-sso"),
        location: public_url + "/authorize?" + query }
    end

    def complete(raw_query:, cookie:, caller_cookie:, deadline:)
      raise AuthError.new unless @config.sso_enabled
      query = AuthInput.query(raw_query, allowed: %w[code state error error_code error_description])
      raise AuthError.unauthorized if query.key?("error")
      raise AuthError.invalid unless cookie.is_a?(String) && cookie.bytesize <= 2048
      flow = AuthInput.object(@sessions.crypto.decrypt(cookie, purpose: "google-sso"), maximum: 1024)
      verifier, state, expiry = flow.values_at("verifier", "state", "expires")
      raise AuthError.invalid unless verifier.is_a?(String) && SessionCrypto::COOKIE.match?(verifier) &&
        state.is_a?(String) && @sessions.crypto.equal?(state, query["state"]) &&
        expiry.is_a?(Integer) && expiry > @clock.call && expiry <= @clock.call + 300
      code = query["code"]
      raise AuthError.invalid unless code.is_a?(String) && /\A[A-Za-z0-9_-]{1,2048}\z/.match?(code)
      # AIDEV-NOTE: Supabase consumes auth_code once; concurrent/replayed callbacks cannot create another session.
      response = @sessions.client.exchange_code(code, verifier, deadline: deadline)
      credentials = @sessions.tokens.verified(response, client: @sessions.client, deadline: deadline)
      result = @sessions.establish(credentials, caller_cookie: caller_cookie, deadline: deadline)
      unless result.metadata["status"] == "ok"
        @sessions.replace_caller(result.cookie, deadline)
        raise AuthError.unauthorized
      end
      result
    end
  end
end
