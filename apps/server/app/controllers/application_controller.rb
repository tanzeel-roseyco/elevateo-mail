# frozen_string_literal: true

require "logger"

class ApplicationController < ActionController::API
  rescue_from StandardError do |error|
    # AIDEV-NOTE: Standalone Rails may omit logger entirely; preboot may return nil. Keep fixed diagnostics in both.
    error_logger = (Rails.respond_to?(:logger) ? Rails.logger : nil) || Logger.new($stderr)
    error_logger.error({ event: "request.error", class: error.class.name, request_id: request.request_id }.to_json)
    render json: { code: "internal_error", message: "Internal error", request_id: request.request_id }, status: :internal_server_error
  end
end
