# frozen_string_literal: true

require_relative "sessions"

module Elevateo
  class GoogleSso
    CALLBACK = "/v1/auth/sso/callback"
    def initialize(sessions:, config: Config.current, clock: -> { Time.now.to_i })
      @sessions, @config, @clock = sessions, config, clock
    end

    def status
      { "enabled" => @config.sso_enabled, "provider" => @config.sso_provider, "password_login_enabled" => !@config.sso_only }
    end

    # AIDEV-NOTE: GoTrue validates upstream OIDC; encrypted state binds this browser, PKCE and configured provider.
    def start
      public_url = @config.auth_public_url
      raise AuthError.new unless @config.sso_enabled && public_url.is_a?(String)
      verifier, state = @sessions.crypto.cookie, @sessions.crypto.cookie
      callback = @config.browser_origin + CALLBACK + "?state=" + state
      query = URI.encode_www_form("provider" => @config.sso_provider, "scopes" => (@config.sso_provider == "custom:authentik" ? "openid email profile" : "openid"), "redirect_to" => callback,
        "code_challenge" => Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false),
        "code_challenge_method" => "s256")
      payload = JSON.generate({ "verifier" => verifier, "state" => state, "provider" => @config.sso_provider, "expires" => @clock.call + 300 })
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
      raise AuthError.invalid unless flow["provider"] == @config.sso_provider && verifier.is_a?(String) && SessionCrypto::COOKIE.match?(verifier) &&
        state.is_a?(String) && @sessions.crypto.equal?(state, query["state"]) &&
        expiry.is_a?(Integer) && expiry > @clock.call && expiry <= @clock.call + 300
      code = query["code"]
      raise AuthError.invalid unless code.is_a?(String) && /\A[A-Za-z0-9_-]{1,2048}\z/.match?(code)
      # AIDEV-NOTE: Supabase consumes auth_code once; concurrent/replayed callbacks cannot create another session.
      response = @sessions.client.exchange_code(code, verifier, deadline: deadline)
      credentials = @sessions.tokens.verified(response, client: @sessions.client, deadline: deadline)
      if @config.company_signup_enabled
        # AIDEV-NOTE: Trusted Auth tables decide email/provider/tenant; browser claims cannot select roles.
        enrollment = @sessions.store.call("enroll_company_identity",
          [credentials.user_id, credentials.auth_session_id], deadline: deadline)
        SessionStore.check!(enrollment)
      end
      result = @sessions.establish(credentials, caller_cookie: caller_cookie, deadline: deadline)
      unless result.metadata["status"] == "ok"
        @sessions.replace_caller(result.cookie, deadline)
        raise AuthError.unauthorized
      end
      result
    rescue AuthError
      # AIDEV-NOTE: A denied callback still owns newly issued refresh credentials; dispose before returning denial.
      access_token = response["access_token"] if response.is_a?(Hash)
      if access_token.is_a?(String)
        @sessions.client.logout(access_token, "local", deadline: RequestDeadline.new(seconds: 2.0))
      end
      raise
    end
  end
end
