# frozen_string_literal: true

require_relative "../send_api/address"

module Elevateo
  module SendWorker
    class SmtpProfile
      HOST = /\A(?=.{1,253}\z)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])\z/
      SECRET_REF = /\Asecret:\/\/[a-z][a-z0-9_-]{1,63}\z/
      attr_reader :mode, :host, :port, :verified_sender, :tls_mode, :credential_ref

      def self.local_mailpit(verified_sender:)
        new(mode: "mailpit-smtp-test-v1", host: "mailpit", port: 1025, verified_sender: verified_sender,
          tls_mode: "none", credential_ref: nil)
      end

      # AIDEV-NOTE: Mox admission is an exact fixture identity; it does not enable production SMTP.
      def self.local_mox
        new(mode: "mox-smtp-test-v1", host: "localhost", port: 1587,
          verified_sender: "outreach000@send.test", tls_mode: "starttls_required", credential_ref: "test:mox-fixture")
      end

      # AIDEV-NOTE: Remote configuration is representable but permanently held in the current local runtime.
      def self.remote_held(host:, port:, verified_sender:, tls_mode:, credential_ref:)
        new(mode: "remote_held", host: host, port: port, verified_sender: verified_sender,
          tls_mode: tls_mode, credential_ref: credential_ref)
      end

      def initialize(mode:, host:, port:, verified_sender:, tls_mode:, credential_ref:)
        unless verified_sender.is_a?(String) && verified_sender == SendAPI::Address.canonical(verified_sender)
          raise ArgumentError, "invalid verified sender"
        end
        valid = if mode == "mailpit-smtp-test-v1"
          host == "mailpit" && port == 1025 && tls_mode == "none" && credential_ref.nil? &&
            verified_sender.end_with?(".invalid")
        elsif mode == "mox-smtp-test-v1"
          host == "localhost" && port == 1587 && tls_mode == "starttls_required" &&
            verified_sender == "outreach000@send.test" && credential_ref == "test:mox-fixture"
        else
          mode == "remote_held" && host.is_a?(String) && HOST.match?(host) && /[A-Za-z]/.match?(host) &&
            host.split(".", -1).length >= 2 && host.split(".", -1).all? { |label| SendAPI::Address::LABEL.match?(label) } &&
            [465, 587].include?(port) &&
            ((port == 465 && tls_mode == "implicit") || (port == 587 && tls_mode == "starttls_required")) &&
            credential_ref.is_a?(String) && SECRET_REF.match?(credential_ref)
        end
        raise ArgumentError, "invalid SMTP profile" unless valid
        @mode, @host, @port = mode.dup.freeze, host.dup.freeze, port
        @verified_sender, @tls_mode = verified_sender.dup.freeze, tls_mode.dup.freeze
        @credential_ref = credential_ref&.dup&.freeze
        freeze
      end

      def local_test? = @mode == "mailpit-smtp-test-v1"
      def mox_test? = @mode == "mox-smtp-test-v1"
      def held? = !(local_test? || mox_test?)
    end
  end
end
