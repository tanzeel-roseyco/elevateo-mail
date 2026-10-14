# frozen_string_literal: true

require "base64"
require_relative "auth_input"

module Elevateo
  class AuthTokens
    Claims = Data.define(:user_id, :auth_session_id, :expires_at)
    Verified = Data.define(:access, :refresh, :user_id, :auth_session_id, :expires_at, :display_name)
    def initialize(config:, clock: -> { Time.now }) = (@config, @clock = config, clock)

    # AIDEV-NOTE: Decoding is only a policy check; a trusted /user call must attest every accepted access credential.
    def claims(access)
      raise AuthError.new unless access.is_a?(String) && access.bytesize <= 8192
      segments = access.split(".", -1)
      raise AuthError.new unless segments.length == 3 && segments.all? { |part| /\A[A-Za-z0-9_-]+\z/.match?(part) }
      header = AuthInput.object(Base64.urlsafe_decode64(segments.fetch(0)), maximum: 8192)
      payload = AuthInput.object(Base64.urlsafe_decode64(segments.fetch(1)), maximum: 8192)
      raise AuthError.unauthorized unless header["alg"] == @config.auth_jwt_algorithm &&
        payload["iss"] == @config.auth_jwt_issuer && payload["aud"] == @config.auth_jwt_audience
      raise AuthError.new unless Base64.urlsafe_decode64(segments.fetch(2)).bytesize == 32
      user, session, expiry = payload.values_at("sub", "session_id", "exp")
      raise AuthError.unauthorized unless user.is_a?(String) && AuthInput::UUID.match?(user) &&
        session.is_a?(String) && AuthInput::UUID.match?(session)
      raise AuthError.new unless expiry.is_a?(Integer) && expiry.positive? && expiry <= 253_402_300_799
      raise AuthError.unauthorized if expiry <= @clock.call.to_i
      Claims.new(user_id: user.downcase, auth_session_id: session.downcase, expires_at: Time.at(expiry).utc)
    rescue ArgumentError
      raise AuthError.new
    rescue AuthError => error
      raise(error.status == 400 ? AuthError.new : error)
    end

    def identity(access, user, expected_user: nil, expected_session: nil)
      parsed = claims(access)
      raise AuthError.new unless user.is_a?(Hash)
      user_id = user["id"]
      raise AuthError.new unless user_id.is_a?(String) && AuthInput::UUID.match?(user_id)
      raise AuthError.unauthorized unless user_id.downcase == parsed.user_id &&
        (expected_user.nil? || expected_user == parsed.user_id) &&
        (expected_session.nil? || expected_session == parsed.auth_session_id)
      parsed
    end

    def verified(response, client:, deadline:, expected_user: nil, expected_session: nil)
      access, refresh = response.values_at("access_token", "refresh_token")
      raise AuthError.new unless access.is_a?(String) && refresh.is_a?(String) && refresh.bytesize.between?(1, 4096)
      expiry, declared_user = response.values_at("expires_in", "user")
      raise AuthError.new unless response["token_type"] == "bearer" && expiry.is_a?(Integer) &&
        expiry.between?(1, 3600) && declared_user.is_a?(Hash)
      identity(access, declared_user, expected_user: expected_user, expected_session: expected_session)
      stored(access: access, refresh: refresh, client: client, deadline: deadline,
        expected_user: expected_user, expected_session: expected_session)
    end

    # AIDEV-NOTE: Password retries reattest persisted credentials; they never invent or replay a provider response.
    def stored(access:, refresh:, client:, deadline:, expected_user:, expected_session:)
      raise AuthError.new unless refresh.bytesize.between?(1, 4096)
      claims(access)
      user = client.user(access, deadline: deadline)
      parsed = identity(access, user, expected_user: expected_user, expected_session: expected_session)
      metadata = user["user_metadata"]
      name = metadata.is_a?(Hash) ? metadata["display_name"] : nil
      name = nil unless name.is_a?(String) && name.length <= 256 && name.valid_encoding?
      Verified.new(access: access, refresh: refresh, user_id: parsed.user_id,
        auth_session_id: parsed.auth_session_id, expires_at: parsed.expires_at, display_name: name)
    end
  end
end
