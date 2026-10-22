# frozen_string_literal: true

require_relative "read_controller"
require_relative "../../../lib/elevateo/session_writes"

module V1
  # AIDEV-NOTE: C/D read actions inherit this error/transport seam and continue using the existing protected_read.
  class WriteController < ReadController
    rescue_from Elevateo::CollaborationError, with: :api_error

    protected

    def protected_write(allowed_query: [], required: [], max_bytes: 8192, budget: 4096, guard_users: nil, body: true)
      # @type var users: Array[String]
      Elevateo::WriteInput.transport!(origin: request.headers["Origin"], expected_origin: read_config.browser_origin,
        content_type: request.get_header("CONTENT_TYPE"), content_encoding: request.get_header("HTTP_CONTENT_ENCODING"),
        body: body)
      query = api_query(allowed: allowed_query)
      raw = Elevateo::WriteInput.read(request.body, maximum: body ? max_bytes : 0)
      # @type var input: Elevateo::WriteInput::object
      input = body ? Elevateo::WriteInput.body(raw, required: required) : {}
      context, version = read_context(required: true)
      csrf = request_csrf
      unless csrf.is_a?(String) && /\A[A-Za-z0-9_-]{32,512}\z/.match?(csrf)
        raise Elevateo::CollaborationError.new("request_invalid")
      end
      users = guard_users ? guard_users.call(input: input, query: query) : []
      unless users.is_a?(Array) && users.length <= 2
        raise Elevateo::CollaborationError.new("request_invalid")
      end
      users = users.map { |user| Elevateo::WriteInput.uuid(user) }
      identity = read_sessions.authenticate(cookie: session_cookie, deadline: api_deadline)
      result = Elevateo::SessionWrites.new(sessions: read_sessions).transaction(identity,
        context: context, version: version, csrf: csrf, guard_users: users, budget: budget, deadline: api_deadline) do |connection:, session:|
        # @type var connection: Elevateo::WriteStatements
        # @type var session: Elevateo::auth_object
        yield(connection: connection, identity: identity, session: session, input: input, query: query, deadline: api_deadline)
      end
      api_deadline.check!
      api_serialized(result.json, status: result.status, limit: budget)
    end

    def api_query(allowed: []) = Elevateo::WriteInput.query(request.query_string, allowed: allowed)

    # AIDEV-NOTE: One inherited renderer covers C/D reads and writes; A/B AuthError remains untouched.
    def api_error(error)
      public_error = error.is_a?(Elevateo::CollaborationError) ? error :
        Elevateo::CollaborationError.new(error.code, retry_after: error.retry_after)
      response.headers["Retry-After"] = public_error.retry_after.to_s if public_error.retry_after
      api_json(public_error.body(request.request_id), status: public_error.status, limit: 4096)
    end
  end
end
