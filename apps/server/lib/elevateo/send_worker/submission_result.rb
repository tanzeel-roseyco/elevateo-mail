# frozen_string_literal: true

require "digest"
require "json"

module Elevateo
  module SendWorker
    class SubmissionResult
      KINDS = %w[accepted rejected unknown].freeze
      REJECTION_CODES = %w[local_rejected smtp_invalid_snapshot resend_rejected].freeze
      UNKNOWN_CODES = %w[local_timeout local_paused deadline_expired smtp_uncertain resend_unknown].freeze
      attr_reader :kind, :receipt_ref, :code

      # AIDEV-NOTE: Only normalized simulated evidence crosses this seam; acceptance never means delivery.
      def initialize(kind:, receipt_ref: nil, code: nil)
        valid = case kind
                when "accepted"
                  receipt_ref.is_a?(String) && (/\A(?:local:|mailpit-test-v1:|mox-test-v1:)[0-9a-f]{64}\z/.match?(receipt_ref) ||
                    /\Aresend:[A-Za-z0-9_-]{1,128}\z/.match?(receipt_ref)) && code.nil?
                when "rejected" then receipt_ref.nil? && REJECTION_CODES.include?(code)
                when "unknown" then receipt_ref.nil? && UNKNOWN_CODES.include?(code)
                else false
                end
        raise ArgumentError, "invalid submission result" unless valid
        @kind = kind.dup.freeze
        @receipt_ref = receipt_ref&.dup&.freeze
        @code = code&.dup&.freeze
        freeze
      end

      def simulated? = !receipt_ref&.start_with?("resend:")

      def evidence_digest(send_id:, attempt_id:, snapshot_digest:)
        Digest::SHA256.hexdigest(JSON.generate(["elevateo.local.observation.v1", send_id, attempt_id,
          snapshot_digest, kind, receipt_ref, code]))
      end
    end
  end
end
