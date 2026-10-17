# frozen_string_literal: true

require_relative "../../../lib/elevateo/tenancy"
require_relative "../../../lib/elevateo/sessions"
require_relative "../../../lib/elevateo/cursors"
require_relative "../../../lib/elevateo/read_response"

module V1
  class ReadController < ApiController
    CONTEXT_TOKEN = /\A[A-Za-z0-9_-]{16,256}\z/

    protected

    def read_config = (@read_config ||= Elevateo::Config.current)
    def read_sessions = (@read_sessions ||= Elevateo::Sessions.new(config: read_config))

    # AIDEV-NOTE: Auth runs before SQL; authorization and rendered rows then share one read-only snapshot.
    def protected_read(allowed_query:, context_required: true, budget: 2_097_152)
      query = api_query(allowed: allowed_query)
      raise Elevateo::AuthError.invalid unless request.body.read(1).to_s.empty?
      context, version = read_context(required: context_required)
      identity = read_sessions.authenticate(cookie: session_cookie, deadline: api_deadline)
      principal = Elevateo::Tenancy::Principal.new(user_id: identity.user_id, org_id: identity.org_id)

      json = ActiveRecord::Base.connection_pool.with_connection do |connection|
        Elevateo::Tenancy.with_context(principal, connection: connection, read_only: true) do
          session = read_sessions.authorize(identity, context: context, version: version,
            deadline: api_deadline, connection: connection)
          api_deadline.check!
          rendered = yield(connection: connection, identity: identity, session: session, query: query,
            deadline: api_deadline)
          unless rendered.is_a?(String) && rendered.valid_encoding? && rendered.bytesize <= budget
            raise Elevateo::ReadResponse::Overflow
          end
          api_deadline.check!
          rendered
        end
      end

      # AIDEV-NOTE: ActiveRecord swallows Rollback; an aborted snapshot must not count as session activity.
      raise Elevateo::ReadResponse::Overflow unless json.is_a?(String)

      # AIDEV-NOTE: Activity is separate from business reads and cannot revive an expired or revoked session.
      read_sessions.touch(identity, deadline: api_deadline)
      api_deadline.check!
      api_serialized(json, limit: budget)
    rescue Elevateo::Cursors::Invalid
      raise Elevateo::AuthError.new("cursor_invalid", status: 400)
    rescue Elevateo::ReadResponse::Overflow, Elevateo::Tenancy::ContextError
      raise Elevateo::AuthError.new("internal_error", status: 500)
    rescue ActiveRecord::ActiveRecordError
      raise Elevateo::AuthError.new
    end

    def read_context(required:)
      return [nil, nil] unless required
      values = [request.headers["X-Session-Context"], request.headers["X-Authorization-Version"]]
      unless values.all? { |value| value.is_a?(String) && CONTEXT_TOKEN.match?(value) }
        raise Elevateo::AuthError.invalid
      end
      values
    end
  end
end
