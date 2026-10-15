# frozen_string_literal: true

require "openssl"
require_relative "smtp_transport"

module Elevateo
  module SendWorker
    # AIDEV-NOTE: Fixed loopback fixture, mandatory verified STARTTLS, exact envelope; production stays held.
    class MoxSmtpTransport
      def initialize(profile:, ca_file:, credential_resolver:, smtp_factory: ->(host, port) { Net::SMTP.new(host, port) })
        raise SmtpTransport::Held, "Mox fixture profile required" unless profile.is_a?(SmtpProfile) && profile.mox_test?
        raise ArgumentError, "fixture CA required" unless ca_file.is_a?(String) && !ca_file.empty? && File.file?(ca_file)
        @profile, @ca_file, @credential_resolver, @smtp_factory = profile, ca_file, credential_resolver, smtp_factory
      end

      def submit(bytes, send_id:, attempt_id:, deadline:)
        raise ArgumentError, "invalid SMTP attempt" unless Control.valid_epoch?(attempt_id)
        rendered = SmtpSnapshot.render(bytes, send_id: send_id, verified_sender: @profile.verified_sender)
        unless rendered.recipients == ["seed000@seed.test"]
          return SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
        end
        deliver(rendered, send_id: send_id, attempt_id: attempt_id, deadline: deadline)
      rescue SmtpSnapshot::Invalid
        SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
      end

      # AIDEV-NOTE: SMTP acknowledgment loss has no reliable exact-attempt lookup; never authorize an automatic replay.
      def observation(**_) = nil

      private

      def deliver(rendered, send_id:, attempt_id:, deadline:)
        started = false
        status = ""
        begin
          deadline.check!
          Timeout.timeout(deadline.remaining, CallDeadline::Expired) do
            username, password = @credential_resolver.call("test:mox-fixture")
            unless username == @profile.verified_sender && password.is_a?(String) &&
                password.bytesize.between?(1, 4096) && !password.match?(/[\x00\r\n]/)
              raise ArgumentError, "invalid fixture credential"
            end
            context = OpenSSL::SSL::SSLContext.new
            context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true, ca_file: @ca_file)
            smtp = @smtp_factory.call(@profile.host, @profile.port)
            smtp.open_timeout = smtp.read_timeout = [3.0, deadline.remaining].min
            smtp.enable_starttls(context)
            smtp.start("mail.lab.test", username, password, :plain) do |session|
              deadline.check!
              # AIDEV-NOTE: Once DATA might start, every exception is ambiguous, including a lost final response.
              started = true
              status = session.send_message(rendered.mime, rendered.sender, *rendered.recipients).status
            end
          end
        rescue StandardError
          raise SmtpTransport::Held, "Mox fixture unavailable before submission", cause: nil unless started
          return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain")
        end
        if deadline.remaining <= 0 || !status.start_with?("2")
          return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain")
        end
        digest = Digest::SHA256.hexdigest(JSON.generate([send_id, attempt_id, rendered.mime, status]))
        SubmissionResult.new(kind: "accepted", receipt_ref: "mox-test-v1:#{digest}")
      end
    end
  end
end
