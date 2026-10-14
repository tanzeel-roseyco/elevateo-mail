# frozen_string_literal: true

require "json"
require "securerandom"
require "digest"
require_relative "control"

module Elevateo
  module SendWorker
    Claim = Struct.new(:send_id, :action, :lease_id, :generation, :attempt_id, :snapshot_digest, keyword_init: true)
    Authorization = Struct.new(:attempt_id, :snapshot_bytes, keyword_init: true)

    class DatabaseStore
      class InvalidResult < StandardError; end
      class StaleLease < StandardError; end

      def self.next_due_send(connection:, epoch:)
        raise ArgumentError, "invalid dispatch epoch" unless Control.valid_epoch?(epoch)
        value = connection.exec_params("SELECT app_send_private.next_due_send($1::uuid)", [epoch]).getvalue(0, 0)
        return nil if value.nil?
        raise InvalidResult unless Control.valid_epoch?(value)
        value
      end

      # AIDEV-NOTE: This connection must authenticate as elevateo_worker; each function commits before provider I/O.
      def initialize(connection:, send_id:, lease_seconds: 30, deadline_seconds: 10)
        raise ArgumentError, "invalid send identity" unless Control.valid_epoch?(send_id)
        raise ArgumentError, "invalid lease budget" unless lease_seconds.is_a?(Integer) && lease_seconds.between?(1, 120)
        raise ArgumentError, "invalid call budget" unless deadline_seconds.is_a?(Integer) && deadline_seconds.between?(1, 10)
        @connection, @send_id = connection, send_id
        @lease_seconds, @deadline_seconds = lease_seconds, deadline_seconds
      end

      def claim(epoch:)
        lease_id = SecureRandom.uuid
        value = call("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,$4::integer)",
          [@send_id, lease_id, epoch, @lease_seconds])
        return nil if %w[not_due lease_busy not_available dispatch_held reconcile_required].include?(value["code"])
        require_fields(value, %w[send_id lease_id generation action attempts simulated])
        raise InvalidResult unless value["send_id"] == @send_id && value["lease_id"] == lease_id &&
          value["generation"].is_a?(Integer) && value["generation"].positive? &&
          %w[submit reconcile].include?(value["action"]) && value["simulated"] == true
        binding = call("SELECT app_send_private.worker_binding($1::uuid,$2::uuid,$3::bigint,$4::uuid)",
          [@send_id, lease_id, value["generation"], epoch])
        require_fields(binding, %w[send_id action attempt_id snapshot_digest])
        raise InvalidResult unless binding["send_id"] == @send_id && binding["action"] == value["action"]
        Claim.new(send_id: @send_id, action: value["action"], lease_id: lease_id,
          generation: value["generation"], attempt_id: binding["attempt_id"],
          snapshot_digest: binding["snapshot_digest"])
      end

      def authorize_submission(claim:, epoch:)
        attempt_id = SecureRandom.uuid
        binding = call("SELECT app_send_private.worker_binding($1::uuid,$2::uuid,$3::bigint,$4::uuid)",
          [claim.send_id, claim.lease_id, claim.generation, epoch])
        return nil if binding["code"]
        require_fields(binding, %w[send_id action snapshot_hex snapshot_digest])
        raise InvalidResult unless binding["send_id"] == claim.send_id && binding["action"] == "submit"
        bytes = [binding["snapshot_hex"]].pack("H*")
        raise InvalidResult unless Digest::SHA256.hexdigest(bytes) == binding["snapshot_digest"]
        result = call("SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid," \
          "decode($6::text,'hex'),$7::text,$8::integer)",
          [claim.send_id, claim.lease_id, claim.generation, attempt_id, epoch,
            Digest::SHA256.hexdigest("local:synthetic-v1"), "synthetic-v1", @deadline_seconds])
        return nil if result["code"] == "dispatch_held"
        require_fields(result, %w[attempt_id attempt_no call_deadline_at simulated])
        raise InvalidResult unless result["attempt_id"] == attempt_id && result["simulated"] == true
        Authorization.new(attempt_id: attempt_id, snapshot_bytes: bytes)
      end

      def final_check(claim:, attempt_id:, epoch:)
        value = call("SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid)",
          [claim.send_id, claim.lease_id, claim.generation, attempt_id, epoch])
        return true if value == { "allowed" => true }
        return false if value == { "allowed" => false }
        raise InvalidResult
      end

      def record_observation(claim:, attempt_id:, snapshot_digest:, result:)
        digest = result.evidence_digest(send_id: claim.send_id, attempt_id: attempt_id,
          snapshot_digest: snapshot_digest)
        value = call("SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid," \
          "$5::uuid,$6::text,$7::text,decode($8::text,'hex'))",
          [claim.send_id, claim.lease_id, claim.generation, SecureRandom.uuid, attempt_id,
            result.kind, result.receipt_ref, digest])
        raise StaleLease if value["code"] == "stale_lease"
        require_fields(value, %w[state simulated])
        raise InvalidResult unless value["simulated"] == true
        value
      end

      def mark_unknown(claim:, attempt_id:, reason:)
        # The synthetic driver normally returns normalized unknown. An uncaught deadline is ambiguous too.
        require_relative "submission_result"
        result = SubmissionResult.new(kind: "unknown", code: reason)
        record_observation(claim: claim, attempt_id: attempt_id, snapshot_digest: claim.snapshot_digest, result: result)
      end

      def reconcile(claim:, observation:)
        unless observation
          value = call("SELECT app_send_private.reconcile_no_evidence($1::uuid,$2::uuid,$3::bigint,$4::uuid)",
            [claim.send_id, claim.lease_id, claim.generation, claim.attempt_id])
          require_fields(value, %w[state simulated])
          raise InvalidResult unless value["simulated"] == true
          return value
        end
        record_observation(claim: claim, attempt_id: claim.attempt_id,
          snapshot_digest: claim.snapshot_digest, result: observation)
      end

      private

      def call(sql, values)
        raw = @connection.exec_params(sql, values).getvalue(0, 0)
        value = JSON.parse(raw)
        raise InvalidResult unless value.is_a?(Hash) && value.keys.all? { |key| key.is_a?(String) }
        value
      rescue JSON::ParserError, TypeError
        raise InvalidResult
      end

      def require_fields(value, fields)
        raise InvalidResult unless (fields - value.keys).empty?
      end
    end
  end
end
