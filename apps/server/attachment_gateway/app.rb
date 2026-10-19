# frozen_string_literal: true

require "base64"
require "digest"
require "rack"
require "timeout"
require_relative "authority"
require_relative "protocol"
require_relative "draft_stage"

module Elevateo
  module AttachmentGateway
    class App
      include DraftStage
      MAX_BYTES = 10 * 1024 * 1024
      RESPONSE_HEADERS = { "Cache-Control" => "no-store", "X-Content-Type-Options" => "nosniff",
                           "Content-Type" => "application/octet-stream",
                           "Content-Disposition" => 'attachment; filename="attachment"' }.freeze

      def initialize(key:, authority:, storage:, slots: 4, clock: -> { Time.now.to_i })
        raise ArgumentError, "invalid gateway key" unless key.is_a?(String) && key.bytesize == 32
        raise ArgumentError, "invalid gateway capacity" unless slots.is_a?(Integer) && slots.between?(1, 16)
        @key, @authority, @storage, @clock = key, authority, storage, clock
        @slots = SizedQueue.new(slots)
        slots.times { @slots << true }
      end

      def call(env)
        @slots.pop(true)
        acquired = true
        return stage_draft(env) if env["PATH_INFO"] == DraftAttachmentRequest::PATH
        claim = Protocol.verify(env, key: @key, now: @clock.call)
        first = @authority.clean_binding(claim)
        bytes = Timeout.timeout(22) { @storage.get(first.fetch("storage_key")) }
        raise Unavailable unless bytes.is_a?(String) && bytes.bytesize == Integer(first.fetch("byte_size").to_s, 10) &&
          bytes.bytesize.between?(1, MAX_BYTES) && Digest::SHA256.hexdigest(bytes) == first.fetch("sha256")
        second = @authority.clean_binding(claim)
        raise Denied unless second == first && claim["expires_at"] >= @clock.call
        [200, RESPONSE_HEADERS.merge("Content-Length" => bytes.bytesize.to_s), [bytes]]
      rescue Denied
        denied
      rescue StandardError
        unavailable
      ensure
        @slots << true if acquired
      end

      def self.from_env(env = ENV)
        raise ArgumentError, "gateway process required" unless env["ELEVATEO_PROCESS"] == "attachment_gateway"
        key = Base64.strict_decode64(env.fetch("ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"))
        database_name = env.fetch("ELEVATEO_DB_NAME")
        raise ArgumentError, "invalid database name" unless /\A[a-zA-Z][a-zA-Z0-9_]{0,62}\z/.match?(database_name)
        require_relative "../lib/elevateo/attachments_storage"
        storage = Elevateo::Attachments::PrivateStorage.new(base_url: env.fetch("ELEVATEO_STORAGE_URL"),
          bucket: env.fetch("ELEVATEO_ATTACHMENT_BUCKET"),
          service_token: env.fetch("ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN"), process: "attachment_gateway")
        new(key: key, authority: Authority.new(gateway_database_url: env.fetch("ELEVATEO_ATTACHMENT_GATEWAY_DATABASE_URL"),
          database_name: database_name), storage: storage)
      rescue KeyError, ArgumentError
        raise ArgumentError, "invalid attachment gateway configuration"
      end

      private

      def denied
        [404, { "Cache-Control" => "no-store", "X-Content-Type-Options" => "nosniff",
                "Content-Type" => "application/octet-stream", "Content-Length" => "0" }, []]
      end

      def unavailable
        [503, { "Cache-Control" => "no-store", "X-Content-Type-Options" => "nosniff",
                "Content-Type" => "application/octet-stream", "Content-Length" => "0",
                "Retry-After" => "1" }, []]
      end
    end
  end
end
