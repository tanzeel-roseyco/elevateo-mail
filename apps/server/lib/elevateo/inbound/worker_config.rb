# frozen_string_literal: true

require_relative "../config"
require_relative "../send_worker/production_mox_profile"
require_relative "../attachments_worker_storage"
require_relative "../mail_credentials/bundle"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Fixture and production endpoint/credential namespaces remain explicit, never inferred from a host.
    class WorkerConfig
      attr_reader :runtime, :credentials_path, :ca_path, :attachment_storage, :host, :port, :simulated

      def self.load!(env = ENV) = new(runtime: Config.load!(env), env: env)

      def initialize(runtime:, env:)
        unless runtime.db_role == "elevateo_worker" && runtime.process == "worker" &&
            %w[mox-imap-test-v1 mox-imap-v1].include?(env["ELEVATEO_IMAP_PROFILE"].to_s)
          raise ConfigError, "inbound worker requires the held Mox worker profile"
        end
        @simulated = env["ELEVATEO_IMAP_PROFILE"] == "mox-imap-test-v1"
        raise ConfigError, "fixture IMAP requires outbound hold" if @simulated && !runtime.outbound_hold
        raise ConfigError, "production IMAP requires production Mox mode" if !@simulated &&
          (runtime.mode != "production" || runtime.outbound_mode != "mox")
        @host = @simulated ? "localhost" : SendWorker::ProductionMoxProfile.new(env).host
        @port = @simulated ? 1993 : 993
        @runtime = runtime
        @credentials_path = absolute_path(env["ELEVATEO_IMAP_CREDENTIALS_PATH"])
        @ca_path = @simulated ? absolute_path(env["ELEVATEO_IMAP_CA_PATH"]) : nil
        @attachment_storage = Attachments::WorkerStorage.load!(env)
        freeze
      end

      def resolve(bundle, binding, protocol:)
        prefix = @simulated ? "test:" : "secret:"
        raise MailCredentials::Unavailable, "credential unavailable" unless binding.credential_ref.start_with?(prefix)
        bundle.call(binding, protocol: protocol)
      end

      def inspect = "#<Elevateo::Inbound::WorkerConfig redacted>"
      alias to_s inspect

      private

      def absolute_path(value)
        unless value.is_a?(String) && value.start_with?("/") && value.bytesize.between?(2, 4096) && !value.include?("\0")
          raise ConfigError, "inbound worker requires absolute credential and CA paths"
        end
        value.dup.freeze
      end
    end
  end
end
