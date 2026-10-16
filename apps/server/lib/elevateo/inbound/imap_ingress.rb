# frozen_string_literal: true

require_relative "fake_ingress"
require_relative "imap_mime_parser"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Protocol evidence is worker supplied; SQL maps account to tenant and owns replay/cursor atomicity.
    class ImapIngress
      def initialize(store:, attachment_storage: nil)
        @store = store
        @attachment_storage = attachment_storage
      end

      def ingest(account_id:, credential_version:, uidvalidity:, uid:, raw_mime:)
        unless account_id.is_a?(String) && FakeIngress::UUID.match?(account_id) &&
               credential_version.is_a?(Integer) && credential_version.positive? &&
               uidvalidity.is_a?(Integer) && uidvalidity.positive? &&
               uid.is_a?(Integer) && uid.positive?
          raise Rejected, "invalid_imap_identity"
        end

        parsed_mime = ImapMimeParser.new.parse(raw_mime: raw_mime)
        parsed = parsed_mime.fetch(:record)
        extracted = parsed_mime.fetch(:attachments)
        # @type var handles: Array[staged_attachment]
        handles = []
        unless extracted.empty?
          storage = @attachment_storage
          raise Rejected, "attachment_storage_unavailable" unless storage

          extracted.each do |attachment|
            ordinal = attachment.fetch(:ordinal)
            key = "quarantine/imap/#{account_id.downcase}/#{uidvalidity}/#{uid}/#{ordinal}"
            storage.put_once(key, attachment.fetch(:bytes))
            handles << { ordinal: ordinal, filename: attachment.fetch(:filename),
              content_type: attachment.fetch(:content_type), byte_size: attachment.fetch(:byte_size),
              sha256: attachment.fetch(:sha256), storage_key: key }
          end
        end

        @store.insert_once(account_id: account_id.downcase, credential_version: credential_version,
          uidvalidity: uidvalidity, uid: uid, content_sha256: parsed.fetch(:content_sha256),
          from: parsed.fetch(:from), to: parsed.fetch(:to), subject: parsed.fetch(:subject), text: parsed.fetch(:text),
          attachments: handles)
      end
    end
  end
end
