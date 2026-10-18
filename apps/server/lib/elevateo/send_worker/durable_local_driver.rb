# frozen_string_literal: true

require "json"
require "digest"
require_relative "submission_result"
require_relative "control"
require_relative "call_deadline"

module Elevateo
  module SendWorker
    class DurableLocalDriver
      OUTCOMES = %w[accept reject accept_then_timeout pause].freeze
      MAX_LEDGER_BYTES = 10_485_760

      def initialize(path:, outcome:)
        raise ArgumentError, "invalid local ledger path" unless path.is_a?(String) && path.start_with?("/") && !path.include?("\0")
        raise ArgumentError, "invalid local outcome" unless OUTCOMES.include?(outcome)
        @path, @outcome = path.dup.freeze, outcome
      end

      def database_profile = "synthetic-v1"

      def submit(bytes, send_id:, attempt_id:, deadline:)
        validate!(bytes, send_id, attempt_id)
        deadline.check!
        digest = Digest::SHA256.hexdigest(bytes)
        result = with_ledger do |rows, file|
          raise ArgumentError, "duplicate local attempt" if rows.any? { |row| row.fetch("attempt_id") == attempt_id }
          prior = rows.find { |row| row.fetch("send_id") == send_id }
          raise ArgumentError, "changed immutable local snapshot" if prior && prior.fetch("snapshot_digest") != digest
          receipt = "local:#{Digest::SHA256.hexdigest([send_id, digest].join(':'))}"
          row = { "send_id" => send_id, "attempt_id" => attempt_id, "snapshot_digest" => digest,
                  "accepted_receipt" => %w[accept accept_then_timeout].include?(@outcome) ? receipt : nil }
          append(file, row)
          case @outcome
          when "accept" then SubmissionResult.new(kind: "accepted", receipt_ref: receipt)
          when "reject" then SubmissionResult.new(kind: "rejected", code: "local_rejected")
          when "accept_then_timeout" then SubmissionResult.new(kind: "unknown", code: "local_timeout")
          else SubmissionResult.new(kind: "unknown", code: "local_paused")
          end
        end
        deadline.check!
        result
      rescue CallDeadline::Expired
        SubmissionResult.new(kind: "unknown", code: "deadline_expired")
      end

      def observation(send_id:, attempt_id:, snapshot_digest:, snapshot_bytes: nil)
        return nil unless Control.valid_epoch?(send_id) && Control.valid_epoch?(attempt_id) &&
          snapshot_digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(snapshot_digest)
        with_ledger do |rows, _file|
          row = rows.find { |item| item.fetch("attempt_id") == attempt_id }
          next nil unless row && row.fetch("send_id") == send_id && row.fetch("snapshot_digest") == snapshot_digest
          receipt = row.fetch("accepted_receipt")
          receipt && SubmissionResult.new(kind: "accepted", receipt_ref: receipt)
        end
      end

      private

      def validate!(bytes, send_id, attempt_id)
        unless bytes.is_a?(String) && bytes.bytesize.between?(1, 1_048_576) &&
            bytes.dup.force_encoding(Encoding::UTF_8).valid_encoding? &&
            Control.valid_epoch?(send_id) && Control.valid_epoch?(attempt_id)
          raise ArgumentError, "invalid local submission"
        end
      end

      # AIDEV-NOTE: Acceptance is synced before returning; ledger must be mounted outside restored DB volumes.
      def with_ledger
        flags = File::RDWR | File::CREAT | File::NOFOLLOW
        File.open(@path, flags, 0o600) do |file|
          file.flock(File::LOCK_EX)
          stat = file.stat
          raise ArgumentError, "invalid local ledger" unless stat.file? && stat.size <= MAX_LEDGER_BYTES &&
            stat.uid == Process.euid && (stat.mode & 0o077).zero?
          rows = file.each_line.map { |line| JSON.parse(line, max_nesting: 4) }
          unless rows.all? { |row| row.is_a?(Hash) && row.keys.sort == %w[accepted_receipt attempt_id send_id snapshot_digest] &&
            Control.valid_epoch?(row["send_id"]) && Control.valid_epoch?(row["attempt_id"]) &&
            /\A[0-9a-f]{64}\z/.match?(row["snapshot_digest"]) &&
            (row["accepted_receipt"].nil? || row["accepted_receipt"] ==
              "local:#{Digest::SHA256.hexdigest([row["send_id"], row["snapshot_digest"]].join(':'))}") } &&
              rows.map { |row| row["attempt_id"] }.uniq.length == rows.length
            raise ArgumentError, "invalid local ledger"
          end
          yield rows, file
        end
      rescue JSON::ParserError
        raise ArgumentError, "invalid local ledger"
      end

      def append(file, row)
        line = JSON.generate(row) + "\n"
        raise ArgumentError, "local ledger full" if file.stat.size + line.bytesize > MAX_LEDGER_BYTES
        file.seek(0, IO::SEEK_END)
        file.write(line)
        file.flush
        file.fsync
        File.open(File.dirname(@path), File::RDONLY) { |directory| directory.fsync }
      end
    end
  end
end
