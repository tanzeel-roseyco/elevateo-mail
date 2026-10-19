# frozen_string_literal: true

require "base64"
require "openssl"
require "json"
require "time"

module Elevateo
  module ResendEvents
    class Invalid < StandardError; end

    # AIDEV-NOTE: Svix signs exact bytes; never parse/re-serialize before authentication.
    class Signature
      MAX_BODY = 262_144
      UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      def initialize(secret:)
        raise Invalid, "invalid signing configuration" unless secret.start_with?("whsec_") && secret.bytesize <= 256

        @key = Base64.strict_decode64(secret.delete_prefix("whsec_"))
        raise Invalid, "invalid signing configuration" unless @key.bytesize.between?(16, 128)
      rescue ArgumentError
        raise Invalid, "invalid signing configuration"
      end

      def inspect = "#<Elevateo::ResendEvents::Signature redacted>"
      alias to_s inspect

      def verify(body:, id:, timestamp:, signatures:, now: Time.now.to_i)
        raise Invalid, "invalid webhook" unless body.bytesize.between?(1, MAX_BODY) &&
          /\Amsg_[A-Za-z0-9_-]{1,120}\z/.match?(id) && /\A[0-9]{1,12}\z/.match?(timestamp) &&
          signatures.bytesize.between?(1, 1024) && (now - timestamp.to_i).abs <= 300

        expected = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", @key, "#{id}.#{timestamp}.#{body}"))
        valid = signatures.split(" ").any? do |part|
          version, value = part.split(",", 2)
          version == "v1" && value && value.bytesize == expected.bytesize &&
            OpenSSL.fixed_length_secure_compare(value, expected)
        end
        raise Invalid, "invalid webhook" unless valid

        # @type var event: value
        event = JSON.parse(body, max_nesting: 16)
        raise Invalid, "invalid webhook" unless event.is_a?(Hash) && event["type"].is_a?(String) &&
          /\Aemail\.[a-z_]{1,40}\z/.match?(event["type"]) && event["data"].is_a?(Hash)
        data = event.fetch("data")
        raise Invalid, "invalid webhook" unless data.is_a?(Hash)
        raise Invalid, "invalid webhook" unless data["email_id"].is_a?(String) && /\A[A-Za-z0-9_-]{1,128}\z/.match?(data["email_id"]) &&
          event["created_at"].is_a?(String) && event["created_at"].bytesize <= 64

        # AIDEV-NOTE: Receiving keys are provider UUIDs; reject malformed values before durable retry ingestion.
        if event["type"] == "email.received"
          raise Invalid, "invalid webhook" unless UUID.match?(data["email_id"])
        end
        occurred = Time.iso8601(event["created_at"])
        raise Invalid, "invalid webhook" unless occurred.year.between?(1, 9999)
        event
      rescue JSON::ParserError, ArgumentError
        raise Invalid, "invalid webhook"
      end
    end
  end
end
