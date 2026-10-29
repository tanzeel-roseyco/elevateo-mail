# frozen_string_literal: true

require_relative "../v1/write_controller"
require_relative "../../../lib/elevateo/connector_grants"

module V2
  # AIDEV-NOTE: Grant management requires the same browser CSRF/context proofs as draft edits.
  class ConnectorGrantsController < V1::WriteController
    def index
      protected_read(allowed_query: [], budget: 65_536) do |connection:, session:, **|
        # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
        # @type var session: Elevateo::auth_object
        JSON.generate(Elevateo::ConnectorGrants.new(connection: connection, session: session).list)
      end
    end

    def create
      protected_write(required: Elevateo::ConnectorInput::GRANT_FIELDS) do |connection:, identity:, session:, input:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        # @type var input: Elevateo::WriteInput::object
        result = Elevateo::ConnectorGrants.new(connection: connection, session: session).issue(input, digest: identity.digest)
        Elevateo::WriteResponse.new(json: JSON.generate(result), status: 201)
      end
    end

    def revoke
      protected_write(body: false) do |connection:, identity:, session:, **|
        # @type var connection: Elevateo::WriteStatements
        # @type var identity: Elevateo::SessionIdentity
        # @type var session: Elevateo::auth_object
        id = params[:grant_id]
        Elevateo::WriteInput.invalid! unless id.is_a?(String)
        result = Elevateo::ConnectorGrants.new(connection: connection, session: session).revoke(id, digest: identity.digest)
        Elevateo::WriteResponse.new(json: JSON.generate(result), status: 200)
      end
    end
  end
end
