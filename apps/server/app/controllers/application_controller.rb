# frozen_string_literal: true

require "logger"

class ApplicationController < ActionController::API
  rescue_from StandardError do |error|
    # AIDEV-NOTE: Rails can expose a nil logger before boot; fixed diagnostics must still reach stderr.
    error_logger = Rails.logger || Logger.new($stderr)
    error_logger.error({ event: "request.error", class: error.class.name, request_id: request.request_id }.to_json)
    render json: { code: "internal_error", message: "Internal error", request_id: request.request_id }, status: :internal_server_error
  end
end
