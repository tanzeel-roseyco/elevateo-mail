# frozen_string_literal: true

require "digest"
require "securerandom"
require "socket"
require "timeout"
require_relative "attachments"

module Elevateo
  module Attachments
    class ScannerUnavailable
      class Error < StandardError; end
      def scan(_bytes) = raise Error, "attachment scanner unavailable"
    end

    # AIDEV-NOTE: clamd is an internal-only Soren service; exact OK/FOUND framing is required for a verdict.
    class ClamdScanner
      class Error < StandardError; end
      CHUNK = 65_536
      REPLY_MAX = 256

      def initialize(host: "clamav", port: 3310, socket_factory: nil)
        raise ArgumentError, "private clamd endpoint required" unless host == "clamav" && port == 3310
        @socket_factory = socket_factory || -> { Socket.tcp(host, port, connect_timeout: 3) }
      end

      def scan(bytes)
        raise Error, "invalid scan input" unless bytes.is_a?(String) && bytes.bytesize.between?(1, MAX_BYTES)
        Timeout.timeout(20) do
          active_socket = @socket_factory.call
          raise Error, "clamd socket unavailable" unless active_socket &&
            active_socket.respond_to?(:write) && active_socket.respond_to?(:read) && active_socket.respond_to?(:close)
          begin
            write_all(active_socket, "zINSTREAM\0")
            offset = 0
            while offset < bytes.bytesize
              chunk = bytes.byteslice(offset, CHUNK)
              raise Error, "clamd stream unavailable" unless chunk
              write_all(active_socket, [chunk.bytesize].pack("N"))
              write_all(active_socket, chunk)
              offset += chunk.bytesize
            end
            write_all(active_socket, [0].pack("N"))
            reply = +"".b
            loop do
              character = active_socket.read(1)
              raise Error, "clamd reply unavailable" unless character
              break if character == "\0"
              reply << character
              raise Error, "clamd reply too long" if reply.bytesize > REPLY_MAX
            end
            return "clean" if reply == "stream: OK"
            return "malware" if /\Astream: [A-Za-z0-9._-]{1,128} FOUND\z/.match?(reply)
            raise Error, "clamd did not return a verdict"
          ensure
            active_socket.close
          end
        end
      # AIDEV-NOTE: Docker DNS loss raises SocketError, outside IOError/SystemCallError; preserve the adapter error.
      rescue Timeout::Error, IOError, SystemCallError, SocketError
        raise Error, "clamd unavailable"
      end

      private

      def write_all(socket, bytes)
        offset = 0
        while offset < bytes.bytesize
          remaining = bytes.byteslice(offset, bytes.bytesize - offset)
          raise Error, "clamd stream unavailable" unless remaining
          written = socket.write(remaining)
          raise Error, "clamd write failed" unless written.is_a?(Integer) && written.positive?
          offset += written
        end
      end
    end

    # AIDEV-NOTE: Claim and verdict run in separate short DB transactions; token/attempt fence late results.
    class ScanService
      class Unavailable < StandardError; end

      def initialize(repository:, storage:, scanner: ScannerUnavailable.new)
        @repository, @storage, @scanner = repository, storage, scanner
      end

      def run_batch(limit: 25)
        raise ArgumentError, "invalid scan batch" unless limit.is_a?(Integer) && limit.between?(1, 25)
        outcomes = { "clean" => 0, "malware" => 0, "held" => 0 }
        @repository.due_scan_ids(limit: limit).each do |id|
          begin
            verdict = inspect(id: id)
            outcomes[verdict] = outcomes.fetch(verdict) + 1
          rescue Unavailable
            outcomes["held"] = outcomes.fetch("held") + 1
          end
        end
        outcomes
      end

      def inspect(id:)
        token = SecureRandom.uuid
        row = @repository.claim_scan(id: id, token: token)
        raise Unavailable, "scan not due" unless row
        # AIDEV-NOTE: A partial claim remains held and must not abort the rest of a due batch.
        attempt = row["scan_attempt"]
        digest = row["sha256"]
        key = row["storage_key"]
        expected_size = row["byte_size"]
        raise Unavailable, "invalid scan claim" unless attempt.is_a?(Integer) && attempt.between?(1, 3) &&
          digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(digest) && key.is_a?(String) &&
          expected_size.is_a?(Integer) && expected_size.between?(1, MAX_BYTES)
        begin
          bytes = @storage.get(key)
          raise Unavailable, "attachment bytes changed" unless bytes.bytesize == expected_size &&
            Digest::SHA256.hexdigest(bytes) == digest
          verdict = @scanner.scan(bytes)
          raise Unavailable, "invalid scanner verdict" unless %w[clean malware].include?(verdict)
          @repository.record_scan(id: id, sha256: digest, token: token, attempt: attempt, verdict: verdict)
          verdict
        rescue StandardError
          # AIDEV-NOTE: A failed/ambiguous write remains held; never infer clean or delete committed bytes.
          begin
            @repository.record_scan(id: id, sha256: digest, token: token, attempt: attempt, verdict: "scan_failed")
          rescue StandardError
            nil
          end
          raise Unavailable, "attachment scan failed"
        end
      end
    end
  end
end
