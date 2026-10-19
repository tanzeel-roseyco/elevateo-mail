# frozen_string_literal: true

require_relative "../../lib/elevateo/resend_events/config"
require_relative "../../lib/elevateo/resend_events/store"

class ResendEventsController < ApplicationController
  # AIDEV-NOTE: Provider authentication replaces browser sessions here; no params access may parse unsigned JSON.
  def create
    verifier = Elevateo::ResendEvents::Config.current.signature
    return head(:not_found) unless verifier

    body = request.body.read(Elevateo::ResendEvents::Signature::MAX_BODY + 1).to_s
    id = header("svix-id")
    verifier.verify(body: body, id: id, timestamp: header("svix-timestamp"), signatures: header("svix-signature"))
    result = Elevateo::ResendEvents::Store.new(connection: ActiveRecord::Base.connection).receive(id: id, body: body)
    return head(:conflict) if result["result"] == "conflict"

    head(:no_content)
  rescue Elevateo::ResendEvents::Invalid
    head(:bad_request)
  end

  private

  def header(name)
    value = request.headers[name]
    value.is_a?(String) ? value : ""
  end
end
