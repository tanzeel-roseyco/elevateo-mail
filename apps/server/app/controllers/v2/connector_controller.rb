# frozen_string_literal: true

require_relative "../v1/write_controller"
require_relative "../../../lib/elevateo/connector_grants"
require_relative "../../../lib/elevateo/connector_operations"

module V2
  # AIDEV-NOTE: Bearer requests use live source-session checks and locked grant checks, never browser cookie authority.
  class ConnectorController < V1::WriteController
    def search = execute("search", Elevateo::ConnectorInput::SEARCH_FIELDS)
    def read = execute("read", Elevateo::ConnectorInput::READ_FIELDS)
    def draft = execute("draft", Elevateo::ConnectorInput::DRAFT_FIELDS)

    private

    def execute(operation, fields)
      api_query
      Elevateo::WriteInput.invalid! unless request.headers["Origin"].nil? && request.media_type == "application/json" &&
        request.get_header("HTTP_CONTENT_ENCODING").nil?
      authorization = request.headers["Authorization"]
      raise Elevateo::AuthError.unauthorized unless authorization.is_a?(String) &&
        /\ABearer [A-Za-z0-9_-]{32,256}\z/.match?(authorization)
      token = authorization.delete_prefix("Bearer ")
      input = Elevateo::WriteInput.body(Elevateo::WriteInput.read(request.body, maximum: 262_144), required: fields)
      Elevateo::ConnectorInput.operation(operation, input)
      identity = read_sessions.authenticate_digest(resolve(token), deadline: api_deadline)
      metadata = identity.metadata
      context = read_sessions.presentation.required(metadata, "context_id")
      csrf = read_sessions.presentation.required(metadata, "csrf_token")
      version = read_sessions.presentation.version(metadata)
      result = Elevateo::SessionWrites.new(sessions: read_sessions).transaction(identity,
        context: context, version: version, csrf: csrf, guard_users: [], budget: 4_194_304, deadline: api_deadline) do |connection:, session:|
        # @type var connection: Elevateo::WriteStatements
        # @type var session: Elevateo::auth_object
        Elevateo::ConnectorGrants.new(connection: connection, session: session).authorize(token,
          digest: identity.digest, mailbox: Elevateo::WriteInput.uuid(input["mailbox_id"]), scope: operation)
        operations = Elevateo::ConnectorOperations.new(connection: connection, session: session)
        case operation
        when "search" then operations.encode(operations.search(input))
        when "read" then operations.encode(operations.read(input))
        else operations.draft(input, digest: identity.digest, request_id: request.request_id)
        end
      end
      api_serialized(result.json, status: result.status, limit: 4_194_304)
      response.headers["Vary"] = "Authorization"
    end

    def resolve(token)
      # AIDEV-NOTE: Resolve only the opaque hash here; authentication happens after releasing this DB connection.
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        raise Elevateo::AuthError.new if connection.transaction_open?
        Elevateo::ConnectorGrants.new(connection: connection, session: {}).resolve(token)
      end
    rescue ActiveRecord::ActiveRecordError
      raise Elevateo::AuthError.new
    end
  end
end
