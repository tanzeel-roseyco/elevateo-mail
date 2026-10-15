# frozen_string_literal: true

require "json"
require "securerandom"
require "digest"
require_relative "control"
require_relative "../mail_credentials/binding"

module Elevateo
  module SendWorker
    Claim = Struct.new(:send_id, :action, :lease_id, :generation, :attempt_id, :snapshot_digest, keyword_init: true)
    Authorization = Struct.new(:attempt_id, :snapshot_bytes, :credential_binding, keyword_init: true)

    class DatabaseStore
      class InvalidResult < StandardError; end
      class StaleLease < StandardError; end
      PROFILES = { "synthetic-v1" => "local:synthetic-v1",
        "mailpit-smtp-test-v1" => "local:mailpit-smtp-test-v1", "mox-smtp-test-v1" => "local:mox-smtp-test-v1" }.freeze
      # AIDEV-NOTE: Ruby and SQL both bind the profile, prefix and source; never infer a new provider with else.
      RECEIPT_PREFIXES = { "synthetic-v1" => "local:", "mailpit-smtp-test-v1" => "mailpit-test-v1:",
        "mox-smtp-test-v1" => "mox-test-v1:" }.freeze
      SOURCES = { "mailpit-smtp-test-v1" => "mailpit_smtp_test_v1", "mox-smtp-test-v1" => "mox_smtp_test_v1" }.freeze

      def self.next_due_send(connection:, epoch:, excluded:)
        raise ArgumentError, "invalid dispatch epoch" unless Control.valid_epoch?(epoch)
        unless excluded.is_a?(Array) && excluded.length <= 32 && excluded.all? { |id| Control.valid_epoch?(id) }
          raise ArgumentError, "invalid due exclusions"
        end
        value = connection.exec_params("SELECT app_send_private.next_due_send($1::uuid,$2::uuid[])",
          [epoch, "{#{excluded.join(',')}}"]).getvalue(0, 0)
        return nil if value.nil?
        raise InvalidResult unless Control.valid_epoch?(value)
        value
      end

      # AIDEV-NOTE: This connection must authenticate as elevateo_worker; each function commits before provider I/O.
      def initialize(connection:, send_id:, lease_seconds: 30, deadline_seconds: 10, profile: "synthetic-v1")
        raise ArgumentError, "invalid send identity" unless Control.valid_epoch?(send_id)
        raise ArgumentError, "invalid lease budget" unless lease_seconds.is_a?(Integer) && lease_seconds.between?(1, 120)
        raise ArgumentError, "invalid call budget" unless deadline_seconds.is_a?(Integer) && deadline_seconds.between?(1, 10)
        raise ArgumentError, "invalid worker profile" unless PROFILES.key?(profile)
        @connection, @send_id = connection, send_id
        @lease_seconds, @deadline_seconds = lease_seconds, deadline_seconds
        @profile = profile
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
            Digest::SHA256.hexdigest(PROFILES.fetch(@profile)), @profile, @deadline_seconds])
        return nil if result["code"] == "dispatch_held"
        require_fields(result, %w[attempt_id attempt_no call_deadline_at simulated])
        raise InvalidResult unless result["attempt_id"] == attempt_id && result["simulated"] == true
        Authorization.new(attempt_id: attempt_id, snapshot_bytes: bytes, credential_binding: smtp_binding(result))
      end

      def final_check(claim:, attempt_id:, epoch:)
        value = call("SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid)",
          [claim.send_id, claim.lease_id, claim.generation, attempt_id, epoch])
        return true if value == { "allowed" => true }
        return false if value == { "allowed" => false }
        raise InvalidResult
      end

      def record_observation(claim:, attempt_id:, snapshot_digest:, result:)
        if result.kind == "accepted"
          prefix = RECEIPT_PREFIXES.fetch(@profile)
          raise InvalidResult, "receipt/profile mismatch" unless result.receipt_ref.is_a?(String) &&
            result.receipt_ref.start_with?(prefix)
        end
        digest = result.evidence_digest(send_id: claim.send_id, attempt_id: attempt_id,
          snapshot_digest: snapshot_digest)
        values = [claim.send_id, claim.lease_id, claim.generation, SecureRandom.uuid, attempt_id,
          result.kind, result.receipt_ref, digest]
        sql = if @profile == "synthetic-v1"
          "SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid," \
            "$5::uuid,$6::text,$7::text,decode($8::text,'hex'))"
        else
          values << SOURCES.fetch(@profile)
          "SELECT app_send_private.record_observation_v2($1::uuid,$2::uuid,$3::bigint,$4::uuid," \
            "$5::uuid,$6::text,$7::text,decode($8::text,'hex'),$9::text)"
        end
        value = call(sql, values)
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
        attempt_id = claim.attempt_id
        raise InvalidResult, "reconciliation attempt missing" unless attempt_id.is_a?(String) &&
          Control.valid_epoch?(attempt_id)
        unless observation
          value = call("SELECT app_send_private.reconcile_no_evidence($1::uuid,$2::uuid,$3::bigint,$4::uuid)",
            [claim.send_id, claim.lease_id, claim.generation, attempt_id])
          require_fields(value, %w[state simulated])
          raise InvalidResult unless value["simulated"] == true
          return value
        end
        record_observation(claim: claim, attempt_id: attempt_id,
          snapshot_digest: claim.snapshot_digest, result: observation)
      end

      private

      # AIDEV-NOTE: Only SQL chooses the account tuple; historical unbound attempts can reconcile, never submit.
      def smtp_binding(result)
        return nil unless @profile == "mox-smtp-test-v1"

        value = result["credential_binding"]
        fields = %w[organization_id mailbox_id account_id credential_version credential_ref protocol]
        raise InvalidResult unless value.is_a?(Hash) && value.keys.sort == fields.sort && value["protocol"] == "smtp"

        MailCredentials::Binding.new(organization_id: value["organization_id"], mailbox_id: value["mailbox_id"],
          account_id: value["account_id"], credential_version: value["credential_version"], credential_ref: value["credential_ref"])
      rescue MailCredentials::Unavailable
        raise InvalidResult, "invalid SMTP binding", cause: nil
      end

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
