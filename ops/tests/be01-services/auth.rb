# frozen_string_literal: true

require "cgi"
require_relative "http"

module Be01Services
  class Auth
    def initialize(service_key)
      @key = service_key
      @http = HTTP.new("auth")
    end

    def provision(email, password)
      user = @http.object("POST", "/admin/users", token: @key,
                          body: { email: email, password: password, email_confirm: true })
      Be01Services.expect(user["email"] == email && uuid?(user["id"]), "provisioned identity")
      user.fetch("id")
    end

    def token(email, password, id)
      result = @http.object("POST", "/token?grant_type=password", body: { email: email, password: password })
      access = result.fetch("access_token")
      Be01Services.expect(access.is_a?(String) && !access.empty? && result.dig("user", "id") == id,
                          "password token identity")
      user = @http.object("GET", "/user", token: access)
      Be01Services.expect(user["id"] == id && user["email"] == email, "real token user lookup")
      access
    end

    def identity(id, email)
      Be01Services.expect(uuid?(id), "Auth identity UUID")
      user = @http.object("GET", "/admin/users/#{id}", token: @key)
      Be01Services.expect(user["id"] == id && user["email"] == email, "retained Auth identity")
    end

    def signup_denied(email, password)
      result = @http.object("POST", "/signup", statuses: [422], body: { email: email, password: password })
      Be01Services.expect(result["error_code"] == "signup_disabled", "signup denial reason")
    end

    # AIDEV-NOTE: Only capture local messages; never follow the public callback or log its credential-bearing URL.
    def capture(kind, email)
      Be01Services.expect(%w[invite recovery].include?(kind), "mail kind")
      catcher = HTTP.new("mailpit")
      query = "/api/v1/search?query=#{URI.encode_www_form_component("to:#{email}")}&limit=50"
      before = catcher.object("GET", query).fetch("messages").map { |message| message.fetch("ID") }
      path = kind == "invite" ? "/invite" : "/recover"
      @http.object("POST", path, token: kind == "invite" ? @key : nil, body: { email: email })
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 30
      loop do
        messages = catcher.object("GET", query).fetch("messages")
        messages.reject { |message| before.include?(message.fetch("ID")) }.each do |summary|
          id = summary.fetch("ID")
          Be01Services.expect(uuid?(id), "catcher message UUID")
          message = catcher.object("GET", "/api/v1/message/#{id}")
          next unless message.fetch("To").map { |recipient| recipient.fetch("Address") } == [email]
          content = CGI.unescapeHTML(message.fetch("HTML"))
          urls = content.scan(%r{https?://[^\s<>"']+})
          captured = urls.any? do |url|
            uri = URI.parse(url)
            params = URI.decode_www_form(uri.query.to_s).to_h
            uri.scheme == "http" && uri.host == "localhost" && uri.port == 9999 &&
              uri.path == "/auth/v1/verify" && params["type"] == kind && !params.fetch("token", "").empty?
          end
          return if captured
        end
        Be01Services.expect(Process.clock_gettime(Process::CLOCK_MONOTONIC) < deadline, "#{kind} capture timeout")
        sleep 1
      end
    end

    private

    def uuid?(value)
      value.is_a?(String) && /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/.match?(value)
    end
  end
end
