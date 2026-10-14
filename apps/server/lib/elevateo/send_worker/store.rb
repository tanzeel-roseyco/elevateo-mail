# frozen_string_literal: true

require "json"
require "securerandom"
require "digest"
require_relative "submission_result"

module Elevateo
  module SendWorker
    Claim = Struct.new(:send_id, :lease_id, :generation, :action, :attempt_id, :snapshot_digest, keyword_init: true)
    Authorization = Struct.new(:attempt_id, :snapshot_bytes, keyword_init: true)

    # AIDEV-NOTE: The worker role only calls owner functions; no raw private-table reads or provider secrets.
    class Store
      def initialize(connection:, lease_seconds: 30, deadline_seconds: 10)
        raise ArgumentError, "invalid worker store" unless connection && lease_seconds.is_a?(Integer) && lease_seconds.between?(1, 120) && deadline_seconds.is_a?(Integer) && deadline_seconds.between?(1, 60)
        @connection = connection
        @lease_seconds = lease_seconds
        @deadline_seconds = deadline_seconds
        @snapshots = {}
      end

      def claim(epoch:)
        due = @connection.exec("SELECT app_send_private.next_due_send()").getvalue(0, 0)
        return nil unless due
        lease = SecureRandom.uuid
        value = object("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,$4::integer)",
          [due, lease, epoch, @lease_seconds])
        return nil if value.key?("code")
        claim = Claim.new(send_id: due, lease_id: lease, generation: Integer(value.fetch("generation")),
          action: value.fetch("action"))
        if claim.action == "reconcile"
          binding = object("SELECT app_send_private.reconciliation_binding($1::uuid,$2::uuid,$3::bigint)",
            [due, lease, claim.generation])
          return nil if binding.key?("code")
          claim.attempt_id = binding.fetch("attempt_id")
          claim.snapshot_digest = binding.fetch("snapshot_digest")
        end
        claim
      end

      def authorize_submission(claim:, epoch:)
        attempt = SecureRandom.uuid
        value = object("SELECT app_send_private.authorize_and_read($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,$6::text,$7::integer)",
          [claim.send_id, claim.lease_id, claim.generation, attempt, epoch, "none", @deadline_seconds])
        return nil if value.key?("code")
        hex = value.fetch("snapshot_hex")
        raise ArgumentError, "invalid worker snapshot" unless hex.is_a?(String) && /\A[0-9a-f]{2,2097152}\z/.match?(hex) && hex.length.even?
        bytes = [hex].pack("H*")
        raise ArgumentError, "invalid worker snapshot" unless bytes.bytesize.between?(1, 1_048_576)
        @snapshots[attempt] = Digest::SHA256.hexdigest(bytes)
        Authorization.new(attempt_id: attempt, snapshot_bytes: bytes)
      end

      def final_check(claim:, attempt_id:, epoch:)
        @connection.exec_params("SELECT app_send_private.final_submission_check($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid)",
          [claim.send_id, claim.lease_id, claim.generation, attempt_id, epoch]).getvalue(0, 0) == "t"
      end

      def record_observation(claim:, attempt_id:, snapshot_digest:, result:)
        raise ArgumentError, "snapshot binding changed" unless @snapshots.fetch(attempt_id) == snapshot_digest
        persist(claim, attempt_id, snapshot_digest, result)
      ensure
        @snapshots.delete(attempt_id)
      end

      def mark_unknown(claim:, attempt_id:, reason:)
        digest = @snapshots.fetch(attempt_id)
        persist(claim, attempt_id, digest, SubmissionResult.new(kind: "unknown", code: reason))
      ensure
        @snapshots.delete(attempt_id)
      end

      def reconcile(claim:, observation:)
        result = observation || SubmissionResult.new(kind: "unknown", code: "local_paused")
        persist(claim, claim.attempt_id, claim.snapshot_digest, result)
      end

      private

      def persist(claim, attempt_id, digest, result)
        evidence = result.evidence_digest(send_id: claim.send_id, attempt_id: attempt_id, snapshot_digest: digest)
        value = object("SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,$6::text,$7::text,decode($8::text,'hex'))",
          [claim.send_id, claim.lease_id, claim.generation, SecureRandom.uuid, attempt_id, result.kind, result.receipt_ref, evidence])
        raise ArgumentError, "stale worker observation" if value.key?("code")
        value
      end

      def object(sql, values)
        value = JSON.parse(@connection.exec_params(sql, values).getvalue(0, 0))
        raise ArgumentError, "invalid worker SQL result" unless value.is_a?(Hash)
        value
      end
    end
  end
end
