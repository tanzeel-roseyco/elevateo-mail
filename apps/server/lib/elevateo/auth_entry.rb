# frozen_string_literal: true

require_relative "sessions"

module Elevateo
  class AuthEntry
    def initialize(sessions:, config: Config.current)
      @sessions, @config = sessions, config
      @store, @client, @crypto, @tokens = sessions.store, sessions.client, sessions.crypto, sessions.tokens
    end

    # AIDEV-NOTE: A scanner may follow GET; only encrypted staging occurs until a challenge-protected explicit POST.
    def stage(raw_query:, deadline:)
      values = AuthInput.query(raw_query, allowed: %w[token type redirect_to])
      token, kind = values.values_at("token", "type")
      raise AuthError.invalid unless token.is_a?(String) && token.bytesize.between?(1, 2048) &&
        /\A[A-Za-z0-9_-]+\z/.match?(token) && %w[invite recovery].include?(kind)
      if values.key?("redirect_to") && values["redirect_to"] != @config.browser_origin + "/auth/complete"
        raise AuthError.invalid
      end
      cookie = @crypto.cookie
      metadata = @sessions.checked("stage_entry", [@crypto.digest(cookie), kind,
        @crypto.encrypt(token, purpose: "entry")], deadline)
      { cookie: cookie, expires_at: Time.iso8601(@sessions.string(metadata, "expires_at")), location: "/auth/complete" }
    rescue ArgumentError
      raise AuthError.new
    end

    def accept(pending_cookie:, password:, caller_cookie:, deadline:)
      raise AuthError.unauthorized if @config.sso_only
      password = AuthInput.password(password, minimum: @config.auth_password_minimum)
      digest, claim = @crypto.digest(pending_cookie), SecureRandom.uuid
      owned = @sessions.checked("claim_entry", [digest, claim], deadline)
      begin
        credentials = entry_credentials(owned, digest, claim, deadline)
        @client.password(credentials.access, password, deadline: deadline)
        # AIDEV-NOTE: Local access requires password success and fresh trusted identity, never verification alone.
        @tokens.identity(credentials.access, @client.user(credentials.access, deadline: deadline),
          expected_user: credentials.user_id, expected_session: credentials.auth_session_id)
        @sessions.replace_caller(caller_cookie, deadline)
        cookie = @crypto.cookie
        metadata = @store.call("complete_entry", [digest, claim, @crypto.digest(cookie), SecureRandom.uuid,
          @crypto.cookie], deadline: deadline)
      rescue AuthClient::PasswordRejected
        @store.call("fail_entry", [digest, claim, true], deadline: deadline)
        raise
      rescue AuthError
        # AIDEV-NOTE: Ambiguous verify cannot be replayed; uncertainty permanently closes this claim and link stage.
        @store.call("fail_entry", [digest, claim, false], deadline: deadline)
        raise
      end
      @sessions.creation_result(cookie, metadata, credentials)
    end

    private

    def entry_credentials(owned, digest, claim, deadline)
      case owned["step"]
      when "verify"
        token = @crypto.decrypt(@sessions.string(owned, "token_ciphertext"), purpose: "entry")
        response = @client.verify(token, @sessions.string(owned, "kind"), deadline: deadline)
        credentials = @tokens.verified(response, client: @client, deadline: deadline)
        @sessions.checked("verify_entry", [digest, claim, credentials.user_id, credentials.auth_session_id,
          @crypto.encrypt(credentials.access, purpose: "access"), @crypto.encrypt(credentials.refresh, purpose: "refresh"),
          credentials.expires_at.iso8601], deadline)
        credentials
      when "password"
        access = @crypto.decrypt(@sessions.string(owned, "access_token_ciphertext"), purpose: "access")
        refresh = @crypto.decrypt(@sessions.string(owned, "refresh_token_ciphertext"), purpose: "refresh")
        @tokens.stored(access: access, refresh: refresh, client: @client, deadline: deadline,
          expected_user: @sessions.string(owned, "user_id"),
          expected_session: @sessions.string(owned, "auth_session_id"))
      else
        raise AuthError.new
      end
    end
  end
end
