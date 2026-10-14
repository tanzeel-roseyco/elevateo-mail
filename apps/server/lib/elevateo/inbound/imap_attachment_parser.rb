# frozen_string_literal: true

require "digest"
require "mail"
require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Parse only a fully validated isolated MIME event; bytes remain worker-private until quarantine staging.
    class ImapAttachmentParser
      ALLOWED_TYPES = %w[application/pdf image/png image/jpeg text/plain].freeze
      DUMMY_SCOPE = "00000000-0000-4000-8000-000000000000"

      class Capture
        attr_reader :record

        def insert_once(record)
          @record = record
          {}
        end
      end

      def parse(raw_mime:)
        capture = Capture.new
        FakeIngress.new(store: capture).ingest(organization_id: DUMMY_SCOPE,
          mailbox_id: DUMMY_SCOPE, authorized_mailbox_ids: [DUMMY_SCOPE],
          provider_account_id: "imap", provider_event_id: "parsed", raw_mime: raw_mime)
        record = capture.record
        raise Rejected, "invalid_mime" unless record

        mail = Mail.read_from_string(raw_mime)
        parts = leaves(mail)
        attachments = parts.select(&:attachment?)
        expected = record.fetch(:attachments)
        raise Rejected, "invalid_mime" unless attachments.length == expected.length

        values = attachments.each_with_index.map do |part, ordinal|
          metadata = expected.fetch(ordinal)
          type = metadata.fetch(:content_type)
          raise Rejected, "unsupported_mime" unless ALLOWED_TYPES.include?(type)

          bytes = part.decoded.b
          raise Rejected, "oversized_attachment" unless bytes.bytesize.between?(1, FakeIngress::MAX_TEXT)
          raise Rejected, "invalid_mime" unless bytes.bytesize == metadata.fetch(:size) &&
            Digest::SHA256.hexdigest(bytes) == metadata.fetch(:sha256)

          { ordinal: ordinal, filename: metadata.fetch(:filename), content_type: type,
            byte_size: bytes.bytesize, sha256: metadata.fetch(:sha256), bytes: bytes }
        end
        { record: record, attachments: values }
      rescue ArgumentError, EncodingError
        raise Rejected, "invalid_mime"
      end

      private

      def leaves(message)
        stack = [[message, 0]]
        leaves = []
        seen = 0
        until stack.empty?
          frame = stack.pop
          break unless frame

          part, depth = frame
          seen += 1
          raise Rejected, "invalid_mime" if seen > FakeIngress::MAX_PARTS * 2 || depth > 8
          if part.multipart?
            children = part.parts
            raise Rejected, "invalid_mime" if children.empty? || children.length > FakeIngress::MAX_PARTS

            children.reverse_each { |child| stack << [child, depth + 1] }
          else
            leaves << part
            raise Rejected, "invalid_mime" if leaves.length > FakeIngress::MAX_PARTS
          end
        end
        leaves
      end
    end
  end
end
