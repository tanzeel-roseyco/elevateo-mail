# frozen_string_literal: true

require "digest"
require_relative "control"
require_relative "call_deadline"

module Elevateo
  module SendWorker
    # The store owns transactions, leases, authorization, and durable observations.
    # The driver is deliberately restricted to the local simulated profile.
    class Executor
      def initialize(store:, driver:, control:, budget_seconds: 10, deadline_factory: nil)
        raise ArgumentError, "invalid worker dependencies" unless store && driver && control
        @store = store
        @driver = driver
        @control = control
        @deadline_factory = deadline_factory || -> { CallDeadline.new(seconds: budget_seconds.to_f) }
      end

      # One invocation processes at most one claim. A nil claim means no eligible work.
      def run_once
        state = @control.read
        return :held unless state.submission_allowed?
        claim = @store.claim(epoch: state.epoch)
        return :idle unless claim
        validate_claim!(claim)
        return reconcile(claim) if claim.action == "reconcile"

        # AIDEV-NOTE: The store must atomically recheck consent, suppression, grants, capability and cancellation.
        authorization = @store.authorize_submission(claim: claim, epoch: state.epoch)
        return :held unless authorization
        validate_authorization!(authorization, claim)
        current = @control.read
        unless current.submission_allowed? && current.epoch == state.epoch
          @store.mark_unknown(claim: claim, attempt_id: authorization.attempt_id, reason: "local_paused")
          return :held
        end
        # Final SQL fence repeats current authority and cancellation immediately before local I/O.
        unless @store.final_check(claim: claim, attempt_id: authorization.attempt_id, epoch: state.epoch)
          @store.mark_unknown(claim: claim, attempt_id: authorization.attempt_id, reason: "local_paused")
          return :held
        end

        result = @driver.submit(authorization.snapshot_bytes, send_id: claim.send_id,
          attempt_id: authorization.attempt_id, deadline: @deadline_factory.call)
        @store.record_observation(claim: claim, attempt_id: authorization.attempt_id,
          snapshot_digest: Digest::SHA256.hexdigest(authorization.snapshot_bytes), result: result)
        result.kind.to_sym
      rescue CallDeadline::Expired
        # The call may have reached a provider before its response disappeared.
        @store.mark_unknown(claim: claim, attempt_id: authorization.attempt_id, reason: "deadline_expired")
        :unknown
      end

      private

      def reconcile(claim)
        # AIDEV-NOTE: Reconciliation queries exact attempt evidence; it never submits again.
        observation = @driver.observation(send_id: claim.send_id, attempt_id: claim.attempt_id,
          snapshot_digest: claim.snapshot_digest)
        @store.reconcile(claim: claim, observation: observation)
        observation ? observation.kind.to_sym : :unknown
      end

      def validate_claim!(claim)
        valid = Control.valid_epoch?(claim.send_id) && %w[submit reconcile].include?(claim.action)
        if claim.action == "reconcile"
          valid &&= Control.valid_epoch?(claim.attempt_id) &&
            claim.snapshot_digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(claim.snapshot_digest)
        end
        raise ArgumentError, "invalid worker claim" unless valid
      end

      def validate_authorization!(authorization, claim)
        valid = Control.valid_epoch?(authorization.attempt_id) &&
          authorization.snapshot_bytes.is_a?(String) &&
          authorization.snapshot_bytes.bytesize.between?(1, 1_048_576) &&
          authorization.snapshot_bytes.dup.force_encoding(Encoding::UTF_8).valid_encoding? &&
          claim.action == "submit"
        raise ArgumentError, "invalid worker authorization" unless valid
      end
    end
  end
end
