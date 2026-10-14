# frozen_string_literal: true

require "digest"
require_relative "attachments"

module Elevateo
  module Attachments
    # AIDEV-NOTE: No scanner is configured; the default rejects scans and cannot manufacture a clean verdict.
    class ScannerUnavailable
      class Error < StandardError; end
      def scan(_bytes) = raise Error, "attachment scanner unavailable"
    end

    class ScanService
      class Unavailable < StandardError; end

      def initialize(repository:, storage:, scanner: ScannerUnavailable.new)
        @repository, @storage, @scanner = repository, storage, scanner
      end

      def inspect(id:)
        row = @repository.pending_scan(id: id)
        raise Unavailable unless row && row.fetch("scan_status") == "pending_scan"
        bytes = @storage.get(row.fetch("storage_key"))
        raise Unavailable unless bytes.bytesize == row.fetch("byte_size").to_i &&
          Digest::SHA256.hexdigest(bytes) == row.fetch("sha256")
        verdict = @scanner.scan(bytes)
        raise Unavailable unless %w[clean malware].include?(verdict)
        @repository.record_scan(id: id, sha256: row.fetch("sha256"), verdict: verdict)
        verdict
      rescue ScannerUnavailable::Error
        raise Unavailable, "attachment scanner unavailable"
      end
    end
  end
end
