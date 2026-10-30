# frozen_string_literal: true

require_relative "../thread_projection"

module Elevateo
  class Drafts
    # AIDEV-NOTE: Reuse B's UUID/address/time boundary; drafts intentionally allow complete empty unsent content.
    module Projection
      def self.draft(row, summary:)
        subject = ThreadProjection.text(row["subject"], 998)
        version = ThreadProjection.integer(row["version"], 2_147_483_647)
        state = row["state"]
        unless version.positive? && state.is_a?(String) && %w[editable consumed].include?(state)
          raise ReadResponse::Invalid, "invalid draft state"
        end
        # @type var result: ReadResponse::item
        result = { "id" => ThreadProjection.uuid(row["id"]), "mailbox_id" => ThreadProjection.uuid(row["mailbox_id"]),
                   "subject" => summary ? subject.slice(0, 256) : subject,
                   "reply_to_thread_id" => row["reply_to_thread_id"].nil? ? nil : ThreadProjection.uuid(row["reply_to_thread_id"]),
                   "version" => version, "state" => state, "updated_at" => timestamp(row["updated_at"]) }
        if summary
          result["subject_truncated"] = subject.length > 256
        else
          recipients = ThreadProjection.source_json(row["recipients"], 1_048_576)
          raise ReadResponse::Invalid, "invalid draft recipients" unless recipients.is_a?(Array) && recipients.length <= 100
          result["to"] = recipients.map { |item| ThreadProjection.address(item, nullable: false) }
          result["body_text"] = ThreadProjection.text(row["body_text"], 65_536)
          result["created_at"] = timestamp(row["created_at"])
        end
        result
      end

      def self.timestamp(value)
        result = ThreadProjection.timestamp(value)
        raise ReadResponse::Invalid, "missing draft time" unless result
        result
      end
    end
  end
end
