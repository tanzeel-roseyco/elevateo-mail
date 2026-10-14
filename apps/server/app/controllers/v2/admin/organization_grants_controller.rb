# frozen_string_literal: true

require_relative "../../v1/write_controller"
require_relative "../../../../lib/elevateo/thread_projection"
require_relative "../../../../lib/elevateo/write_response"

module V2
  module Admin
    # AIDEV-NOTE: Cassian controls route activation; Sabine SQL is the only role mutation authority.
    class OrganizationGrantsController < V1::WriteController
      ROLE_SQL = { "organization_admin" => "admin", "organization_member" => "associate" }.freeze
      CHANGE_SQL = "SELECT app.change_organization_role($1::text,$2::uuid,$3::integer,$4::text) AS result"

      def update
        organization = path_uuid(:organization_id)
        target = path_uuid(:user_id)
        guards = ->(input:, **) do
          self.class.change_input(input)
          [target]
        end
        protected_write(required: %w[role expected_revision], guard_users: guards) do |connection:, identity:, input:, **|
          raise Elevateo::CollaborationError.new("not_available") unless organization == identity.org_id
          role, revision = self.class.change_input(input)
          row = connection.exec_query(CHANGE_SQL, "organization role change",
            [identity.digest, target, revision.to_s, ROLE_SQL.fetch(role)].map do |value|
              ActiveRecord::Relation::QueryAttribute.new("organization_grant", value, ActiveRecord::Type::String.new)
            end).first
          result = Elevateo::ThreadProjection.source_json(row && row["result"], 4096)
          unless result.is_a?(Hash)
            raise Elevateo::CollaborationError.new("internal_error")
          end
          raise Elevateo::CollaborationError.new("membership_conflict") if result["status"] == "role_conflict"
          Elevateo::SessionStore.check!(result)
          metadata = result["metadata"]
          unless metadata.is_a?(Hash) && metadata["user_id"] == identity.user_id && metadata["organization_id"] == organization
            raise Elevateo::CollaborationError.new("internal_error")
          end
          returned_revision = Elevateo::ThreadProjection.integer(result["revision"], 2_147_483_647)
          unless result["role"] == ROLE_SQL.fetch(role)
            raise Elevateo::CollaborationError.new("internal_error")
          end
          payload = { "organization_id" => organization, "user_id" => target,
            "role" => role, "revision" => returned_revision }
          Elevateo::WriteResponse.new(json: JSON.generate(payload), status: 200).verify!(budget: 4096)
        end
      end

      def self.change_input(input)
        unless input.is_a?(Hash) && input.keys.sort == %w[expected_revision role]
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        role, revision = input.values_at("role", "expected_revision")
        unless ROLE_SQL.key?(role) && revision.is_a?(Integer) && revision.between?(0, 2_147_483_647)
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        [role, revision]
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
