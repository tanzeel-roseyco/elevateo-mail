# frozen_string_literal: true

require "json"
require "digest"
require "net/http"
require "uri"
require "timeout"
require_relative "call_deadline"
require_relative "smtp_snapshot"
require_relative "submission_result"

module Elevateo
  module SendWorker
    class ResendTransport
      PROFILE = "resend-v1"

      def initialize(api_key:, from_domain:, base_url: "https://api.resend.com", http_factory: nil)
        raise ArgumentError, "invalid Resend configuration" unless api_key.is_a?(String) && !api_key.empty? &&
          from_domain.is_a?(String) && !from_domain.empty?
        @api_key = api_key.dup.freeze
        @from_domain = from_domain.downcase.freeze
        @base_uri = URI.parse(base_url)
        raise ArgumentError, "invalid Resend base URL" unless %w[http https].include?(@base_uri.scheme) && @base_uri.host
        @http_factory = http_factory || ->(uri) { Net::HTTP.new(uri.host, uri.port).tap { |http| http.use_ssl = uri.scheme == "https" } }
        @provider_ids = {} # : Hash[String, String]
      end

      def database_profile = PROFILE

      def inspect = "#<Elevateo::SendWorker::ResendTransport redacted>"

      def submit(bytes, send_id:, attempt_id:, deadline:)
        raise ArgumentError, "invalid Resend attempt" unless Control.valid_epoch?(attempt_id)
        # AIDEV-NOTE: The approved sender must remain inside the configured verified domain; no API response can widen it.
        message = SmtpSnapshot.render(bytes, send_id: send_id, verified_sender: snapshot_sender(bytes))
        return rejected unless message.sender.split("@", 2).last.downcase == @from_domain
        payload = JSON.generate(from: message.sender, to: message.recipient_addresses, subject: message.subject,
          text: message.text)
        response = request(Net::HTTP::Post, "/emails", deadline: deadline, body: payload,
          headers: { "Idempotency-Key" => attempt_id })
        status = response.code.to_i
        return rejected if status.between?(400, 499) && status != 429
        return unknown unless status.between?(200, 299)
        provider_id = response_id(response.body)
        return unknown unless provider_id
        @provider_ids[attempt_id] = provider_id
        SubmissionResult.new(kind: "accepted", receipt_ref: "resend:#{provider_id}")
      rescue CallDeadline::Expired, Timeout::Error, IOError, SystemCallError, Net::HTTPBadResponse,
             JSON::ParserError, SmtpSnapshot::Invalid
        unknown
      end

      def observation(send_id:, attempt_id:, snapshot_digest:, snapshot_bytes:)
        return nil unless Control.valid_epoch?(send_id) && Control.valid_epoch?(attempt_id) &&
          /\A[0-9a-f]{64}\z/.match?(snapshot_digest.to_s) && snapshot_bytes.is_a?(String) &&
          Digest::SHA256.hexdigest(snapshot_bytes) == snapshot_digest
        provider_id = @provider_ids[attempt_id]
        unless provider_id
          # AIDEV-NOTE: Resend retains idempotency keys for 24h; replay recovers the original ID after a process crash.
          recovered = submit(snapshot_bytes, send_id: send_id, attempt_id: attempt_id,
            deadline: CallDeadline.new(seconds: 10))
          return recovered unless recovered.kind == "accepted"
          provider_id = @provider_ids[attempt_id]
        end
        response = request(Net::HTTP::Get, "/emails/#{URI.encode_www_form_component(provider_id)}",
          deadline: CallDeadline.new(seconds: 10))
        return unknown unless response.code.to_i.between?(200, 299) && response_id(response.body) == provider_id
        SubmissionResult.new(kind: "accepted", receipt_ref: "resend:#{provider_id}")
      rescue CallDeadline::Expired, Timeout::Error, IOError, SystemCallError, Net::HTTPBadResponse, JSON::ParserError
        unknown
      end

      private

      def snapshot_sender(bytes)
        value = JSON.parse(bytes, max_nesting: 5)
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
        # AIDEV-NOTE: Per-phase Net::HTTP limits can add together; this outer bound owns the entire provider call.
        Timeout.timeout(deadline.remaining, CallDeadline::Expired) { http.request(request) }
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
