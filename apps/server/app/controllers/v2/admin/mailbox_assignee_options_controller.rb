# frozen_string_literal: true

require_relative "../../v1/write_controller"
require_relative "../../../../lib/elevateo/assignee_options_repository"
require_relative "../../../../lib/elevateo/cursors"

module V2
  module Admin
    # AIDEV-NOTE: The route supplies only a mailbox; the protected SQL routine owns actor and target eligibility.
    class MailboxAssigneeOptionsController < V1::WriteController
      def index
        mailbox = Elevateo::WriteInput.uuid(request.path_parameters[:mailbox_id])
        protected_read(allowed_query: %w[limit cursor], budget: Elevateo::AssigneeOptions::MAX_RESULT_BYTES) do
          |connection:, identity:, session:, query:, **|
          # @type var connection: ActiveRecord::ConnectionAdapters::AbstractAdapter
          # @type var identity: Elevateo::SessionIdentity
          # @type var session: Elevateo::ReadResponse::item
          # @type var query: Hash[String, String]
          limit = Elevateo::AssigneeOptions.limit(query)
          cursors = Elevateo::Cursors.new(secret: read_config.cursor_signing_key)
          # @type var scope: Elevateo::Cursors::scope
          scope = { "actor_id" => identity.user_id, "organization_id" => identity.org_id,
            "context_id" => session.fetch("context_id"),
            "authorization_version" => session.fetch("authorization_version"),
            "resource" => "mailbox_assignee_options", "filters" => { "mailbox_id" => mailbox },
            "order" => "user_id:asc", "limit" => limit }
          # AIDEV-NOTE: SQL runs on every page, so a valid old cursor cannot preserve revoked mailbox authority.
          position = query.key?("cursor") ? cursors.decode(query.fetch("cursor"), scope: scope) : nil
          after = position && Elevateo::AssigneeOptions.position(position)
          context = session["context_id"]
          generation = identity.metadata["authorization_generation"]
          unless context.is_a?(String) && Elevateo::Cursors::UUID.match?(context) &&
              generation.is_a?(Integer) && generation.between?(0, 9_223_372_036_854_775_807)
            raise Elevateo::CollaborationError.new("internal_error")
          end
          result = assignee_options_repository(connection).page(digest: identity.digest,
            user_id: identity.user_id, auth_session_id: identity.auth_session_id,
            context_id: context, generation: generation, organization_id: Elevateo::WriteInput.uuid(identity.org_id),
            mailbox_id: mailbox, after_user_id: after, limit: limit)
          Elevateo::SessionStore.check!(result)
          items, next_id = Elevateo::AssigneeOptions.project(result, after: after, limit: limit)
          cursor = next_id && cursors.encode(position: { "user_id" => next_id }, scope: scope)
          JSON.generate({ "context_id" => session.fetch("context_id"),
            "authorization_version" => session.fetch("authorization_version"),
            "mailbox_id" => mailbox, "items" => items, "next_cursor" => cursor })
        end
      rescue Elevateo::Cursors::Invalid
        raise Elevateo::CollaborationError.new("cursor_invalid")
      rescue Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
      end

      private

      def assignee_options_repository(connection) = Elevateo::AssigneeOptionsRepository.new(connection: connection)
    end
  end
end
