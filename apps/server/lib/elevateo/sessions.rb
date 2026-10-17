# frozen_string_literal: true

require_relative "config"
require_relative "auth_client"
require_relative "auth_tokens"
require_relative "session_crypto"
require_relative "session_presentation"

module Elevateo
  class Sessions
    attr_reader :store, :client, :crypto, :tokens, :presentation
    def initialize(config: Config.current, store: SessionStore.new, client: nil, crypto: nil)
      @config, @store = config, store
      @client, @crypto = client || AuthClient.new(config: config), crypto || SessionCrypto.new(config: config)
      @tokens = AuthTokens.new(config: config)
      # AIDEV-NOTE: Installation mode informs labels; each send review still determines its own transport authority.
      @presentation = SessionPresentation.new(crypto: @crypto, simulation_mode: config.mode != "resend")
    end

    def authenticate(cookie:, deadline:)
      digest = @crypto.digest(cookie)
      metadata = checked("resolve_session", [digest], deadline)
      access = @crypto.decrypt(string(metadata, "access_token_ciphertext"), purpose: "access")
      @tokens.claims(access)
      user = @client.user(access, deadline: deadline)
      parsed = @tokens.identity(access, user, expected_user: string(metadata, "user_id"),
        expected_session: string(metadata, "auth_session_id"))
      name = user["user_metadata"]
      name = name.is_a?(Hash) ? name["display_name"] : nil
      name = nil unless name.is_a?(String) && name.length <= 256
      SessionIdentity.new(user_id: parsed.user_id, org_id: string(metadata, "organization_id"),
        auth_session_id: parsed.auth_session_id, digest: digest, display_name: name, metadata: metadata)
    end

    # AIDEV-NOTE: DB denial wins; the canonical org must match the principal that already scoped the read snapshot.
    def authorize(identity, context:, version:, deadline:, connection:)
      metadata = @store.call("authorize_session", [identity.digest, identity.user_id, identity.auth_session_id, nil, nil],
        deadline: deadline, connection: connection)
      SessionStore.check!(metadata)
      # AIDEV-NOTE: Bootstrap omits context hints, so a concurrent switch still needs this independent tenant fence.
      raise AuthError.new("context_changed", status: 409) unless string(metadata, "organization_id") == identity.org_id
      @presentation.check_context!(metadata, context, version)
      @presentation.session(metadata, display_name: identity.display_name)
    end

    def touch(identity, deadline:)
      checked("touch_session", [identity.digest, identity.user_id, identity.auth_session_id], deadline)
    end

    def limits!(email, source_ip, deadline:)
      # Hashes are keyed to make the small normalized-email space harder to enumerate from a leaked rate table.
      checked("consume_entry_limits", [Digest::SHA256.hexdigest(@crypto.sign(email, purpose: "rate-email")),
        Digest::SHA256.hexdigest(@crypto.sign(AuthInput.ip(source_ip), purpose: "rate-ip"))], deadline)
    end

    def login(email:, password:, source_ip:, caller_cookie:, deadline:)
      email, password = AuthInput.email(email), AuthInput.password(password)
      limits!(email, source_ip, deadline: deadline)
      credentials = @tokens.verified(@client.login(email, password, deadline: deadline), client: @client, deadline: deadline)
      replace_caller(caller_cookie, deadline)
      cookie = @crypto.cookie
      metadata = @store.call("create_session", [@crypto.digest(cookie), credentials.user_id, credentials.auth_session_id,
        @crypto.encrypt(credentials.access, purpose: "access"), @crypto.encrypt(credentials.refresh, purpose: "refresh"),
        credentials.expires_at.iso8601, SecureRandom.uuid, @crypto.cookie], deadline: deadline)
      creation_result(cookie, metadata, credentials)
    end

    def recovery(email:, source_ip:, deadline:)
      email = AuthInput.email(email)
      limits!(email, source_ip, deadline: deadline)
      @client.recover(email, deadline: deadline)
    end

    def refresh(cookie:, deadline:)
      raise AuthError.unauthorized unless cookie.is_a?(String)
      digest, claim = @crypto.digest(cookie), SecureRandom.uuid
      owned = checked("claim_refresh", [digest, claim], deadline)
      generation = owned["refresh_generation"]
      raise AuthError.new unless generation.is_a?(Integer) && generation >= 0
      begin
        token = @crypto.decrypt(string(owned, "refresh_token_ciphertext"), purpose: "refresh")
        credentials = @tokens.verified(@client.refresh(token, deadline: deadline), client: @client, deadline: deadline,
          expected_user: string(owned, "user_id"), expected_session: string(owned, "auth_session_id"))
        metadata = @store.call("publish_refresh", [digest, claim, generation, credentials.user_id,
          credentials.auth_session_id, @crypto.encrypt(credentials.access, purpose: "access"),
          @crypto.encrypt(credentials.refresh, purpose: "refresh"), credentials.expires_at.iso8601], deadline: deadline)
      rescue AuthError
        # AIDEV-NOTE: Failure is terminal; an exhausted request leaves the durable claim to expire closed.
        @store.call("fail_refresh", [digest, claim, generation], deadline: deadline)
        raise
      end
      creation_result(cookie, metadata, credentials)
    end

    def logout_csrf!(cookie:, proof:, deadline:)
      # AIDEV-NOTE: Logout proves browser intent against local state; Auth outage must not block local revocation.
      metadata = checked("resolve_session", [@crypto.digest(cookie)], deadline)
      raise AuthError.invalid unless @crypto.equal?(proof, metadata["csrf_token"])
      true
    end

    def logout(cookie:, scope:, deadline:)
      raise AuthError.invalid unless %w[local global].include?(scope)
      unless cookie.is_a?(String) && SessionCrypto::COOKIE.match?(cookie)
        raise AuthError.unauthorized if scope == "global"
        return { "local_revoked" => true, "upstream_status" => "complete" }
      end
      result = @store.call("revoke_session", [@crypto.digest(cookie), scope], deadline: deadline)
      return { "local_revoked" => true, "upstream_status" => "complete" } if scope == "local" && result["status"] == "unauthorized"
      SessionStore.check!(result)
      { "local_revoked" => true, "upstream_status" => result["upstream_revocation_pending"] == false ? "complete" : "pending" }
    end

    def switch(identity, organization_id:, context:, version:, csrf:, deadline:)
      organization = AuthInput.uuid(organization_id)
      metadata = checked("authorize_session", [identity.digest, identity.user_id, identity.auth_session_id, nil, nil], deadline)
      @presentation.check_context!(metadata, context, version)
      raise AuthError.invalid unless @crypto.equal?(csrf, metadata["csrf_token"])
      # AIDEV-NOTE: Carry DB generation/context into the locked CAS; two valid old-context requests cannot both switch.
      generation = metadata["authorization_generation"]
      raise AuthError.new unless generation.is_a?(Integer) && generation >= 0
      metadata = checked("switch_organization", [identity.digest, identity.user_id, identity.auth_session_id,
        organization, SecureRandom.uuid, @crypto.cookie, context, generation], deadline)
      SessionResult.new(cookie: nil, metadata: metadata,
        expires_at: Time.iso8601(string(identity.metadata, "access_expires_at")), display_name: identity.display_name)
    end

    def creation_result(cookie, metadata, credentials)
      unless metadata["status"] == "not_found" && metadata["session_created"] == true
        SessionStore.check!(metadata)
      end
      SessionResult.new(cookie: cookie, metadata: metadata, expires_at: credentials.expires_at,
        display_name: credentials.display_name)
    end

    def replace_caller(cookie, deadline)
      return unless cookie.is_a?(String) && SessionCrypto::COOKIE.match?(cookie)
      result = @store.call("revoke_session", [@crypto.digest(cookie), "local"], deadline: deadline)
      SessionStore.check!(result) unless result["status"] == "unauthorized"
    end

    def checked(name, arguments, deadline) = SessionStore.check!(@store.call(name, arguments, deadline: deadline))
    def string(metadata, key) = @presentation.required(metadata, key)
  end
end
