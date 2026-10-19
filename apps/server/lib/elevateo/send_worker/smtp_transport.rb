# frozen_string_literal: true

require "digest"
require "net/smtp"
require "timeout"
require_relative "call_deadline"
require_relative "smtp_snapshot"
require_relative "smtp_profile"
require_relative "submission_result"

module Elevateo
  module SendWorker
    class SmtpTransport
      class Held < StandardError; end

      def initialize(profile:, client: nil)
        raise ArgumentError, "invalid SMTP profile" unless profile.is_a?(SmtpProfile)
        @profile = profile
        @client = client
      end

      # AIDEV-NOTE: Constructor accepts held configuration, but a queue must reject it before claiming any work.
      def database_profile
        raise Held, "Mailpit profile required; remote SMTP remains held" unless @profile.local_test?
        "mailpit-smtp-test-v1"
      end

      def submit(bytes, send_id:, attempt_id:, deadline:)
        # AIDEV-NOTE: This adapter owns Mailpit only; the Mox adapter has separate TLS and identity admission.
        raise Held, "Mailpit profile required; remote SMTP remains held" unless @profile.local_test?
        raise ArgumentError, "invalid SMTP attempt" unless Control.valid_epoch?(attempt_id)
        rendered = SmtpSnapshot.render(bytes, send_id: send_id, verified_sender: @profile.verified_sender)
        unless rendered.recipient_addresses.all? { |address| address.split("@", 2).last.end_with?(".invalid") }
          return SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
        end
        client = @client || LocalMailpitClient.new(profile: @profile)
        client.deliver(rendered, deadline: deadline)
      rescue LocalMailpitClient::PreflightFailed, CallDeadline::Expired
        raise Held, "local SMTP test unavailable before submission"
      rescue SmtpSnapshot::Invalid
        SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
      end

      # AIDEV-NOTE: SMTP has no generic exact-attempt status lookup; uncertainty cannot authorize a replay.
      def observation(send_id:, attempt_id:, snapshot_digest:, snapshot_bytes: nil)
        _ = snapshot_bytes
        return nil unless Control.valid_epoch?(send_id) && Control.valid_epoch?(attempt_id) &&
          snapshot_digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(snapshot_digest)
        nil
      end
    end

    class LocalMailpitClient
      class PreflightFailed < StandardError; end

      def initialize(profile:, smtp_factory: ->(host, port) {
        Net::SMTP.new(host, port).tap { |smtp| smtp.disable_tls; smtp.disable_starttls }
      })
        raise ArgumentError, "Mailpit test profile required" unless profile.is_a?(SmtpProfile) && profile.local_test?
        @profile, @smtp_factory = profile, smtp_factory
      end

      def deliver(rendered, deadline:)
        raise ArgumentError, "invalid rendered mail" unless rendered.is_a?(RenderedMessage) && rendered.mime
        deadline.check!
        smtp = begin
          @smtp_factory.call(@profile.host, @profile.port)
        rescue StandardError
          raise PreflightFailed, "SMTP test client unavailable", cause: nil
        end
        begin
          smtp.open_timeout = [3.0, deadline.remaining].min
          smtp.read_timeout = [3.0, deadline.remaining].min
        rescue StandardError
          raise PreflightFailed, "SMTP test client configuration failed", cause: nil
        end
        response_status = ""
        submission_started = false
        begin
          Timeout.timeout(deadline.remaining, CallDeadline::Expired) do
            smtp.start("localhost") do |session|
              deadline.check!
              submission_started = true
              response_status = session.send_message(rendered.mime, rendered.sender, *rendered.recipient_addresses).status
            end
          end
        rescue StandardError
          raise PreflightFailed, "SMTP test session unavailable", cause: nil unless submission_started
          return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain")
        end
        return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain") if deadline.remaining <= 0
        return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain") unless response_status.start_with?("2")
        receipt = "mailpit-test-v1:#{Digest::SHA256.hexdigest([rendered.mime, response_status].join(':'))}"
        SubmissionResult.new(kind: "accepted", receipt_ref: receipt)
      end
    end
  end
end
