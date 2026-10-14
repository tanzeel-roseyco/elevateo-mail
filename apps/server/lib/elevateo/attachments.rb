# frozen_string_literal: true

require "securerandom"
require "digest"

module Elevateo
  module Attachments
    MAX_BYTES = 10 * 1024 * 1024
    TYPES = { "application/pdf" => "%PDF-", "image/png" => "\x89PNG\r\n\x1a\n".b,
      "image/jpeg" => "\xFF\xD8\xFF".b, "text/plain" => nil }.freeze
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i
    NAME = /[\x00-\x1f\x7f\\\/]/

    class Invalid < StandardError; end
    class NotAvailable < StandardError; end
    class Held < StandardError; end

    # AIDEV-NOTE: Storage is private and has no scanner today; only an independent scanner may record clean.
    class Service
      def initialize(repository:, storage:, authorize:)
        @repository, @storage, @authorize = repository, storage, authorize
      end

      def stage(organization_id:, mailbox_id:, thread_id:, message_id:, filename:, content_type:, bytes:)
        scope = scope!(organization_id, mailbox_id, thread_id, message_id)
        @authorize.call(**scope, capability: :write)
        validate!(filename, content_type, bytes)
        id = SecureRandom.uuid
        key = "quarantine/#{scope.fetch(:organization_id)}/#{id}"
        @storage.put(key, bytes, content_type: "application/octet-stream")
        begin
          @authorize.call(**scope, capability: :write)
          @repository.create(**scope, id: id, storage_key: key, filename: filename,
            content_type: content_type, byte_size: bytes.bytesize, sha256: Digest::SHA256.hexdigest(bytes),
            scan_status: "pending_scan")
        rescue StandardError
          @storage.delete(key)
          raise
        end
        { "id" => id, "scan_status" => "pending_scan" }
      end

      def list(organization_id:, mailbox_id:, thread_id:, message_id:, cursor: nil, limit: 50)
        scope = scope!(organization_id, mailbox_id, thread_id, message_id)
        raise Invalid unless limit.is_a?(Integer) && limit.between?(1, 50)
        raise Invalid if cursor && (!cursor.is_a?(String) || !UUID.match?(cursor))
        @authorize.call(**scope, capability: :read)
        rows = @repository.page(**scope, cursor: cursor, limit: limit + 1)
        raise Invalid unless rows.is_a?(Array) && rows.length <= limit + 1
        visible = rows.first(limit)
        { "items" => visible.map do |row|
            { "id" => row.fetch("id"), "filename" => row.fetch("filename"),
              "content_type" => row.fetch("content_type"), "byte_size" => row.fetch("byte_size").to_i,
              "scan_status" => row.fetch("scan_status") }
          end,
          "next_cursor" => rows.length > limit ? visible.last.fetch("id") : nil }
      end

      def download(organization_id:, mailbox_id:, thread_id:, message_id:, id:)
        scope = scope!(organization_id, mailbox_id, thread_id, message_id)
        raise Invalid unless UUID.match?(id.to_s)
        @authorize.call(**scope, capability: :read)
        row = @repository.find(**scope, id: id)
        raise NotAvailable unless row
        raise Held unless row.fetch("scan_status") == "clean"
        # AIDEV-NOTE: The caller must repeat current authorization per request; never expose the private object key.
        [@storage.get(row.fetch("storage_key")), row.fetch("content_type"), row.fetch("filename")]
      end

      private

      def scope!(organization_id, mailbox_id, thread_id, message_id)
        values = { organization_id: organization_id, mailbox_id: mailbox_id,
          thread_id: thread_id, message_id: message_id }
        raise Invalid unless values.values.all? { |value| value.is_a?(String) && UUID.match?(value) }
        values
      end

      def validate!(filename, content_type, bytes)
        raise Invalid unless filename.is_a?(String) && filename.valid_encoding? && filename.encoding == Encoding::UTF_8 &&
          filename.bytesize.between?(1, 255) && filename.strip == filename && !NAME.match?(filename) &&
          filename != "." && filename != ".."
        magic = TYPES[content_type]
        raise Invalid unless TYPES.key?(content_type) && bytes.is_a?(String) && bytes.bytesize.between?(1, MAX_BYTES)
        raise Invalid if magic && !bytes.b.start_with?(magic)
        raise Invalid if content_type == "text/plain" && (!bytes.dup.force_encoding(Encoding::UTF_8).valid_encoding? || bytes.include?("\x00"))
      end
    end
  end
end
