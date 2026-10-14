# frozen_string_literal: true

require "active_record"
require_relative "attachments"

module Elevateo
  module Attachments
    # AIDEV-NOTE: Caller owns the authenticated tenant transaction; SQL also checks current compose/RLS rights.
    class Repository
      def initialize(connection:)
        @connection = connection
      end

      def create(organization_id:, mailbox_id:, thread_id:, message_id:, id:, storage_key:,
        filename:, content_type:, byte_size:, sha256:, scan_status:)
        raise Invalid unless scan_status == "pending_scan"
        rows("SELECT app.stage_inbox_attachment($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9::integer,$10)",
          [id, organization_id, mailbox_id, thread_id, message_id, storage_key, filename, content_type, byte_size, sha256])
      end

      def find(organization_id:, mailbox_id:, thread_id:, message_id:, id:)
        rows(<<~SQL, [organization_id, mailbox_id, thread_id, message_id, id]).first
          SELECT id,filename,content_type,byte_size,scan_status FROM app.inbox_attachments
          WHERE organization_id=$1::uuid AND mailbox_id=$2::uuid AND thread_id=$3::uuid
            AND message_id=$4::uuid AND id=$5::uuid LIMIT 1
        SQL
      end

      def page(organization_id:, mailbox_id:, thread_id:, message_id:, cursor:, limit:)
        rows(<<~SQL, [organization_id, mailbox_id, thread_id, message_id, cursor, limit])
          SELECT id,filename,content_type,byte_size,scan_status FROM app.inbox_attachments
          WHERE organization_id=$1::uuid AND mailbox_id=$2::uuid AND thread_id=$3::uuid
            AND message_id=$4::uuid AND ($5::uuid IS NULL OR id>$5::uuid)
          ORDER BY id LIMIT $6::integer
        SQL
      end

      def due_scan_ids(limit:)
        rows("SELECT id FROM app.due_inbox_attachment_scans($1::integer)", [limit]).map do |row|
          id = row["id"]
          raise NotAvailable unless id.is_a?(String)
          id
        end
      end

      def claim_scan(id:, token:)
        rows("SELECT * FROM app.claim_inbox_attachment_scan($1::uuid,$2::uuid)", [id, token]).first
      end

      def record_scan(id:, sha256:, token:, attempt:, verdict:)
        row = rows("SELECT app.record_inbox_attachment_scan($1::uuid,$2,$3::uuid,$4::integer,$5) AS recorded",
          [id, sha256, token, attempt, verdict]).first
        raise NotAvailable unless row && row["recorded"] == true
      end

      private

      def rows(sql, values)
        binds = values.map do |value|
          # The SQL casts numeric placeholders; String bind metadata must receive their text form.
          bind_value = value.is_a?(Integer) ? value.to_s : value
          ActiveRecord::Relation::QueryAttribute.new("attachment", bind_value, ActiveRecord::Type::String.new)
        end
        @connection.exec_query(sql, "Attachment", binds).to_a
      end
    end
  end
end
