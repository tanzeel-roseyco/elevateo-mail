# frozen_string_literal: true

require "base64"
require "json"
require "openssl"

module Elevateo
  # AIDEV-NOTE: Cursor signatures bind a query to current authority; callers must authorize before decoding.
  class Cursors
    class Invalid < StandardError; end

    MAX_BYTES = 2048
    TTL = 300
    SCOPE_KEYS = %w[actor_id organization_id context_id authorization_version resource filters order limit].freeze
    UUID = /\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i
    TOKEN = /\A[A-Za-z0-9_-]{16,256}\z/

    def initialize(secret:, clock: -> { Time.now.to_i })
      raise ArgumentError, "cursor signing key must contain at least 32 bytes" if secret.bytesize < 32

      @secret = secret.dup.freeze
      @clock = clock
    end

    def encode(position:, scope:)
      validate_position(position)
      payload = JSON.generate({ "v" => 1, "scope" => scope_digest(scope),
                                "position" => position, "expires_at" => @clock.call + TTL })
      encoded = Base64.urlsafe_encode64(payload, padding: false)
      token = "#{encoded}.#{signature(encoded)}"
      raise Invalid, "invalid cursor" if token.bytesize > MAX_BYTES

      token
    end

    def decode(token, scope:)
      unless token.is_a?(String) && token.bytesize <= MAX_BYTES && token.ascii_only? &&
             /\A[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}\z/.match?(token)
        raise Invalid, "invalid cursor"
      end
      encoded, supplied = token.split(".", 2)
      raise Invalid, "invalid cursor" unless encoded && supplied
      raise Invalid, "invalid cursor" unless OpenSSL.fixed_length_secure_compare(signature(encoded), supplied)

      # AIDEV-NOTE: Authenticate the bounded bytes before JSON parsing; unauthenticated values never reach SQL.
      value = JSON.parse(Base64.urlsafe_decode64(encoded), max_nesting: 4)
      validate_payload(value, scope)
    rescue JSON::ParserError, ArgumentError
      raise Invalid, "invalid cursor"
    end

    private

    def signature(encoded)
      Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", @secret, "elevateo/read-cursor/v1\0#{encoded}"),
                             padding: false)
    end

    def validate_payload(value, scope)
      unless value.is_a?(Hash) && value.keys.sort == %w[expires_at position scope v] &&
             value["v"].is_a?(Integer) && value["v"] == 1 &&
             value["scope"] == scope_digest(scope)
        raise Invalid, "invalid cursor"
      end
      expiry = value["expires_at"]
      now = @clock.call
      raise Invalid, "invalid cursor" unless expiry.is_a?(Integer) && expiry > now && expiry <= now + TTL

      position = value["position"]
      validate_position(position)
    end

    def scope_digest(scope)
      raise Invalid, "invalid cursor" unless scope.keys.sort == SCOPE_KEYS.sort
      %w[actor_id organization_id].each do |key|
        raise Invalid, "invalid cursor" unless text?(scope[key], 36) && UUID.match?(scope[key].to_s)
      end
      %w[context_id authorization_version].each do |key|
        raise Invalid, "invalid cursor" unless text?(scope[key], 256) && TOKEN.match?(scope[key].to_s)
      end
      %w[resource order].each do |key|
        raise Invalid, "invalid cursor" unless text?(scope[key], 128) && scope[key] != ""
      end
      limit = scope["limit"]
      raise Invalid, "invalid cursor" unless limit.is_a?(Integer) && limit.between?(1, 50)

      filters = scope["filters"]
      unless filters.is_a?(Hash) && filters.size <= 8 &&
             filters.all? { |key, value| text?(key, 32) && (value.nil? || text?(value, 256)) }
        raise Invalid, "invalid cursor"
      end
      # AIDEV-NOTE: Fixed field order plus sorted filters makes equivalent requests independent of Hash insertion order.
      fields = SCOPE_KEYS.map { |key| key == "filters" ? filters.sort : scope.fetch(key) }
      OpenSSL::Digest::SHA256.hexdigest(JSON.generate(fields))
    end

    def validate_position(position)
      raise Invalid, "invalid cursor" unless position.is_a?(Hash) && position.size.between?(1, 4)

      # @type var validated: position
      validated = {}
      position.each do |key, value|
        raise Invalid, "invalid cursor" unless /\A[a-z_]{1,32}\z/.match?(key)
        if value.nil?
          validated[key] = nil
        elsif value.is_a?(String) && text?(value, 256)
          validated[key] = value
        else
          raise Invalid, "invalid cursor"
        end
      end
      validated
    end

    def text?(value, maximum)
      value.is_a?(String) && [Encoding::UTF_8, Encoding::US_ASCII].include?(value.encoding) &&
        value.valid_encoding? && value.length <= maximum
    end
  end
end
