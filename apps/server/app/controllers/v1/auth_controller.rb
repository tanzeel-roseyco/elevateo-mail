# frozen_string_literal: true

require_relative "../../../lib/elevateo/sessions"
require_relative "../../../lib/elevateo/session_challenges"
require_relative "../../../lib/elevateo/auth_entry"

module V1
  class AuthController < ApiController
    def challenge
      api_query
      issued = challenges.issue(session_cookie: session_cookie, pending_cookie: pending_cookie)
      set_auth_cookie("elevateo_challenge", issued.fetch(:cookie), max_age: 300)
      api_json(issued.fetch(:body), limit: 1024)
    end

    def login
      input = api_body(required: %w[email password])
      verify_challenge!
      result = sessions.login(email: input["email"], password: input["password"], source_ip: request.remote_ip,
        caller_cookie: session_cookie, deadline: api_deadline)
      lifecycle(result)
    end

    def recovery
      input = api_body(required: %w[email])
      verify_challenge!
      sessions.recovery(email: input["email"], source_ip: request.remote_ip, deadline: api_deadline)
      api_json({ "accepted" => true }, status: 202, limit: 1024)
    end

    def refresh
      api_body(required: [])
      verify_challenge!
      lifecycle(sessions.refresh(cookie: session_cookie, deadline: api_deadline))
    end

    def logout
      input = api_body(required: [], optional: %w[scope])
      scope = input.fetch("scope", "local")
      raise Elevateo::AuthError.invalid unless %w[local global].include?(scope)
      verify_logout!
      result = sessions.logout(cookie: session_cookie, scope: scope, deadline: api_deadline)
      clear_auth_cookie("elevateo_session")
      clear_auth_cookie("elevateo_challenge")
      api_json(result, limit: 1024)
    end

    def accept
      input = api_body(required: %w[password])
      verify_challenge!
      result = Elevateo::AuthEntry.new(sessions: sessions).accept(pending_cookie: pending_cookie,
        password: input["password"], caller_cookie: session_cookie, deadline: api_deadline)
      clear_auth_cookie("elevateo_pending")
      lifecycle(result)
    end

    protected

    def sessions = (@sessions ||= Elevateo::Sessions.new)
    def config = Elevateo::Config.current
    def pending_cookie = request.cookies["elevateo_pending"]
    def challenges = (@challenges ||= Elevateo::SessionChallenges.new(config: config, crypto: sessions.crypto))

    def verify_challenge!
      challenges.verify!(cookie: request.cookies["elevateo_challenge"], proof: request_csrf,
        origin: request.headers["Origin"], session_cookie: session_cookie, pending_cookie: pending_cookie)
    end

    def verify_logout!
      challenges.origin!(request.headers["Origin"])
      if request.cookies["elevateo_challenge"]
        verify_challenge!
      else
        # AIDEV-NOTE: Local CSRF avoids Auth HTTP before revocation; the bound challenge handles local expiry.
        sessions.logout_csrf!(cookie: session_cookie, proof: request_csrf, deadline: api_deadline)
      end
    end

    def lifecycle(result)
      set_auth_cookie("elevateo_session", result.cookie, max_age: 43_200) if result.cookie
      clear_auth_cookie("elevateo_challenge")
      # AIDEV-NOTE: Identity without membership retains the opaque cookie while the public result is generic 404.
      api_json(sessions.presentation.lifecycle(result.metadata, expires_at: result.expires_at,
        display_name: result.display_name))
    end

    def set_auth_cookie(name, value, max_age:)
      response.set_cookie(name, value: value, path: "/", httponly: true, same_site: :strict,
        secure: config.cookie_secure, max_age: max_age)
    end

    def clear_auth_cookie(name)
      response.delete_cookie(name, path: "/", httponly: true, same_site: :strict, secure: config.cookie_secure)
    end
  end
end
