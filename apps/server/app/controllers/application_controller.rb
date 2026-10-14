# frozen_string_literal: true

require "logger"

class ApplicationController < ActionController::API
  rescue_from StandardError do |error|
    # AIDEV-NOTE: Standalone Rack tests have no Rails application logger; still emit the fixed diagnostic to stderr.
    error_logger = Rails.respond_to?(:logger) ? Rails.logger : Logger.new($stderr)
    error_logger.error({ event: "request.error", class: error.class.name, request_id: request.request_id }.to_json)
    render json: { code: "internal_error", message: "Internal error", request_id: request.request_id }, status: :internal_server_error
  end
end
