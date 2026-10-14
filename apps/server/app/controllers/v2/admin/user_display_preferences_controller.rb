# frozen_string_literal: true

require_relative "../../v1/write_controller"
require_relative "../../../../lib/elevateo/thread_projection"
require_relative "../../../../lib/elevateo/write_response"

module V2
  module Admin
    # AIDEV-NOTE: The session selects both tenant and user; preferences never accept a target identifier.
    class UserDisplayPreferencesController < V1::WriteController
      READ_SQL = "SELECT app.read_user_display_preference($1::text) AS result"
      WRITE_SQL = "SELECT app.write_user_display_preference($1::text,$2::integer,$3::text) AS result"

      def show
        protected_read(allowed_query: [], budget: 4096) do |connection:, identity:, session:, **|
          result = sql_result(connection, READ_SQL, "read display preference", [identity.digest])
          Elevateo::SessionStore.check!(result)
          display_name, revision = self.class.projection(result)
          JSON.generate("context_id" => session.fetch("context_id"),
            "authorization_version" => session.fetch("authorization_version"),
            "display_name" => display_name, "revision" => revision)
        end
      rescue Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
      end

      def update
        # @type var guards: V1::WriteController::target_users
        guards = ->(input:, query:) do
          # @type var input: Elevateo::WriteInput::object
          raise Elevateo::CollaborationError.new("request_invalid") unless query.empty?
          self.class.input(input)
          []
        end
        protected_write(required: %w[display_name expected_revision], guard_users: guards) do |connection:, identity:, input:, **|
          name, expected = self.class.input(input)
          result = sql_result(connection, WRITE_SQL, "write display preference", [identity.digest, expected, name])
          if result["status"] == "preference_conflict"
            raise Elevateo::CollaborationError.new("membership_conflict")
          end
          Elevateo::SessionStore.check!(result)
          metadata = result["metadata"]
          unless metadata.is_a?(Hash) && metadata["user_id"] == identity.user_id &&
              metadata["organization_id"] == identity.org_id
            raise Elevateo::CollaborationError.new("internal_error")
          end
          display_name, revision = self.class.projection(result)
          Elevateo::WriteResponse.new(json: JSON.generate({ "display_name" => display_name,
            "revision" => revision }), status: 200).verify!(budget: 4096)
        end
      rescue Elevateo::ReadResponse::Invalid
        raise Elevateo::CollaborationError.new("internal_error")
      end

      def self.input(input)
        unless input.is_a?(Hash) && input.keys.sort == %w[display_name expected_revision]
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        name, revision = input.values_at("display_name", "expected_revision")
        unless (name.nil? || (name.is_a?(String) && name.length.between?(1, 256) &&
          name.match?(/\A[^[:cntrl:]]+\z/) && !name.strip.empty?)) &&
            revision.is_a?(Integer) && revision.between?(0, 2_147_483_646)
          raise Elevateo::CollaborationError.new("request_invalid")
        end
        [name, revision]
      end

      def self.projection(result)
        unless result.is_a?(Hash) && %w[display_name revision status].all? { |key| result.key?(key) }
          raise Elevateo::CollaborationError.new("internal_error")
        end
        name, revision = result.values_at("display_name", "revision")
        unless (name.nil? || (name.is_a?(String) && name.length.between?(1, 256) &&
          name.match?(/\A[^[:cntrl:]]+\z/) && !name.strip.empty?)) &&
            revision.is_a?(Integer) && revision.between?(0, 2_147_483_647)
          raise Elevateo::CollaborationError.new("internal_error")
        end
        [name, revision]
      end

      private

      def sql_result(connection, sql, label, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new(label, value&.to_s, ActiveRecord::Type::String.new)
        end
        row = connection.exec_query(sql, label, binds).first
        result = Elevateo::ThreadProjection.source_json(row && row["result"], 4096)
        raise Elevateo::CollaborationError.new("internal_error") unless result.is_a?(Hash)
        result
      end
    end
  end
end
