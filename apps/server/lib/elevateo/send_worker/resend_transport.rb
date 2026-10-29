# frozen_string_literal: true

require "json"
require "digest"
require "net/http"
require "uri"
require "timeout"
require "base64"
require_relative "../attachments_storage"
require_relative "control"
require_relative "call_deadline"
require_relative "smtp_snapshot"
require_relative "submission_result"

module Elevateo
  module SendWorker
    class ResendTransport
      PROFILE = "resend-v1"
      UUID = /\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/

      def initialize(api_key:, from_domain:, base_url: "https://api.resend.com", http_factory: nil, attachment_storage: nil)
        raise ArgumentError, "invalid Resend configuration" unless api_key.is_a?(String) && !api_key.empty? &&
          from_domain.is_a?(String) && !from_domain.empty?
        @storage = attachment_storage
        @api_key = api_key.dup.freeze
        @from_domain = from_domain.downcase.freeze
        @base_uri = URI.parse(base_url)
        raise ArgumentError, "invalid Resend base URL" unless ["https://api.resend.com", "http://resend-stub:8788"].include?(base_url)
        @http_factory = http_factory || ->(uri) { Net::HTTP.new(uri.hostname || raise(ArgumentError, "provider host unavailable"), uri.port, nil).tap { |http| http.use_ssl = uri.scheme == "https" } }
      end

      def database_profile = PROFILE

      def inspect = "#<Elevateo::SendWorker::ResendTransport redacted>"

      def submit(bytes, send_id:, attempt_id:, deadline:)
        raise ArgumentError, "invalid Resend attempt" unless Control.valid_epoch?(attempt_id)
        # AIDEV-NOTE: The approved sender must remain inside the configured verified domain; no API response can widen it.
        snapshot = JSON.parse(bytes, max_nesting: 5)
        raise SmtpSnapshot::Invalid unless snapshot.is_a?(Array) && snapshot.length == 14
        normalized = snapshot.dup
        normalized[0] = snapshot[0] == "elevateo.send.snapshot.v3" ? snapshot[0] : "elevateo.send.snapshot.v1"
        # @type var empty_attachments: Array[String]
        empty_attachments = []
        normalized[12] = empty_attachments
        message = SmtpSnapshot.render(JSON.generate(normalized), send_id: send_id, verified_sender: snapshot_sender(bytes))
        return rejected unless message.sender.split("@", 2).last.downcase == @from_domain
        # AIDEV-NOTE: Preserve the validated V3 wire identity; replies must remain in the recipient's thread.
        headers = { "Message-ID" => "<elevateo.#{send_id}@#{message.sender.split('@', 2).last}>" }
        if snapshot[0] == "elevateo.send.snapshot.v3"
          headers["In-Reply-To"] = snapshot[9][1]
          headers["References"] = snapshot[9][1]
        end
        payload = JSON.generate(from: message.sender, to: message.recipient_addresses, subject: message.subject,
          text: message.text, attachments: attachment_payload(snapshot, deadline),
          headers: headers,
          tags: [{ name: "send_id", value: send_id }, { name: "attempt_id", value: attempt_id }])
        response = request(Net::HTTP::Post, "/emails", deadline: deadline, body: payload,
          headers: { "Idempotency-Key" => "elevateo/#{send_id}" })
        status = response.code.to_i
        return rejected if [400, 401, 403, 404, 413, 422].include?(status)
        return unknown unless status.between?(200, 299)
        provider_id = response_id(response.body)
        return unknown unless provider_id
        SubmissionResult.new(kind: "accepted", receipt_ref: "resend:#{provider_id}")
      rescue CallDeadline::Expired, Timeout::Error, IOError, SystemCallError, Net::HTTPBadResponse,
             JSON::ParserError, SmtpSnapshot::Invalid, Attachments::PrivateStorage::Unavailable
        unknown
      end

      # AIDEV-NOTE: Unknown POSTs never replay beyond a provider retention window; durable signed events reconcile them.
      def observation(send_id:, attempt_id:, snapshot_digest:, snapshot_bytes: nil)
        _identity = [send_id, attempt_id, snapshot_digest, snapshot_bytes]
        nil
      end

      private

      # AIDEV-NOTE: Fetch occurs outside SQL; bytes must match the exact clean immutable metadata approved by the user.
      def attachment_payload(snapshot, deadline)
        raise SmtpSnapshot::Invalid unless snapshot.is_a?(Array) && snapshot.length == 14
        items = snapshot[12]
        raise SmtpSnapshot::Invalid unless items.is_a?(Array) && items.length <= 1
        expected = items.empty? ? "elevateo.send.snapshot.v1" : "elevateo.send.snapshot.v2"
        raise SmtpSnapshot::Invalid unless [expected, "elevateo.send.snapshot.v3"].include?(snapshot[0])
        items.map do |item|
          raise SmtpSnapshot::Invalid unless item.is_a?(Array) && item.length == 6
          id, key, name, type, size, sha = item
          unless id.is_a?(String) && UUID.match?(id) && key == "drafts/#{snapshot[1]}/#{id}" &&
              name.is_a?(String) && name.bytesize.between?(1, 255) && !name.match?(/[\x00-\x1f\x7f\/\\]/) &&
              %w[application/pdf image/png image/jpeg text/plain].include?(type) && size.is_a?(Integer) &&
              size.between?(1, 1_048_576) && sha.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(sha)
            raise SmtpSnapshot::Invalid
          end
          storage = @storage
          raise Attachments::PrivateStorage::Unavailable unless storage
          deadline.check!
          bytes = Timeout.timeout(deadline.remaining, CallDeadline::Expired) { storage.get(key) }
          raise SmtpSnapshot::Invalid unless bytes.bytesize == size && Digest::SHA256.hexdigest(bytes) == sha
          { filename: name, content_type: type, content: Base64.strict_encode64(bytes) }
        end
      end

      def snapshot_sender(bytes)
        value = JSON.parse(bytes, max_nesting: 5)
        # @type var sender: Elevateo::auth_value
        sender = value.is_a?(Array) && value[5].is_a?(Array) ? value[5][1] : nil
        raise SmtpSnapshot::Invalid, "invalid send snapshot" unless sender.is_a?(String)
        sender
      end

      def request(request_class, path, deadline:, body: nil, headers: {})
        deadline.check!
        uri = @base_uri + path
        request = request_class.new(uri)
        request["Authorization"] = "Bearer #{@api_key}"
        request["Content-Type"] = "application/json"
        headers.each { |name, value| request[name] = value }
        request.body = body if body
        http = @http_factory.call(uri)
        http.open_timeout = [3.0, deadline.remaining].min
        http.read_timeout = deadline.remaining
        http.write_timeout = deadline.remaining if http.respond_to?(:write_timeout=)
        http.max_retries = 0
        http.ignore_eof = false
        # AIDEV-NOTE: Per-phase Net::HTTP limits can add together; this outer bound owns the entire provider call.
        Timeout.timeout(deadline.remaining, CallDeadline::Expired) do
          http.request(request) do |response|
            bounded = +""
            response.read_body do |chunk|
              raise IOError, "provider response too large" if bounded.bytesize + chunk.bytesize > 16_384
              bounded << chunk
            end
            response.body = bounded
          end
        end
      end

      def response_id(body)
        value = JSON.parse(body, max_nesting: 4)
        id = value.is_a?(Hash) ? value["id"] : nil
        id if id.is_a?(String) && /\A[A-Za-z0-9_-]{1,128}\z/.match?(id)
      end

      def rejected = SubmissionResult.new(kind: "rejected", code: "resend_rejected")
      def unknown = SubmissionResult.new(kind: "unknown", code: "resend_unknown")
    end
  end
end
