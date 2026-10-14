# frozen_string_literal: true

require_relative "../../v1/write_controller"
require_relative "../../../../lib/elevateo/organization_role_audit"
require_relative "../../../../lib/elevateo/cursors"

module V2
  module Admin
    # AIDEV-NOTE: SQL validates current role under the session snapshot; this controller signs page positions only.
    class OrganizationRoleAuditController < V1::WriteController
      PAGE_SQL = "SELECT app.organization_role_audit_page($1::text,$2::uuid,$3::integer) AS result"

      def index
        organization = path_uuid(:organization_id)
        protected_read(allowed_query: %w[limit cursor], budget: 32_768) do |connection:, identity:, session:, query:, **|
          raise Elevateo::CollaborationError.new("not_available") unless organization == identity.org_id
          limit = Elevateo::OrganizationRoleAudit.limit(query)
          cursors = Elevateo::Cursors.new(secret: read_config.cursor_signing_key)
          scope = { "actor_id" => identity.user_id, "organization_id" => organization,
            "context_id" => session.fetch("context_id"), "authorization_version" => session.fetch("authorization_version"),
            "resource" => "organization_role_audit", "filters" => {}, "order" => "event_sequence:desc", "limit" => limit }
          position = query.key?("cursor") ? cursors.decode(query.fetch("cursor"), scope: scope) : nil
          if position && (position.keys != ["id"] || !Elevateo::Cursors::UUID.match?(position["id"]))
            raise Elevateo::CollaborationError.new("cursor_invalid")
          end
          binds = [identity.digest, position && position["id"], limit].map do |value|
            ActiveRecord::Relation::QueryAttribute.new("organization_role_audit", value&.to_s, ActiveRecord::Type::String.new)
          end
          row = connection.exec_query(PAGE_SQL, "organization role audit page", binds).first
          result = Elevateo::ThreadProjection.source_json(row && row["result"], 32_768)
          raise Elevateo::CollaborationError.new("internal_error") unless result.is_a?(Hash)
          raise Elevateo::CollaborationError.new("cursor_invalid") if result["status"] == "cursor_invalid"
          Elevateo::SessionStore.check!(result)
          unless result.keys.sort == %w[items next_id status]
            raise Elevateo::CollaborationError.new("internal_error")
          end
          items = Elevateo::OrganizationRoleAudit.items(result["items"], organization: organization, limit: limit)
          after = result["next_id"]
          if after && (items.empty? || after != items.last["id"])
            raise Elevateo::CollaborationError.new("internal_error")
          end
          cursor = after && cursors.encode(position: { "id" => after }, scope: scope)
          JSON.generate({ "context_id" => session.fetch("context_id"),
            "authorization_version" => session.fetch("authorization_version"),
            "items" => items, "next_cursor" => cursor })
        end
      rescue Elevateo::Cursors::Invalid
        raise Elevateo::CollaborationError.new("cursor_invalid")
      rescue Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
      end

      private

      def path_uuid(key)
        value = request.path_parameters[key]
        raise Elevateo::CollaborationError.new("request_invalid") unless value.is_a?(String)
        Elevateo::WriteInput.uuid(value)
      end
    end
  end
end
