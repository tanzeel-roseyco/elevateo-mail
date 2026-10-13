# frozen_string_literal: true

class ApplicationController < ActionController::API
  rescue_from StandardError do |error|
    Rails.logger.error({ event: "request.error", class: error.class.name, request_id: request.request_id }.to_json)
    render json: { code: "internal_error", message: "Internal error", request_id: request.request_id }, status: :internal_server_error
  end
end
