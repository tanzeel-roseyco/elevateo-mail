# frozen_string_literal: true

require_relative "../../../lib/elevateo/sessions"
require_relative "../../../lib/elevateo/session_challenges"

module V1
  class SessionsController < ReadController
    def show
      # AIDEV-NOTE: Session bootstrap intentionally has no stale-view hints; the protected snapshot still authorizes it.
      protected_read(allowed_query: [], context_required: false, budget: 16_384) do |connection:, identity:, session:, query:, deadline:|
        api_encode(session, limit: 16_384)
      end
    end

    def switch_organization
      input = api_body(required: %w[organization_id])
      organization = Elevateo::AuthInput.uuid(input["organization_id"])
      context = Elevateo::AuthInput.text(request.headers["X-Session-Context"], maximum: 512)
      version = Elevateo::AuthInput.text(request.headers["X-Authorization-Version"], maximum: 512)
      csrf = Elevateo::AuthInput.text(request_csrf, maximum: 512)
      service = Elevateo::Sessions.new
      challenge = Elevateo::SessionChallenges.new(config: Elevateo::Config.current, crypto: service.crypto)
      challenge.origin!(request.headers["Origin"])
      identity = service.authenticate(cookie: session_cookie, deadline: api_deadline)
      result = service.switch(identity, organization_id: organization, context: context, version: version,
        csrf: csrf, deadline: api_deadline)
      api_json(service.presentation.lifecycle(result.metadata, expires_at: result.expires_at,
        display_name: result.display_name))
    end
  end
end
