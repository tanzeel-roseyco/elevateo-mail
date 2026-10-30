# frozen_string_literal: true

require "time"
require_relative "auth_input"
require_relative "session_crypto"

module Elevateo
  class SessionChallenges
    def initialize(config:, crypto:, clock: -> { Time.now })
      @config, @crypto, @clock = config, crypto, clock
    end

    def issue(session_cookie:, pending_cookie:)
      expiry = @clock.call.to_i + 300
      proof = @crypto.cookie
      payload = [expiry, proof, @crypto.binding(session_cookie), @crypto.binding(pending_cookie)].join(":")
      { cookie: "#{payload}.#{@crypto.sign(payload, purpose: 'challenge')}",
        body: { "csrf_token" => proof, "expires_at" => Time.at(expiry).utc.iso8601 } }
    end

    def origin!(origin)
      raise AuthError.invalid unless origin == @config.browser_origin
    end

    # AIDEV-NOTE: Binding both cookies stops a staged invitation or replacement login crossing browser principals.
    def verify!(cookie:, proof:, origin:, session_cookie:, pending_cookie:)
      origin!(origin)
      raise AuthError.invalid unless cookie.is_a?(String) && cookie.bytesize <= 512 && proof.is_a?(String)
      payload, signature, extra = cookie.split(".", 3)
      raise AuthError.invalid unless payload && signature && extra.nil?
      raise AuthError.invalid unless @crypto.equal?(@crypto.sign(payload, purpose: "challenge"), signature)
      expiry, nonce, session, pending, remainder = payload.split(":", 5)
      now = @clock.call.to_i
      raise AuthError.invalid unless expiry && /\A[0-9]{1,12}\z/.match?(expiry) && remainder.nil?
      raise AuthError.invalid unless expiry.to_i.between?(now + 1, now + 300) && @crypto.equal?(nonce, proof)
      raise AuthError.invalid unless @crypto.equal?(session, @crypto.binding(session_cookie)) &&
        @crypto.equal?(pending, @crypto.binding(pending_cookie))
      true
    end
  end
end
