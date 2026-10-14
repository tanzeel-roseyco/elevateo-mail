# frozen_string_literal: true

require "digest"
require "net/smtp"
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

      def submit(bytes, send_id:, attempt_id:, deadline:)
        raise Held, "remote SMTP remains held" if @profile.held?
        raise ArgumentError, "invalid SMTP attempt" unless Control.valid_epoch?(attempt_id)
        rendered = SmtpSnapshot.render(bytes, send_id: send_id, verified_sender: @profile.verified_sender)
        client = @client || LocalMailpitClient.new(profile: @profile)
        client.deliver(rendered, deadline: deadline)
      rescue SmtpSnapshot::Invalid
        SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
      end

      # AIDEV-NOTE: SMTP has no generic exact-attempt status lookup; uncertainty cannot authorize a replay.
      def observation(send_id:, attempt_id:, snapshot_digest:)
        nil
      end
    end

    class LocalMailpitClient
      def initialize(profile:, smtp_factory: ->(host, port) { Net::SMTP.new(host, port, tls: false, starttls: false) })
        raise ArgumentError, "Mailpit test profile required" unless profile.is_a?(SmtpProfile) && profile.local_test?
        @profile, @smtp_factory = profile, smtp_factory
      end

      def deliver(rendered, deadline:)
        raise ArgumentError, "invalid rendered mail" unless rendered.is_a?(RenderedMail)
        deadline.check!
        smtp = @smtp_factory.call(@profile.host, @profile.port)
        smtp.open_timeout = 3
        smtp.read_timeout = 3
        response = nil
        smtp.start("localhost") do |session|
          deadline.check!
          response = session.send_message(rendered.mime, rendered.sender, *rendered.recipients)
        end
        deadline.check!
        return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain") unless response&.status&.start_with?("2")
        receipt = "local:#{Digest::SHA256.hexdigest([rendered.mime, response.status].join(':'))}"
        SubmissionResult.new(kind: "accepted", receipt_ref: receipt)
      rescue StandardError
        # A lost DATA acceptance cannot be classified from an exception or retried safely.
        SubmissionResult.new(kind: "unknown", code: "smtp_uncertain")
      end
    end
  end
end
