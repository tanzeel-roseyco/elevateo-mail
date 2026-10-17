# frozen_string_literal: true

require "net/http"

class HealthController < ApplicationController
  def live
    render json: { status: "ok" }
  end

  # Side-effect-free dependency checks; no tokens issued, mail sent or objects created.
  def ready
    cfg = Elevateo::Config.current
    checks = {
      database: check { ActiveRecord::Base.connection.select_value("SELECT 1") == 1 },
      auth: check { http_ok?("#{cfg.auth_url}/health") },
      storage: check { http_ok?("#{cfg.storage_url}/status") },
      mail_catcher: check { http_ok?("#{cfg.mailpit_url}/livez") }
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

    Net::HTTP.start(host, port, open_timeout: 2, read_timeout: 2) { |h| h.get(uri.request_uri).code == "200" }
  end
end
