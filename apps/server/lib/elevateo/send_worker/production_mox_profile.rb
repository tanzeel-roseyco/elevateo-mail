# frozen_string_literal: true

require "json"
require_relative "../config"

module Elevateo
  module SendWorker
    # AIDEV-NOTE: This is a separate production route; fixture profiles cannot opt into external delivery.
    class ProductionMoxProfile
      attr_reader :host, :domains, :credentials_path

      def initialize(env)
        @host = hostname(env["ELEVATEO_MOX_HOST"])
        raw = env["ELEVATEO_MOX_VERIFIED_DOMAINS"]
        raise ConfigError, "verified Mox domains required" unless raw.is_a?(String) && raw.bytesize <= 32768
        begin
          values = JSON.parse(raw)
        rescue JSON::ParserError
          raise ConfigError, "invalid verified Mox domains", cause: nil
        end
        unless values.is_a?(Array) && values.length.between?(1, 120)
          raise ConfigError, "Mox requires 1..120 verified domains"
        end
        @domains = values.map { |value| hostname(value) }.freeze
        raise ConfigError, "duplicate verified Mox domains" unless @domains.uniq.length == @domains.length
        unless @domains.any? { |domain| @host.end_with?(".#{domain}") }
          raise ConfigError, "Mox host must belong to a verified domain"
        end
        path = env["ELEVATEO_MOX_CREDENTIALS_PATH"]
        unless path.is_a?(String) && path.start_with?("/") && path.bytesize.between?(2, 4096) && !path.include?("\0")
          raise ConfigError, "Mox requires an absolute private Bundle path"
        end
        @credentials_path = path.dup.freeze
        freeze
      end

      def port = 587
      def permits_sender?(sender) = @domains.include?(sender.split("@", 2).last)
      def inspect = "#<Elevateo::SendWorker::ProductionMoxProfile redacted>"

      private

      def hostname(value)
        unless value.is_a?(String) && value.bytesize <= 253 && value.split(".", -1).length >= 2 &&
            value.split(".", -1).all? { |label| /\A[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\z/.match?(label) } &&
            /[a-z]/.match?(value.split(".").last) &&
            !%w[test example invalid localhost local onion arpa internal alt].include?(value.split(".").last) &&
            !%w[example.com example.net example.org].any? { |reserved| value == reserved || value.end_with?(".#{reserved}") } &&
            !/\A[0-9.]+\z/.match?(value)
          raise ConfigError, "invalid production Mox hostname"
        end
        value.dup.freeze
      end
    end
  end
end
