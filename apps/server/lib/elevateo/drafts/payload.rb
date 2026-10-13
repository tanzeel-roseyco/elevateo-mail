# frozen_string_literal: true

require "digest"
require "json"
require_relative "../write_input"

module Elevateo
  class Drafts
    # AIDEV-NOTE: Normalize only UUIDs/integer spelling; unsent content preserves every Unicode scalar and null.
    class Payload
      FIELDS = %w[mailbox_id operation_id expected_version subject to body_text reply_to_thread_id].freeze
      attr_reader :draft_id, :mailbox_id, :operation_id, :expected_version, :subject, :recipients, :body_text, :reply_id

      def initialize(draft_id:, input:)
        WriteInput.invalid! unless input.keys.sort == FIELDS.sort
        @draft_id = WriteInput.uuid(draft_id)
        @mailbox_id = WriteInput.uuid(input["mailbox_id"])
        @operation_id = WriteInput.uuid(input["operation_id"])
        @expected_version = WriteInput.integer(input["expected_version"], minimum: 0, maximum: 2_147_483_647)
        @subject = WriteInput.text(input["subject"], maximum: 998, empty: true)
        @body_text = WriteInput.text(input["body_text"], maximum: 65_536, empty: true)
        @reply_id = input["reply_to_thread_id"].nil? ? nil : WriteInput.uuid(input["reply_to_thread_id"])
        @recipients = addresses(input["to"])
      end

      def canonical_bytes
        # AIDEV-NOTE: Ruby JSON emits raw UTF-8/slashes/U+2028 and canonical short/control escapes, with no whitespace.
        JSON.generate([mailbox_id, draft_id, expected_version, subject,
                       recipients.map { |item| [item["display_name"], item["address"]] }, body_text, reply_id])
      end

      def digest = Digest::SHA256.hexdigest(canonical_bytes)

      private

      def addresses(value)
        WriteInput.invalid! unless value.is_a?(Array) && value.length <= 100
        value.map do |item|
          WriteInput.invalid! unless item.is_a?(Hash) && item.keys.sort == %w[address display_name]
          %w[display_name address].to_h do |key|
            field = item[key]
            [key, field.nil? ? nil : WriteInput.text(field, maximum: 256, empty: true)]
          end
        end
      end
    end
  end
end
