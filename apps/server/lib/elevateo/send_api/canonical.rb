# frozen_string_literal: true

require "json"
require "digest"

module Elevateo
  module SendAPI
    # AIDEV-NOTE: Canonical order/escaping is shared with SQL vectors, never derived from client JSON spelling.
    module Canonical
      FORMAT = "elevateo.send.snapshot.v1"
      MAXIMUM = 1_048_576

      def self.bytes(organization_id:, mailbox_id:, draft_id:, version:, sender:, recipients:, subject:, body:, reply_id:, policy:)
        JSON.generate([FORMAT, organization_id, mailbox_id, draft_id, version, [nil, sender],
          recipients.map { |item| [item["display_name"], item["address"]] }, subject, body, reply_id,
          "correspondence", "human_correspondence_attestation", [], policy], allow_nan: false)
      end

      def self.digest(bytes) = Digest::SHA256.hexdigest(bytes)
    end
  end
end
