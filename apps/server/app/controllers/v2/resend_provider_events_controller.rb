# frozen_string_literal: true

require_relative "../../../lib/elevateo/resend_webhook"

module V2
  class ResendProviderEventsController < ApplicationController
    def create
      body = request.raw_post
      Elevateo::ResendWebhook::Verifier.new(secret: Elevateo::Config.current.resend_webhook_secret).verify!(
        id: request.headers["svix-id"].to_s, timestamp: request.headers["svix-timestamp"].to_s,
        signatures: request.headers["svix-signature"].to_s, body: body)
      result = Elevateo::ResendWebhook::Handler.new(connection: ActiveRecord::Base.connection).ingest(
        id: request.headers["svix-id"].to_s, body: body)
      render json: result, status: :ok
    rescue Elevateo::ResendWebhook::Invalid
      render json: { code: "invalid_provider_event", message: "Provider event rejected" }, status: :unauthorized
    end
  end
end
