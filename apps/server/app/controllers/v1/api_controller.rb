# frozen_string_literal: true

require_relative "../../../lib/elevateo/request_deadline"
require_relative "../../../lib/elevateo/auth_input"

module V1
  class ApiController < ApplicationController
    around_action :api_boundary
    rescue_from Elevateo::AuthError, with: :api_error

    protected

    # AIDEV-NOTE: Rails instrumentation otherwise parses/truncates raw input before our bounded boundary runs.
    def process_action(*arguments)
      empty_parameters = {} # : Hash[String, Object?]
      request.request_parameters = empty_parameters
      request.set_header("action_dispatch.request.query_parameters", empty_parameters)
      super
    end

    def api_boundary
      @api_deadline = Elevateo::RequestDeadline.new
      api_security_headers
      @api_deadline.within { yield }
    end

    def api_deadline = @api_deadline
    def api_query(allowed: []) = Elevateo::AuthInput.query(request.query_string, allowed: allowed)
    def session_cookie = request.cookies["elevateo_session"]
    def request_csrf = request.headers["X-CSRF-Token"]

    # AIDEV-NOTE: Read a bounded raw stream before Rails parameter parsing can lose duplicate JSON keys.
    def api_body(required:, optional: [])
      api_query
      raise Elevateo::AuthError.invalid unless request.media_type == "application/json"
      length = request.get_header("CONTENT_LENGTH")
      if length && (!/\A[0-9]+\z/.match?(length) || length.to_i > 8192)
        raise Elevateo::AuthError.invalid
      end
      raw = request.body.read(8193)
      raise Elevateo::AuthError.invalid unless raw.is_a?(String)
      Elevateo::AuthInput.body(raw, required: required, optional: optional)
    end

    def api_security_headers
      response.headers["Cache-Control"] = "no-store"
      response.headers["Vary"] = "Cookie"
      response.headers["X-Content-Type-Options"] = "nosniff"
    end

    def api_encode(payload, limit:)
      json = JSON.generate(payload)
      raise Elevateo::AuthError.new if json.bytesize > limit
      json
    end

    def api_json(payload, status: 200, limit: 20_480)
      api_serialized(api_encode(payload, limit: limit), status: status, limit: limit)
    end

    def api_serialized(json, status: 200, limit: 20_480)
      raise Elevateo::AuthError.new unless json.is_a?(String) && json.bytesize <= limit
      api_security_headers
      render body: json, content_type: "application/json", status: status
    end

    def api_error(error)
      response.headers["Retry-After"] = error.retry_after.to_s if error.retry_after
      request_id = request.request_id.to_s.byteslice(0, 128)
      # AIDEV-NOTE: Fixed boundary metadata only; never log upstream bodies, exception messages or credentials.
      if error.code == "temporarily_unavailable"
        Rails.logger.error({ event: "auth.boundary_unavailable", request_id: request_id }.to_json)
      end
      api_json({ "code" => error.code, "message" => error.message, "request_id" => request_id },
        status: error.status, limit: 4096)
    end
  end
end
