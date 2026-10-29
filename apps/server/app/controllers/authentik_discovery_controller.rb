# frozen_string_literal: true

require_relative "../../lib/elevateo/authentik_discovery"

# AIDEV-NOTE: Public metadata contains no credentials; endpoints come only from validated server configuration.
class AuthentikDiscoveryController < ActionController::API
  def show
    response.headers["Cache-Control"] = "no-store"
    render json: Elevateo::AuthentikDiscovery.document(Elevateo::Config.current)
  rescue Elevateo::AuthError
    head :service_unavailable
  end
end
