# frozen_string_literal: true

require "openssl"
require_relative "smtp_transport"
require_relative "production_mox_profile"
require_relative "../mail_credentials/bundle"

module Elevateo
  module SendWorker
    # AIDEV-NOTE: SQL authorizes the exact tuple; Bundle supplies its sender, never a caller-controlled credential.
    class ProductionMoxTransport
      def initialize(profile:, credential_resolver:, smtp_factory: ->(host, port) { Net::SMTP.new(host, port) })
        raise SmtpTransport::Held, "production Mox profile required" unless profile.is_a?(ProductionMoxProfile)
        @profile, @credential_resolver, @smtp_factory = profile, credential_resolver, smtp_factory
      end

      def database_profile = "mox-smtp-v1"
      def observation(**_) = nil

      def submit(bytes, send_id:, attempt_id:, deadline:, credential_binding: nil)
        raise ArgumentError, "invalid SMTP attempt" unless Control.valid_epoch?(attempt_id)
        binding = credential_binding
        unless binding.is_a?(MailCredentials::Binding) && binding.credential_ref.start_with?("secret:")
          raise SmtpTransport::Held, "production SMTP binding unavailable", cause: nil
        end
        username, password = @credential_resolver.call(binding, protocol: "smtp")
        unless username.is_a?(String) && @profile.permits_sender?(username) &&
            password.is_a?(String) && password.bytesize.between?(1, 4096) && !password.match?(/[\x00\r\n]/)
          raise SmtpTransport::Held, "production SMTP credential unavailable", cause: nil
        end
        rendered = SmtpSnapshot.render(bytes, send_id: send_id, verified_sender: username)
        unless binding.organization_id == rendered.organization_id && binding.mailbox_id == rendered.mailbox_id
          raise SmtpTransport::Held, "production SMTP tenant mismatch", cause: nil
        end
        deliver(rendered, username, password, send_id, attempt_id, deadline)
      rescue MailCredentials::Unavailable
        raise SmtpTransport::Held, "production SMTP credential unavailable", cause: nil
      rescue SmtpSnapshot::Invalid
        SubmissionResult.new(kind: "rejected", code: "smtp_invalid_snapshot")
      end

      private

      def deliver(rendered, username, password, send_id, attempt_id, deadline)
        mime = rendered.mime
        raise SmtpTransport::Held, "production SMTP content unavailable" unless mime
        started = false
        status = ""
        begin
          deadline.check!
          Timeout.timeout(deadline.remaining, CallDeadline::Expired) do
            # AIDEV-NOTE: System roots and hostname verification are mandatory; STARTTLS cannot downgrade.
            context = OpenSSL::SSL::SSLContext.new
            context.set_params(verify_mode: OpenSSL::SSL::VERIFY_PEER, verify_hostname: true)
            smtp = @smtp_factory.call(@profile.host, @profile.port)
            smtp.open_timeout = smtp.read_timeout = [3.0, deadline.remaining].min
            smtp.enable_starttls(context)
            smtp.start(@profile.host, username, password, :plain) do |session|
              deadline.check!
              # AIDEV-NOTE: Any exception after DATA may begin is durable unknown, never automatic resubmission.
              started = true
              status = session.send_message(mime, rendered.sender, *rendered.recipient_addresses).status
            end
          end
        rescue StandardError
          raise SmtpTransport::Held, "production SMTP unavailable before submission", cause: nil unless started
          return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain")
        end
        return SubmissionResult.new(kind: "unknown", code: "smtp_uncertain") if deadline.remaining <= 0 || !status.start_with?("2")

        digest = Digest::SHA256.hexdigest(JSON.generate([send_id, attempt_id, rendered.mime, status]))
        SubmissionResult.new(kind: "accepted", receipt_ref: "mox-v1:#{digest}")
      end
    end
  end
end
