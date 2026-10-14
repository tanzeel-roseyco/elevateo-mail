# frozen_string_literal: true

require_relative "../../../lib/elevateo/session_organizations"

module V1
  class OrganizationsController < ReadController
    def index
      protected_read(allowed_query: %w[cursor limit], budget: 131_072) do |connection:, identity:, session:, query:, deadline:|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var query: Hash[String, String]
        # @type var deadline: Elevateo::RequestDeadline
        service = Elevateo::Sessions.new
        page = Elevateo::SessionOrganizations.new(store: service.store, crypto: service.crypto).page(identity: identity,
          session: session, query: query, connection: connection, deadline: deadline)
        api_encode(page, limit: 131_072)
      end
    end
  end
end
