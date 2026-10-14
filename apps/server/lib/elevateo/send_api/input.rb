# frozen_string_literal: true

require_relative "../write_input"
require_relative "../send_error"

module Elevateo
  module SendAPI
    # AIDEV-NOTE: Snapshot bytes and control epoch are never browser inputs; approval fields are closed.
    class Input
      FIELDS = %w[mailbox_id operation_id expected_version review_digest correspondence_confirmed].freeze
      attr_reader :draft_id, :mailbox_id, :operation_id, :expected_version, :review_digest

      def initialize(draft_id:, input:)
        WriteInput.invalid! unless input.keys.sort == FIELDS.sort
        @draft_id = WriteInput.uuid(draft_id)
        @mailbox_id = WriteInput.uuid(input["mailbox_id"])
        @operation_id = WriteInput.uuid(input["operation_id"])
        version = input["expected_version"]
        WriteInput.invalid! unless version.is_a?(Integer) && version.between?(1, 2_147_483_647)
        @expected_version = version
        digest = input["review_digest"]
        WriteInput.invalid! unless digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(digest)
        @review_digest = digest
        WriteInput.invalid! unless input["correspondence_confirmed"] == true
      rescue CollaborationError
        raise SendError.new("request_invalid")
      end
    end
  end
end
