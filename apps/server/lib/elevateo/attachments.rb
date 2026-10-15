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

    # AIDEV-NOTE: Uploads remain private; only ScanService may record the independent scanner's clean verdict.
    class Service
      def initialize(repository:, storage:, authorize:)
        @repository, @storage, @authorize = repository, storage, authorize
      end

      def stage(organization_id:, mailbox_id:, thread_id:, message_id:, filename:, content_type:, bytes:)
        scope = scope!(organization_id, mailbox_id, thread_id, message_id)
        authorize!(scope, :write)
        validate!(filename, content_type, bytes)
        id = SecureRandom.uuid
        key = "quarantine/#{scope.fetch(:organization_id)}/#{id}"
        @storage.put(key, bytes, content_type: "application/octet-stream")
        # AIDEV-NOTE: An ambiguous DB commit may reference the object; leave it quarantined for reconciliation.
        authorize!(scope, :write)
        @repository.create(organization_id: scope.fetch(:organization_id), mailbox_id: scope.fetch(:mailbox_id),
          thread_id: scope.fetch(:thread_id), message_id: scope.fetch(:message_id), id: id, storage_key: key, filename: filename,
          content_type: content_type, byte_size: bytes.bytesize, sha256: Digest::SHA256.hexdigest(bytes),
          scan_status: "pending_scan")
        { "id" => id, "scan_status" => "pending_scan" }
      end

      def list(organization_id:, mailbox_id:, thread_id:, message_id:, cursor: nil, limit: 50)
        scope = scope!(organization_id, mailbox_id, thread_id, message_id)
        raise Invalid unless limit.is_a?(Integer) && limit.between?(1, 50)
        raise Invalid if cursor && (!cursor.is_a?(String) || !UUID.match?(cursor))
        authorize!(scope, :read)
        rows = @repository.page(organization_id: scope.fetch(:organization_id), mailbox_id: scope.fetch(:mailbox_id),
          thread_id: scope.fetch(:thread_id), message_id: scope.fetch(:message_id), cursor: cursor, limit: limit + 1)
        raise Invalid unless rows.is_a?(Array) && rows.length <= limit + 1
        visible = rows.first(limit)
        { "items" => visible.map do |row|
            { "id" => row.fetch("id"), "filename" => row.fetch("filename"),
              "content_type" => row.fetch("content_type"), "byte_size" => byte_size!(row),
              "scan_status" => row.fetch("scan_status") }
          end,
          "next_cursor" => rows.length > limit ? visible.fetch(-1).fetch("id") : nil }
      end

      def assert_downloadable(organization_id:, mailbox_id:, thread_id:, message_id:, id:)
        scope = scope!(organization_id, mailbox_id, thread_id, message_id)
        raise Invalid unless UUID.match?(id.to_s)
        authorize!(scope, :read)
        row = @repository.find(organization_id: scope.fetch(:organization_id), mailbox_id: scope.fetch(:mailbox_id),
          thread_id: scope.fetch(:thread_id), message_id: scope.fetch(:message_id), id: id)
        raise NotAvailable unless row
        raise Held unless row.fetch("scan_status") == "clean"
        # AIDEV-NOTE: Sabine's gateway separately rechecks authority and resolves private key; API gets safe metadata only.
        { "id" => row.fetch("id"), "filename" => row.fetch("filename"),
          "content_type" => row.fetch("content_type"), "byte_size" => byte_size!(row) }
      end

      private

      def scope!(organization_id, mailbox_id, thread_id, message_id)
        raise Invalid unless [organization_id, mailbox_id, thread_id, message_id].all? { |value| value.is_a?(String) && UUID.match?(value) }
        { organization_id: organization_id, mailbox_id: mailbox_id, thread_id: thread_id, message_id: message_id }
      end

      def authorize!(scope, capability)
        @authorize.call(organization_id: scope.fetch(:organization_id), mailbox_id: scope.fetch(:mailbox_id),
          thread_id: scope.fetch(:thread_id), message_id: scope.fetch(:message_id), capability: capability)
      end

      def byte_size!(row)
        size = row.fetch("byte_size")
        # AIDEV-NOTE: V2 rejected metadata represents a refused import with no stored object, so its size must be zero.
        valid = row.fetch("scan_status") == "rejected" ? size == 0 : size.is_a?(Integer) && size.between?(1, MAX_BYTES)
        raise Invalid unless size.is_a?(Integer) && valid
        size
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
