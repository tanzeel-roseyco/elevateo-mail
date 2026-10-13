# frozen_string_literal: true

require "json"
require "net/http"
require "uri"

module Be01Services
  class Failure < StandardError; end
  def self.expect(condition, label)
    raise Failure, label unless condition
  end

  # AIDEV-NOTE: Private DNS only; no proxy, redirects, automatic retries or response bodies in errors.
  class HTTP
    PORTS = { "auth" => 9999, "storage" => 5000, "mailpit" => 8025 }.freeze
    LIMIT = 1_048_576

    def initialize(host)
      @host = host
      @port = PORTS.fetch(host)
    end

    def request(method, path, token: nil, body: nil, json: true)
      Be01Services.expect(path.start_with?("/") && !path.start_with?("//") && !path.match?(/[\r\n]/), "HTTP path")
      klass = { "GET" => Net::HTTP::Get, "POST" => Net::HTTP::Post }.fetch(method)
      req = klass.new(path)
      req["Authorization"] = "Bearer #{token}" if token
      req["Content-Type"] = json ? "application/json" : "application/octet-stream"
      req.body = json ? JSON.generate(body) : body if body
      http = Net::HTTP.new(@host, @port, nil)
      http.open_timeout = 3
      http.read_timeout = 5
      http.write_timeout = 5
      http.max_retries = 0
      content = +""
      status = nil
      http.start do |session|
        session.request(req) do |response|
          status = response.code.to_i
          response.read_body do |chunk|
            content << chunk
            Be01Services.expect(content.bytesize <= LIMIT, "HTTP response limit")
          end
        end
      end
      [status, content]
    end

    def object(method, path, statuses: [200], **options)
      status, body = request(method, path, **options)
      Be01Services.expect(statuses.include?(status), "#{@host} #{method} status #{status}")
      parsed = JSON.parse(body)
      Be01Services.expect(parsed.is_a?(Hash), "JSON object required")
      parsed
    rescue JSON::ParserError
      raise Failure, "invalid JSON response"
    end
  end
end
