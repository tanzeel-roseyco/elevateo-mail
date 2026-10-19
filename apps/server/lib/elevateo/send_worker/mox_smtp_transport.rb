# frozen_string_literal: true

require "openssl"
require_relative "smtp_transport"
require_relative "../mail_credentials/binding"

module Elevateo
  module SendWorker
    # AIDEV-NOTE: Fixed loopback fixture, mandatory verified STARTTLS, exact envelope; production stays held.
    class MoxSmtpTransport
      def initialize(profile:, ca_file:, credential_resolver:, smtp_factory: ->(host, port) { Net::SMTP.new(host, port) })
        raise SmtpTransport::Held, "Mox fixture profile required" unless profile.is_a?(SmtpProfile) && profile.mox_test?
        raise ArgumentError, "fixture CA required" unless ca_file.is_a?(String) && !ca_file.empty? && File.file?(ca_file)
        @profile, @ca_file, @credential_resolver, @smtp_factory = profile, ca_file, credential_resolver, smtp_factory
      end

      def database_profile = "mox-smtp-test-v1"

      def submit(bytes, send_id:, attempt_id:, deadline:, credential_binding: nil)
        raise ArgumentError, "invalid SMTP attempt" unless Control.valid_epoch?(attempt_id)
        rendered = SmtpSnapshot.render(bytes, send_id: send_id, verified_sender: @profile.verified_sender)
        unless rendered.recipient_addresses == ["seed000@seed.test"]
          return SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
        end
        unless credential_binding.is_a?(MailCredentials::Binding) &&
            credential_binding.organization_id == rendered.organization_id && credential_binding.mailbox_id == rendered.mailbox_id
          raise SmtpTransport::Held, "SMTP account binding unavailable", cause: nil
        end
        deliver(rendered, send_id: send_id, attempt_id: attempt_id, deadline: deadline, binding: credential_binding)
      rescue SmtpSnapshot::Invalid
        SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
      end

      # AIDEV-NOTE: SMTP acknowledgment loss has no reliable exact-attempt lookup; never authorize an automatic replay.
      def observation(**_) = nil

      private

      def deliver(rendered, send_id:, attempt_id:, deadline:, binding:)
        # AIDEV-NOTE: SMTP needs MIME and envelope addresses; provider display-name tuples are not SMTP recipients.
        mime = rendered.mime
        raise SmtpTransport::Held, "SMTP MIME unavailable" unless mime
        started = false
        status = ""
        begin
          deadline.check!
          Timeout.timeout(deadline.remaining, CallDeadline::Expired) do
            # AIDEV-NOTE: Exact account/version/protocol lookup happens before constructing any SMTP client.
            username, password = @credential_resolver.call(binding, protocol: "smtp")
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
              status = session.send_message(mime, rendered.sender, *rendered.recipient_addresses).status
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
