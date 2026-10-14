# frozen_string_literal: true

require_relative "thread_projection"
require_relative "collaboration_error"

module Elevateo
  # AIDEV-NOTE: Audit output contains role metadata only; SQL alone records changes in the mutation transaction.
  module OrganizationRoleAudit
    ROLE_NAMES = { "owner" => "organization_owner", "admin" => "organization_admin",
      "operator" => "technology_operator", "sales_manager" => "sales_lead",
      "sales" => "sales_member", "auditor" => "security_auditor",
      "associate" => "organization_member" }.freeze
    OPERATION = "replace_organization_grant"

    def self.limit(query)
      raw = query.fetch("limit", "50")
      unless raw.is_a?(String) && /\A(?:[1-9]|[1-4][0-9]|50)\z/.match?(raw)
        raise CollaborationError.new("request_invalid")
      end
      raw.to_i
    end

    def self.items(rows, organization:, limit:)
      raise CollaborationError.new("internal_error") unless rows.is_a?(Array) && rows.length <= limit
      rows.map do |row|
        unless row.is_a?(Hash) && row.keys.sort == %w[actor_user_id id new_role occurred_at old_role operation revision target_user_id]
          raise CollaborationError.new("internal_error")
        end
        old_role, new_role = ROLE_NAMES.values_at(row["old_role"], row["new_role"])
        unless old_role && new_role && old_role != new_role && row["operation"] == OPERATION
          raise CollaborationError.new("internal_error")
        end
        occurred_at = ThreadProjection.timestamp(row["occurred_at"])
        raise CollaborationError.new("internal_error") unless occurred_at
        { "id" => ThreadProjection.uuid(row["id"]), "organization_id" => organization,
          "actor_user_id" => ThreadProjection.uuid(row["actor_user_id"]),
          "target_user_id" => ThreadProjection.uuid(row["target_user_id"]),
          "old_role" => old_role, "new_role" => new_role,
          "revision" => ThreadProjection.integer(row["revision"], 2_147_483_647),
          "operation" => OPERATION, "occurred_at" => occurred_at }
      end
    rescue ReadResponse::Invalid
      raise CollaborationError.new("internal_error")
    end
  end
end
