# frozen_string_literal: true

require "digest"
require_relative "control"
require_relative "call_deadline"
require_relative "submission_result"

module Elevateo
  module SendWorker
    class LocalFailureDriver
      OUTCOMES = %w[accept reject accept_then_timeout pause].freeze
      MAX_INVOCATIONS = 100
      attr_reader :invocations

      # AIDEV-NOTE: Explicit local-only profile; this bounded memory fixture is never a durable acceptance ledger.
      def initialize(profile:, outcomes:, pause: -> {})
        unless profile == "local" && outcomes.is_a?(Array) && outcomes.length.between?(1, MAX_INVOCATIONS) &&
            outcomes.all? { |outcome| outcome.is_a?(String) && OUTCOMES.include?(outcome) } && pause.is_a?(Proc)
          raise ArgumentError, "invalid offline driver configuration"
        end
        @outcomes = outcomes.map { |outcome| outcome.dup.freeze }.freeze
        @pause = pause
        @invocations = 0
        @mutex = Mutex.new
        @snapshots = {}
        @attempts = {}
        @accepted = {}
      end

      def submit(immutable_snapshot_bytes, send_id:, attempt_id:, deadline:)
        unless [immutable_snapshot_bytes, send_id, attempt_id].all? { |value| value.is_a?(String) }
          raise ArgumentError, "invalid local submission binding"
        end
        immutable_snapshot_bytes = immutable_snapshot_bytes.dup.freeze
        send_id = send_id.dup.freeze
        attempt_id = attempt_id.dup.freeze
        validate!(immutable_snapshot_bytes, send_id, attempt_id)
        deadline.check!
        digest = Digest::SHA256.hexdigest(immutable_snapshot_bytes)
        outcome = @mutex.synchronize { reserve!(send_id, attempt_id, digest) }
        deadline.check!
        result = execute(outcome, send_id, attempt_id, digest)
        deadline.check!
        result
      rescue CallDeadline::Expired
        SubmissionResult.new(kind: "unknown", code: "deadline_expired")
      end

      # AIDEV-NOTE: Recovery only exposes an earlier scripted acceptance for its exact attempt and snapshot binding.
      def observation(send_id:, attempt_id:, snapshot_digest:)
        binding = @mutex.synchronize { @attempts[attempt_id] }
        return nil unless binding == [send_id, snapshot_digest]
        receipt = @mutex.synchronize { @accepted[attempt_id] }
        receipt ? SubmissionResult.new(kind: "accepted", receipt_ref: receipt) : nil
      end

      private

      # AIDEV-NOTE: Reserve under one mutex; pause callbacks and deadline checks never hold the fixture lock.
      def reserve!(send_id, attempt_id, digest)
        previous = @snapshots[send_id]
        raise ArgumentError, "changed immutable local snapshot" if previous && previous != digest
        raise ArgumentError, "duplicate local attempt" if @attempts.key?(attempt_id)
        outcome = @outcomes[@invocations]
        raise ArgumentError, "offline script exhausted" unless outcome
        @snapshots[send_id.dup.freeze] = digest.freeze
        # @type var binding: [String, String]
        binding = [send_id.dup.freeze, digest]
        @attempts[attempt_id.dup.freeze] = binding.freeze
        @invocations += 1
        outcome
      end

      def validate!(bytes, send_id, attempt_id)
        unless Control.valid_epoch?(send_id) && Control.valid_epoch?(attempt_id) && bytes.is_a?(String) &&
            bytes.bytesize.between?(1, 1_048_576) && bytes.dup.force_encoding(Encoding::UTF_8).valid_encoding?
          raise ArgumentError, "invalid local submission binding"
        end
      end

      def execute(outcome, send_id, attempt_id, digest)
        case outcome
        when "accept", "accept_then_timeout"
          receipt = "local:#{Digest::SHA256.hexdigest([send_id, digest].join(':'))}"
          @mutex.synchronize { @accepted[attempt_id.dup.freeze] = receipt.freeze }
          return SubmissionResult.new(kind: "unknown", code: "local_timeout") if outcome == "accept_then_timeout"
          SubmissionResult.new(kind: "accepted", receipt_ref: receipt)
        when "reject" then SubmissionResult.new(kind: "rejected", code: "local_rejected")
        else
          @pause.call
          SubmissionResult.new(kind: "unknown", code: "local_paused")
        end
      end
    end
  end
end
