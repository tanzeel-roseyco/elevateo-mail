# frozen_string_literal: true

module Elevateo
  class AuthCallbackRedaction
    QUERY_KEY = "elevateo.auth_entry_query"
    def initialize(app) = (@app = app)

    # AIDEV-NOTE: Install before Rails::Rack::Logger; downstream controllers read only this private raw-query slot.
    def call(environment)
      if environment["PATH_INFO"] == "/auth/accept"
        environment[QUERY_KEY] = environment["QUERY_STRING"].to_s
        environment["QUERY_STRING"] = ""
        environment["REQUEST_URI"] = "/auth/accept"
        environment["ORIGINAL_FULLPATH"] = "/auth/accept"
      end
      @app.call(environment)
    end
  end
end
