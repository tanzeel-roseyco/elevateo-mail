# frozen_string_literal: true

require_relative "attachments"

module Elevateo
  module Attachments
    # AIDEV-NOTE: Each snapshot closes its tenant read transaction before private bytes cross the network.
    class DownloadService
      class Unavailable < StandardError; end

      def initialize(snapshot:, gateway:, clock: -> { Time.now.to_i })
        @snapshot, @gateway, @clock = snapshot, gateway, clock
      end

      def fetch
        first = @snapshot.call
        expiry = first.fetch(:fields).fetch("expires_at")
        raise NotAvailable unless expiry.is_a?(Integer) && @clock.call <= expiry
        bytes = @gateway.download(fields: first.fetch(:fields), timeout: 5)
        second = @snapshot.call
        raise NotAvailable unless second == first
        raise NotAvailable unless @clock.call <= expiry
        raise Unavailable unless bytes.is_a?(String) && bytes.bytesize == first.fetch(:byte_size) &&
          bytes.bytesize.between?(1, MAX_BYTES)
        bytes.b.freeze
      end
    end
  end
end
