# frozen_string_literal: true

require "timeout"
require_relative "fake_ingress"

module Elevateo
  module Inbound
    # AIDEV-NOTE: Only network calls enter this budget; database transactions must never receive asynchronous timeouts.
    class ImapDeadline
      class Expired < Timeout::Error; end

      def initialize(seconds: 15.0)
        raise Rejected, "invalid_imap_deadline" unless (seconds.is_a?(Integer) || seconds.is_a?(Float)) && seconds.finite? &&
          seconds.positive? && seconds <= 15

        @expires_at = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
      end

      def remaining
        seconds = @expires_at - Process.clock_gettime(Process::CLOCK_MONOTONIC)
        raise Expired, "imap_deadline_exceeded" unless seconds.positive?

        seconds
      end

      def call
        Timeout.timeout(remaining, Expired, "imap_deadline_exceeded") { yield }
      end
    end
  end
end
