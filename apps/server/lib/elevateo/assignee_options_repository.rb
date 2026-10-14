# frozen_string_literal: true

require_relative "assignee_options"

module Elevateo
  # AIDEV-NOTE: This literal SQL call has no fallback; the V2 route stays gated until Sabine installs authority.
  class AssigneeOptionsRepository
    PAGE_SQL = "SELECT app.assignment_member_options($1::text,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6::uuid,$7::uuid,$8::uuid,$9::integer) AS result"

    def initialize(connection:)
      @connection = connection
    end

    def page(digest:, user_id:, auth_session_id:, context_id:, generation:, organization_id:, mailbox_id:, after_user_id:, limit:)
      values = [digest, user_id, auth_session_id, context_id, generation, organization_id, mailbox_id, after_user_id, limit]
      binds = values.map do |value|
        ActiveRecord::Relation::QueryAttribute.new("assignee_options", value&.to_s, ActiveRecord::Type::String.new)
      end
      row = @connection.exec_query(PAGE_SQL, "mailbox assignee options", binds).first
      result = ThreadProjection.source_json(row && row["result"], AssigneeOptions::MAX_RESULT_BYTES)
      raise CollaborationError.new("internal_error") unless result.is_a?(Hash)

      result
    rescue ReadResponse::Invalid
      raise CollaborationError.new("internal_error")
    end
  end
end
