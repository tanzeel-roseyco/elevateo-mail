# frozen_string_literal: true

require_relative "../config"

module Elevateo
  module Inbound
    # AIDEV-NOTE: This opt-in profile reaches only the isolated Mox namespace; production endpoints remain unavailable.
    class WorkerConfig
      attr_reader :runtime, :credentials_path, :ca_path

      def self.load!(env = ENV) = new(runtime: Config.load!(env), env: env)

      def initialize(runtime:, env:)
        unless runtime.db_role == "elevateo_worker" && runtime.process == "worker" && runtime.outbound_hold &&
            env["ELEVATEO_IMAP_PROFILE"] == "mox-imap-test-v1"
          raise ConfigError, "inbound worker requires the held Mox worker profile"
        end
        @runtime = runtime
        @credentials_path = absolute_path(env["ELEVATEO_IMAP_CREDENTIALS_PATH"])
        @ca_path = absolute_path(env["ELEVATEO_IMAP_CA_PATH"])
        freeze
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
