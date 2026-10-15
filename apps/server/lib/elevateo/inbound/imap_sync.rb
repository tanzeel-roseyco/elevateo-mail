# frozen_string_literal: true

require_relative "imap_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: A verified isolated IMAP session feeds one worker-only SQL receipt per UID; no HTTP route is involved.
    class ImapSync
      MAX_BATCH = 50
      MAX_UID = 4_294_967_295

      def initialize(store:, transport:, attachment_storage: nil)
        @store = store
        @transport = transport
        @attachment_storage = attachment_storage
      end

      def run(account_id:, credential_version:)
        # @type var session: _ImapSession?
        session = nil
        claim = @store.claim(account_id: account_id, credential_version: credential_version)
        opened = @transport.open(binding: claim.fetch("binding"))
        session = opened
        raise Rejected, "tls_unverified" unless opened.verified_tls?

        validity = opened.uidvalidity
        raise Rejected, "invalid_imap_identity" unless validity.is_a?(Integer) && validity.between?(1, MAX_UID)

        previous = claim["uidvalidity"]
        cursor = claim.fetch("last_uid")
        if previous && previous != validity
          reset = @store.reset_uidvalidity(account_id: account_id, credential_version: credential_version,
            expected: previous, replacement: validity)
          raise Rejected, "cursor_changed" unless reset

          cursor = 0
        end
        events = opened.fetch_after(cursor, limit: MAX_BATCH)
        raise Rejected, "invalid_imap_batch" unless events.is_a?(Array) && events.length <= MAX_BATCH

        # AIDEV-NOTE: Validate the whole ordered page before the first commit; a reordered tail must not skip a lower UID.
        previous_uid = cursor
        events.each do |event|
          raise Rejected, "invalid_imap_batch" unless event.is_a?(Hash) && event.keys.sort == %i[raw_mime uid]

          uid = event.fetch(:uid)
          raw = event.fetch(:raw_mime)
          raise Rejected, "invalid_imap_batch" unless uid.is_a?(Integer) && uid.between?(1, MAX_UID) && uid > previous_uid &&
            raw.is_a?(String) && raw.bytesize.between?(1, FakeIngress::MAX_RAW)

          previous_uid = uid
        end

        ingress = ImapIngress.new(store: @store, attachment_storage: @attachment_storage)
        events.each do |event|
          uid = event.fetch(:uid)
          raw = event.fetch(:raw_mime)
          result = ingress.ingest(account_id: account_id, credential_version: credential_version,
            uidvalidity: validity, uid: uid, raw_mime: raw)
          raise Rejected, "cursor_changed" if result.fetch("result") == "uidvalidity_changed"

          cursor = uid
        end
        cursor
      ensure
        session&.close
      end
    end
  end
end
