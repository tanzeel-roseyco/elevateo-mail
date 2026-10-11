# frozen_string_literal: true

require "securerandom"

module Elevateo
  module Heartbeat
    PATH = "/tmp/worker.alive"
    MAX_BYTES = 20

    # AIDEV-NOTE: Rename publishes a complete timestamp; liveness does not imply DB or job readiness.
    def self.publish(path = PATH, now: Time.now.to_i)
      temporary = "#{path}.#{SecureRandom.hex(12)}.tmp"
      owned = false
      begin
        File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |file|
          owned = true
          file.write(now.to_s)
        end
        File.rename(temporary, path)
        owned = false
      ensure
        File.unlink(temporary) if owned
      end
    end

    def self.healthy?(path = PATH, now: Time.now.to_i)
      value = File.open(path, "rb") { |file| file.read(MAX_BYTES + 1) }
      return false unless value && value.bytesize <= MAX_BYTES && /\A[0-9]{1,19}\z/.match?(value)

      age = now - Integer(value, 10)
      age.between?(0, 5)
    rescue SystemCallError, IOError
      false
    end
  end
end
