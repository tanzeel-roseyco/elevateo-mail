# frozen_string_literal: true

require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Protocol evidence is worker supplied; SQL maps account to tenant and owns replay/cursor atomicity.
    class ImapIngress
      DUMMY_SCOPE = "00000000-0000-4000-8000-000000000000"

      class Capture
        attr_reader :record

        def insert_once(record)
          @record = record
          {}
        end
      end

      def initialize(store:)
        @store = store
      end

      def ingest(account_id:, credential_version:, uidvalidity:, uid:, raw_mime:)
        unless account_id.is_a?(String) && FakeIngress::UUID.match?(account_id) &&
               credential_version.is_a?(Integer) && credential_version.positive? &&
               uidvalidity.is_a?(Integer) && uidvalidity.positive? &&
               uid.is_a?(Integer) && uid.positive?
          raise Rejected, "invalid_imap_identity"
        end

        capture = Capture.new
        FakeIngress.new(store: capture).ingest(organization_id: DUMMY_SCOPE, mailbox_id: DUMMY_SCOPE,
          authorized_mailbox_ids: [DUMMY_SCOPE], provider_account_id: "imap", provider_event_id: "u#{uid}",
          raw_mime: raw_mime)
        parsed = capture.record
        raise Rejected, "invalid_mime" unless parsed
        # Attachments need quarantine/storage before IMAP import; never silently discard their bytes.
        raise Rejected, "unsupported_mime" unless parsed.fetch(:attachments).empty?

        @store.insert_once(account_id: account_id.downcase, credential_version: credential_version,
          uidvalidity: uidvalidity, uid: uid, content_sha256: parsed.fetch(:content_sha256),
          from: parsed.fetch(:from), to: parsed.fetch(:to), subject: parsed.fetch(:subject), text: parsed.fetch(:text))
      end
    end
  end
end
