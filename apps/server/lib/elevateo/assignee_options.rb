# frozen_string_literal: true

require_relative "collaboration_error"
require_relative "thread_projection"

module Elevateo
  # AIDEV-NOTE: SQL owns current actor and target eligibility; projection only closes the public UUID page shape.
  module AssigneeOptions
    MAX_PAGE = 50
    MAX_RESULT_BYTES = 8192

    def self.limit(query)
      raw = query.fetch("limit", "50")
      raise CollaborationError.new("request_invalid") unless /\A(?:[1-9]|[1-4][0-9]|50)\z/.match?(raw)

      raw.to_i
    end

    def self.position(value)
      raw = value["user_id"]
      unless value.keys == ["user_id"] && raw.is_a?(String) && Cursors::UUID.match?(raw)
        raise CollaborationError.new("cursor_invalid")
      end
      raw.downcase
    end

    def self.project(result, after:, limit:)
      unless result.is_a?(Hash) && result.keys.sort == %w[items next_user_id status] && result["status"] == "ok"
        raise CollaborationError.new("internal_error")
      end
      rows = result["items"]
      raise CollaborationError.new("internal_error") unless rows.is_a?(Array) && rows.length <= limit

      previous = after
      items = rows.map do |row|
        raise CollaborationError.new("internal_error") unless row.is_a?(Hash) && row.keys == ["user_id"]

        user_id = ThreadProjection.uuid(row["user_id"])
        raise CollaborationError.new("internal_error") if previous && previous >= user_id

        previous = user_id
        { "user_id" => user_id }
      end
      next_id = result["next_user_id"]
      unless next_id.nil? || (next_id.is_a?(String) && !items.empty? &&
          ThreadProjection.uuid(next_id) == items.last.fetch("user_id"))
        raise CollaborationError.new("internal_error")
      end
      [items, next_id.nil? ? nil : items.last.fetch("user_id")]
    rescue ReadResponse::Invalid
      raise CollaborationError.new("internal_error")
    end
  end
end
