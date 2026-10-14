# frozen_string_literal: true

require "active_record"

module Elevateo
  module Attachments
    # AIDEV-NOTE: Caller owns the authenticated tenant transaction; SQL also checks current compose/RLS rights.
    class Repository
      def initialize(connection:)
        @connection = connection
      end

      def create(organization_id:, mailbox_id:, thread_id:, message_id:, id:, storage_key:,
        filename:, content_type:, byte_size:, scan_status:)
        raise Invalid unless scan_status == "pending_scan"
        rows("SELECT app.stage_inbox_attachment($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::integer)",
          [id, organization_id, mailbox_id, thread_id, message_id, storage_key, filename, content_type, byte_size])
      end

      def find(organization_id:, mailbox_id:, thread_id:, message_id:, id:)
        rows(<<~SQL, [organization_id, mailbox_id, thread_id, message_id, id]).first
          SELECT storage_key,filename,content_type,scan_status FROM app.inbox_attachments
          WHERE organization_id=$1::uuid AND mailbox_id=$2::uuid AND thread_id=$3::uuid
            AND message_id=$4::uuid AND id=$5::uuid LIMIT 1
        SQL
      end

      private

      def rows(sql, values)
        binds = values.map do |value|
          ActiveRecord::Relation::QueryAttribute.new("attachment", value, ActiveRecord::Type::String.new)
        end
        @connection.exec_query(sql, "Attachment", binds).to_a
      end
    end
  end
end
