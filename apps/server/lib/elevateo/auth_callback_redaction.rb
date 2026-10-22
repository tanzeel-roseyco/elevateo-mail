# frozen_string_literal: true

module Elevateo
  class AuthCallbackRedaction
    QUERY_KEY = "elevateo.auth_entry_query"
    def initialize(app) = (@app = app)

    # AIDEV-NOTE: Install before Rails::Rack::Logger; downstream controllers read only this private raw-query slot.
    def call(environment)
      if ["/auth/accept", "/v1/auth/sso/callback"].include?(environment["PATH_INFO"])
        environment[QUERY_KEY] = environment["QUERY_STRING"].to_s
        environment["QUERY_STRING"] = ""
        environment["REQUEST_URI"] = environment["PATH_INFO"]
        environment["ORIGINAL_FULLPATH"] = environment["PATH_INFO"]
      end
      @app.call(environment)
    end
  end
end
