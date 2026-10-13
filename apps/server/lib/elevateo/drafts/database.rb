# frozen_string_literal: true

require_relative "../thread_projection"

module Elevateo
  class Drafts
    # AIDEV-NOTE: The caller owns snapshot/guard lifetime; this adapter only binds values and bounds JSON results.
    class Database
      def initialize(connection:, session:)
        @connection = connection
        @session = session
      end

      def rows(sql, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("draft", value, ActiveRecord::Type::String.new)
        end
        @connection.exec_query(sql, "Draft operation", binds).to_a
      end

      def object(sql, values)
        row = rows(sql, values).first
        raise ReadResponse::Invalid, "invalid draft result" unless row
        value = ThreadProjection.source_json(row["result"], 4096)
        raise ReadResponse::Invalid, "invalid draft result" unless value.is_a?(Hash)
        value
      end

      def envelope
        %w[context_id authorization_version].to_h do |key|
          value = @session[key]
          unless value.is_a?(String) && value.ascii_only? && Cursors::TOKEN.match?(value)
            raise ReadResponse::Invalid, "invalid draft context"
          end
          [key, value]
        end
      end

      def authorize(mailbox, draft = nil)
        row = rows("SELECT app.draft_scope($1::uuid, $2::uuid) AS allowed", [mailbox, draft]).first
        raise CollaborationError.new("not_available") unless row && row["allowed"] == true
      end

      def encode(value, budget:)
        result = JSON.generate(value, allow_nan: false)
        raise ReadResponse::Overflow, "draft response exceeds budget" if result.bytesize > budget
        result
      end
    end
  end
end
