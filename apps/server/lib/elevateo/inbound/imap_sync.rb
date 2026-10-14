# frozen_string_literal: true

require_relative "imap_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: A verified isolated IMAP session feeds one worker-only SQL receipt per UID; no HTTP route is involved.
    class ImapSync
      MAX_BATCH = 50

      def initialize(store:, transport:)
        @store = store
        @transport = transport
      end

      def run(account_id:, credential_version:)
        claim = @store.claim(account_id: account_id, credential_version: credential_version)
        session = @transport.open(credential_ref: claim.fetch("credential_ref"))
        raise Rejected, "tls_unverified" unless session.verified_tls?

        validity = session.uidvalidity
        raise Rejected, "invalid_imap_identity" unless validity.is_a?(Integer) && validity.positive?

        previous = claim["uidvalidity"]
        cursor = claim.fetch("last_uid")
        if previous && previous != validity
          reset = @store.reset_uidvalidity(account_id: account_id, credential_version: credential_version,
            expected: previous, replacement: validity)
          raise Rejected, "cursor_changed" unless reset

          cursor = 0
        end
        events = session.fetch_after(cursor, limit: MAX_BATCH)
        raise Rejected, "invalid_imap_batch" unless events.is_a?(Array) && events.length <= MAX_BATCH

        ingress = ImapIngress.new(store: @store)
        events.each do |event|
          raise Rejected, "invalid_imap_batch" unless event.is_a?(Hash) && event.keys.sort == %i[raw_mime uid]

          uid = event.fetch(:uid)
          raw = event.fetch(:raw_mime)
          raise Rejected, "invalid_imap_batch" unless uid.is_a?(Integer) && uid > cursor &&
            raw.is_a?(String) && raw.bytesize.between?(1, FakeIngress::MAX_RAW)

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
