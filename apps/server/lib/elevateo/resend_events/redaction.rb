# frozen_string_literal: true

module Elevateo
  module ResendEvents
    class Redaction
      def initialize(app) = (@app = app)

      # AIDEV-NOTE: Rails logging must not parse or print unverified email bodies; controller consumes bounded raw bytes.
      def call(environment)
        if ["/webhooks/resend", "/v2/provider-events/resend"].include?(environment["PATH_INFO"])
          # @type var empty_parameters: Hash[String, untyped]
          empty_parameters = {}
          environment["action_dispatch.request.request_parameters"] = empty_parameters
          environment["action_dispatch.request.query_parameters"] = empty_parameters
          environment["QUERY_STRING"] = ""
        end
        @app.call(environment)
      end
    end
  end
end
