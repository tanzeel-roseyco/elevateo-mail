# frozen_string_literal: true

require "openssl"
require "base64"
require "digest"
require "securerandom"
require_relative "auth_error"

module Elevateo
  class SessionCrypto
    COOKIE = /\A[A-Za-z0-9_-]{43}\z/
    def initialize(config:) = (@key = config.session_key)
    def cookie = SecureRandom.urlsafe_base64(32, false)

    def digest(value)
      raise AuthError.unauthorized unless value.is_a?(String) && COOKIE.match?(value)
      Digest::SHA256.hexdigest(value)
    end

    def binding(value) = value.nil? ? "absent" : Digest::SHA256.hexdigest(value)

    # AIDEV-NOTE: Purpose-specific AAD prevents ciphertext from being swapped between access, refresh and entry fields.
    def encrypt(value, purpose:)
      raise AuthError.new unless value.is_a?(String) && value.bytesize.between?(1, 8192)
      cipher = OpenSSL::Cipher.new("aes-256-gcm").encrypt
      cipher.key = @key
      nonce = cipher.random_iv
      cipher.auth_data = "elevateo:v1:#{purpose}"
      encrypted = cipher.update(value) + cipher.final
      Base64.strict_encode64("\x01".b + nonce + cipher.auth_tag + encrypted)
    end

    def decrypt(value, purpose:)
      raise AuthError.new unless value.is_a?(String) && value.bytesize <= 16384
      bytes = Base64.strict_decode64(value)
      raise AuthError.new unless bytes.bytesize >= 30 && bytes.getbyte(0) == 1
      cipher = OpenSSL::Cipher.new("aes-256-gcm").decrypt
      cipher.key = @key
      cipher.iv = (bytes.byteslice(1, 12) || raise(AuthError.new))
      cipher.auth_tag = (bytes.byteslice(13, 16) || raise(AuthError.new))
      cipher.auth_data = "elevateo:v1:#{purpose}"
      cipher.update((bytes.byteslice(29..) || raise(AuthError.new))) + cipher.final
    rescue ArgumentError, OpenSSL::Cipher::CipherError
      raise AuthError.new
    end

    def sign(value, purpose:)
      Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", @key, "#{purpose}\0#{value}"), padding: false)
    end

    def equal?(left, right)
      left.is_a?(String) && right.is_a?(String) && left.bytesize == right.bytesize &&
        OpenSSL.fixed_length_secure_compare(left, right)
    end
  end
end
