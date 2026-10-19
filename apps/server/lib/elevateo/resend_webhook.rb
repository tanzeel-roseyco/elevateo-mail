# frozen_string_literal: true

require "base64"
require "json"
require "openssl"

module Elevateo
  module ResendWebhook
    class Invalid < StandardError; end

    class Verifier
      TOLERANCE = 300

      def initialize(secret:, clock: -> { Time.now.to_i })
        encoded = secret.to_s.delete_prefix("whsec_")
        @key = Base64.strict_decode64(encoded)
        raise Invalid, "invalid RESEND_WEBHOOK_SECRET" if @key.bytesize < 16 || !secret.to_s.start_with?("whsec_")
        @clock = clock
      rescue ArgumentError
        raise Invalid, "invalid RESEND_WEBHOOK_SECRET", cause: nil
      end

      def verify!(id:, timestamp:, signatures:, body:)
        raise Invalid, "invalid webhook headers" unless id.match?(/\A[A-Za-z0-9_.:-]{1,128}\z/) &&
          timestamp.match?(/\A[0-9]{1,12}\z/) && body.bytesize <= 1_500_000
        observed = Integer(timestamp, 10)
        raise Invalid, "stale webhook" if (@clock.call - observed).abs > TOLERANCE
        digest = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", @key, "#{id}.#{timestamp}.#{body}"))
        candidates = signatures.to_s.split.grep(/\Av1,/).map { |value| value.delete_prefix("v1,") }
        valid = candidates.any? { |candidate| secure_compare(candidate, digest) }
        raise Invalid, "invalid webhook signature" unless valid
        true
      end

      private

      def secure_compare(left, right)
        return false unless left.bytesize == right.bytesize
        OpenSSL.fixed_length_secure_compare(left, right)
      end
    end

    class Handler
      TYPES = %w[email.sent email.delivered email.delivery_delayed email.bounced email.complained email.received].freeze

      def initialize(connection:, binder: nil)
        @connection = connection
        @binder = binder || lambda do |value|
          ActiveRecord::Relation::QueryAttribute.new("resend", value, ActiveRecord::Type::String.new)
        end
      end

      def ingest(id:, body:)
        event = JSON.parse(body, max_nesting: 20)
        raise Invalid, "invalid webhook body" unless event.is_a?(Hash) && event["type"].is_a?(String) &&
          TYPES.include?(event["type"]) && event["data"].is_a?(Hash)
        data = event.fetch("data")
        provider_id = data["email_id"] || data["id"]
        email = Array(data["to"]).first
        raise Invalid, "invalid webhook body" unless provider_id.is_a?(String) &&
          provider_id.match?(/\A[A-Za-z0-9_-]{1,128}\z/) && (email.nil? || email.is_a?(String))
        row = @connection.exec_query("SELECT app.ingest_resend_event($1,$2,$3,$4)::text AS result", "Resend event",
          [bind(id), bind(event.fetch("type")), bind(provider_id), bind(email)]).first
        # AIDEV-NOTE: Database event responses must be present JSON objects before the controller returns success.
        raise Invalid, "invalid event result" unless row
        raw = row.fetch("result")
        raise Invalid, "invalid event result" unless raw.is_a?(String)
        result = JSON.parse(raw)
        raise Invalid, "invalid event result" unless result.is_a?(Hash)
        result
      rescue JSON::ParserError, KeyError, TypeError
        raise Invalid, "invalid webhook body", cause: nil
      end

      private

      def bind(value)
        @binder.call(value)
      end
    end
  end
end
