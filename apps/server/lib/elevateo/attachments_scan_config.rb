# frozen_string_literal: true

require_relative "config"
require_relative "attachments_worker_storage"

module Elevateo
  module Attachments
    # AIDEV-NOTE: Scanning is an independent held worker; it never needs mailbox credentials or an IMAP connection.
    class ScanConfig
      attr_reader :runtime, :storage

      def self.load!(env = ENV) = new(runtime: Config.load!(env), env: env)

      def initialize(runtime:, env:)
        unless runtime.db_role == "elevateo_worker" && runtime.process == "worker" && runtime.outbound_hold &&
            env["ELEVATEO_SCAN_PROFILE"] == "private-storage-test-v1"
          raise ConfigError, "scanner requires the held private storage profile"
        end
        # AIDEV-NOTE: Reuse the audited read-once file boundary; separate names prevent inheriting IMAP credentials.
        storage = WorkerStorage.load!({
          "ELEVATEO_INBOUND_STORAGE_TOKEN_PATH" => env["ELEVATEO_SCAN_STORAGE_TOKEN_PATH"],
          "ELEVATEO_INBOUND_STORAGE_BUCKET" => env["ELEVATEO_SCAN_STORAGE_BUCKET"] })
        raise ConfigError, "scanner storage configuration required" unless storage
        @runtime, @storage = runtime, storage
        freeze
      end

      def inspect = "#<Elevateo::Attachments::ScanConfig redacted>"
      alias to_s inspect
    end
  end
end
