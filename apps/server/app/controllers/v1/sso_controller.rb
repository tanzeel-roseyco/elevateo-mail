# frozen_string_literal: true

require_relative "../../../lib/elevateo/google_sso"
require_relative "../../../lib/elevateo/auth_callback_redaction"

module V1
  class SsoController < AuthController
    def status
      api_query
      api_json(sso.status, limit: 1024)
    end

    def start
      api_query
      issued = sso.start
      # AIDEV-NOTE: Lax permits the external top-level callback; normal app session remains Strict.
      response.set_cookie("elevateo_sso", value: issued.fetch(:cookie), path: "/v1/auth/sso", httponly: true,
        same_site: :lax, secure: auth_config.cookie_secure, max_age: 300)
      response.headers["Referrer-Policy"] = "no-referrer"
      redirect_browser(issued.fetch(:location))
    end

    def callback
      response.headers["Referrer-Policy"] = "no-referrer"
      response.delete_cookie("elevateo_sso", path: "/v1/auth/sso", httponly: true,
        same_site: :lax, secure: auth_config.cookie_secure)
      raw = request.get_header(Elevateo::AuthCallbackRedaction::QUERY_KEY)
      raise Elevateo::AuthError.invalid unless raw.is_a?(String)
      result = sso.complete(raw_query: raw, cookie: request.cookies["elevateo_sso"],
        caller_cookie: session_cookie, deadline: api_deadline)
      set_auth_cookie("elevateo_session", result.cookie, max_age: 43_200) if result.cookie
      clear_auth_cookie("elevateo_challenge")
      redirect_browser(auth_config.browser_origin + "/")
    rescue Elevateo::AuthError => error
      reason = error.status == 503 ? "unavailable" : (error.status == 401 ? "access_denied" : "invalid_response")
      redirect_browser(auth_config.browser_origin + "/?sso_error=" + reason)
    end

    protected

    def redirect_browser(location)
      response.headers["Location"] = location
      head :see_other
    end

    def sso = Elevateo::GoogleSso.new(sessions: sessions, config: auth_config)
  end
end
