# frozen_string_literal: true

module Elevateo
  module SendWorker
    class CallDeadline
      class Expired < StandardError; end

      # AIDEV-NOTE: SQL allocates the call budget; this monotonic check cannot revoke a suspended invoker.
      def initialize(seconds:, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
        unless seconds.is_a?(Numeric) && seconds.finite? && seconds.positive? && seconds <= 10
          raise ArgumentError, "invalid local call budget"
        end
        @clock = clock
        @expires = @clock.call + seconds
      end

      def check!
        raise Expired, "local call deadline expired" if @clock.call >= @expires
        nil
      end
    end
  end
end
