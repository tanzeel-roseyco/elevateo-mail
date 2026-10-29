# frozen_string_literal: true

require_relative "../../lib/elevateo/auth_callback_redaction"

class AuthEntriesController < V1::AuthController
  def stage
    response.headers["Referrer-Policy"] = "no-referrer"
    # AIDEV-NOTE: Missing early middleware is a deployment error; never fall back to a query that may already be logged.
    raw_query = request.env[Elevateo::AuthCallbackRedaction::QUERY_KEY]
    raise Elevateo::AuthError.new unless raw_query.is_a?(String)
    staged = Elevateo::AuthEntry.new(sessions: sessions).stage(raw_query: raw_query, deadline: api_deadline)
    set_auth_cookie("elevateo_pending", staged.fetch(:cookie), max_age: 600)
    clear_auth_cookie("elevateo_challenge")
    response.headers["Location"] = staged.fetch(:location)
    head :see_other
  end
end
