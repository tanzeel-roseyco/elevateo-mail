# frozen_string_literal: true

require_relative "../../v1/write_controller"
require_relative "../../../../lib/elevateo/thread_projection"
require_relative "../../../../lib/elevateo/write_response"
require_relative "../../../../lib/elevateo/cursors"
require_relative "../../../../lib/elevateo/administration_roster"

module V2
  module Admin
    # AIDEV-NOTE: Cassian controls route activation; Sabine SQL is the only role mutation authority.
    class OrganizationGrantsController < V1::WriteController
      ROLE_SQL = { "organization_admin" => "admin", "technology_operator" => "operator",
        "sales_lead" => "sales_manager", "sales_member" => "sales",
        "security_auditor" => "auditor", "organization_member" => "associate" }.freeze
      CHANGE_SQL = "SELECT app.change_organization_role($1::text,$2::uuid,$3::integer,$4::text) AS result"
      PAGE_SQL = "SELECT app.organization_grants_page($1::text,$2::uuid,$3::integer) AS result"
      DATABASE_ROLES = { "owner" => "organization_owner", "admin" => "organization_admin",
        "operator" => "technology_operator", "sales_manager" => "sales_lead",
        "sales" => "sales_member", "auditor" => "security_auditor",
        "associate" => "organization_member" }.freeze

      def index
        organization = path_uuid(:organization_id)
        protected_read(allowed_query: %w[limit cursor], budget: 16_384) do |connection:, identity:, session:, query:, **|
          raise Elevateo::CollaborationError.new("not_available") unless organization == identity.org_id
          limit = self.class.page_limit(query)
          cursors = Elevateo::Cursors.new(secret: read_config.cursor_signing_key)
          scope = page_scope(identity, session, limit, organization)
          position = query.key?("cursor") ? cursors.decode(query.fetch("cursor"), scope: scope) : nil
          if position && (position.keys != ["user_id"] || !Elevateo::Cursors::UUID.match?(position["user_id"]))
            raise Elevateo::CollaborationError.new("cursor_invalid")
          end
          binds = [identity.digest, position && position["user_id"], limit].map do |value|
            ActiveRecord::Relation::QueryAttribute.new("organization_grants_page", value&.to_s, ActiveRecord::Type::String.new)
          end
          row = connection.exec_query(PAGE_SQL, "organization grants page", binds).first
          result = Elevateo::ThreadProjection.source_json(row && row["result"], 16_384)
          unless result.is_a?(Hash)
            raise Elevateo::CollaborationError.new("internal_error")
          end
          Elevateo::SessionStore.check!(result)
          unless result.keys.sort == %w[actor items next_user_id status]
            raise Elevateo::CollaborationError.new("internal_error")
          end
          actor = self.class.project_grants([result["actor"]], organization, 1).first
          unless actor["user_id"] == identity.user_id && %w[organization_owner organization_admin].include?(actor["role"])
            raise Elevateo::CollaborationError.new("internal_error")
          end
          items = self.class.project_grants(result["items"], organization, limit)
          after = result["next_user_id"]
          if after && (items.empty? || after != items.last["user_id"])
            raise Elevateo::CollaborationError.new("internal_error")
          end
          cursor = after && cursors.encode(position: { "user_id" => after }, scope: scope)
          JSON.generate({ "context_id" => session.fetch("context_id"),
            "authorization_version" => session.fetch("authorization_version"),
            "actor" => actor, "items" => items, "next_cursor" => cursor })
        end
      rescue Elevateo::Cursors::Invalid
        raise Elevateo::CollaborationError.new("cursor_invalid")
      rescue Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
      end

      def self.page_limit(query)
        raw = query.fetch("limit", "50")
        unless raw.is_a?(String) && /\A(?:[1-9]|[1-4][0-9]|50)\z/.match?(raw)
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        raw.to_i
      end

      def self.project_grants(rows, organization, limit)
        unless rows.is_a?(Array) && rows.length <= limit
          raise Elevateo::CollaborationError.new("internal_error")
        end
        previous = nil
        rows.map do |row|
          unless row.is_a?(Hash) && row.keys.sort == %w[revision role user_id]
            raise Elevateo::CollaborationError.new("internal_error")
          end
          user = Elevateo::ThreadProjection.uuid(row["user_id"])
          unless previous.nil? || previous < user
            raise Elevateo::CollaborationError.new("internal_error")
          end
          previous = user
          role = DATABASE_ROLES[row["role"]]
          unless role
            raise Elevateo::CollaborationError.new("internal_error")
          end
          revision = Elevateo::ThreadProjection.integer(row["revision"], 2_147_483_647)
          { "organization_id" => organization, "user_id" => user, "role" => role, "revision" => revision }
        end
      end

      def roster
        organization = path_uuid(:organization_id)
        protected_read(allowed_query: %w[limit cursor], budget: 8192) do |connection:, identity:, session:, query:, **|
          raise Elevateo::CollaborationError.new("not_available") unless organization == identity.org_id
          limit = self.class.page_limit(query)
          authorization_binds = [identity.digest, nil, "1"].map do |value|
            ActiveRecord::Relation::QueryAttribute.new("organization_roster_guard", value, ActiveRecord::Type::String.new)
          end
          result_row = connection.exec_query(PAGE_SQL, "organization roster authority", authorization_binds).first
          result = Elevateo::ThreadProjection.source_json(result_row && result_row["result"], 4096)
          raise Elevateo::CollaborationError.new("internal_error") unless result.is_a?(Hash)
          Elevateo::SessionStore.check!(result)
          unless result.keys.sort == %w[actor items next_user_id status]
            raise Elevateo::CollaborationError.new("internal_error")
          end
          actor = self.class.project_grants([result["actor"]], organization, 1).first
          unless actor["user_id"] == identity.user_id && %w[organization_owner organization_admin].include?(actor["role"])
            raise Elevateo::CollaborationError.new("internal_error")
          end
          cursors = Elevateo::Cursors.new(secret: read_config.cursor_signing_key)
          scope = page_scope(identity, session, limit, organization).merge("resource" => "organization_roster", "order" => "key:asc")
          position = query.key?("cursor") ? cursors.decode(query.fetch("cursor"), scope: scope) : nil
          if position && (position.keys != ["config_key"] || !Elevateo::AdministrationRoster::KEYS.include?(position["config_key"]))
            raise Elevateo::CollaborationError.new("cursor_invalid")
          end
          people = Elevateo::AdministrationRoster.public_people(Elevateo::AdministrationRoster.load)
          offset = position ? Elevateo::AdministrationRoster::KEYS.index(position.fetch("config_key")) + 1 : 0
          items = people.slice(offset, limit) || []
          next_key = offset + limit < people.length ? items.last.fetch("key") : nil
          cursor = next_key && cursors.encode(position: { "config_key" => next_key }, scope: scope)
          JSON.generate({ "context_id" => session.fetch("context_id"),
            "authorization_version" => session.fetch("authorization_version"),
            "items" => items, "next_cursor" => cursor })
        end
      rescue Elevateo::Cursors::Invalid
        raise Elevateo::CollaborationError.new("cursor_invalid")
      rescue Elevateo::AdministrationRoster::Invalid, Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
      end

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
      rescue Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
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

      def page_scope(identity, session, limit, organization)
        { "actor_id" => identity.user_id, "organization_id" => organization,
          "context_id" => session.fetch("context_id"),
          "authorization_version" => session.fetch("authorization_version"),
          "resource" => "organization_grants", "filters" => {}, "order" => "user_id:asc", "limit" => limit }
      end

      def path_uuid(key)
        value = request.path_parameters[key]
        raise Elevateo::CollaborationError.new("request_invalid") unless value.is_a?(String)
        Elevateo::WriteInput.uuid(value)
      end
    end
  end
end
