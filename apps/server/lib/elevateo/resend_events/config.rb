# frozen_string_literal: true

require_relative "signature"

module Elevateo
  module ResendEvents
    # AIDEV-NOTE: Event intake is opt-in and independent of outbound release; no secret means disabled.
    class Config
      attr_reader :signature
      def self.current
        @current ||= new(ENV.to_h)
      end

      def initialize(env)
        secret = env["ELEVATEO_RESEND_WEBHOOK_SECRET"] || env["RESEND_WEBHOOK_SECRET"]
        @signature = secret.nil? || secret.empty? ? nil : Signature.new(secret: secret)
      end
    end
  end
end
