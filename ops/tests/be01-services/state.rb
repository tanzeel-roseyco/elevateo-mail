# frozen_string_literal: true

require "securerandom"
require_relative "http"

module Be01Services
  # AIDEV-NOTE: State is private task-volume data, never an image layer or console artifact; partial seeds stop.
  module State
    PATH = "/acceptance/state.json"
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/

    def self.write_once(path, data)
      File.open(path, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
        file.write(JSON.generate(data))
        file.flush
        file.fsync
      end
    end

    def self.read(path)
      File.open(path, File::RDONLY | File::NOFOLLOW) do |file|
        Be01Services.expect(file.stat.file? && file.stat.size <= 16_384 && (file.stat.mode & 0o077).zero?,
                            "private bounded state file")
        JSON.parse(file.read)
      end
    end

    def self.validate(data)
      Be01Services.expect(data.is_a?(Hash), "state object")
      %w[org mailbox].each { |key| Be01Services.expect(UUID.match?(data.fetch(key)), "state UUID") }
      Be01Services.expect(/\A[0-9a-f]{32}\z/.match?(data.fetch("nonce")), "state nonce")
      Be01Services.expect(/\A[0-9a-f]{64}\z/.match?(data.fetch("password")), "fixture password")
      data
    end

    def self.load = validate(read(PATH))

    def self.init
      data = { "nonce" => SecureRandom.hex(16), "password" => SecureRandom.hex(32),
               "org" => SecureRandom.uuid, "mailbox" => SecureRandom.uuid }
      write_once(PATH, data)
      data
    end

    def self.email(data, role) = "#{role}-#{data.fetch('nonce')}@be01.invalid"
    def self.bytes(data) = "BE01 private object #{data.fetch('nonce')}\n"

    def self.identities
      ids = read("/acceptance/identities.json")
      Be01Services.expect(ids.is_a?(Array) && ids.length == 2 && ids.uniq.length == 2 &&
                          ids.all? { |id| id.is_a?(String) && UUID.match?(id) }, "real identity pair")
      ids
    end
  end
end
