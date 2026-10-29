# frozen_string_literal: true

require "net/http"
require "timeout"

class HealthController < ApplicationController
  def live
    render json: { status: "ok" }
  end

  # AIDEV-NOTE: Only mailpit mode depends on a catcher; held/Resend readiness must not require an unused service.
  def ready
    cfg = Elevateo::Config.current
    checks = {
      database: check { ActiveRecord::Base.connection.select_value("SELECT 1") == 1 },
      auth: check { http_ok?("#{cfg.auth_url}/health") },
      storage: check { http_ok?("#{cfg.storage_url}/status") },
      mail_catcher: cfg.outbound_mode != "mailpit" || check { http_ok?("#{cfg.mailpit_url}/livez") }
    }
    ready = checks.values.all?
    render json: { status: ready ? "ready" : "not_ready", outbound_hold: cfg.outbound_hold, checks: checks },
           status: ready ? :ok : :service_unavailable
  end

  private

  def check
    yield ? true : false
  rescue StandardError
    false
  end

  def http_ok?(url)
    uri = URI.parse(url)
    # AIDEV-NOTE: URI.parse also accepts relative and non-HTTP URIs; narrow before using HTTP-only methods.
    return false unless uri.is_a?(URI::HTTP)
    host, port = uri.host, uri.port
    return false unless host.is_a?(String) && port.is_a?(Integer)

    # AIDEV-NOTE: Return from the header callback before Net::HTTP buffers an unbounded dependency response body.
    Timeout.timeout(3) do
      Net::HTTP.start(host, port, nil, use_ssl: uri.scheme == "https", open_timeout: 2,
                     read_timeout: 2, write_timeout: 2, max_retries: 0) do |http|
        http.request(Net::HTTP::Get.new(uri.request_uri)) { |response| return response.code == "200" }
      end
    end
    false
  end
end
