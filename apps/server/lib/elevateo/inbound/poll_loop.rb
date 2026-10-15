# frozen_string_literal: true

require "json"

module Elevateo
  module Inbound
    # AIDEV-NOTE: SQL owns per-account schedules; this single-process loop bounds idle/error CPU and shutdown waits.
    class PollLoop
      def initialize(poll:, logger:, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) },
        sleeper: ->(seconds) { sleep(seconds) })
        @poll, @logger, @clock, @sleeper = poll, logger, clock, sleeper
        @failures = 0
        @last_outcome = nil
        @last_log_at = nil
      end

      def run(stop:, once: false)
        until stop.call
          started = @clock.call
          outcome, delay = step
          report(outcome, started, delay)
          return outcome if once
          wait(delay, stop)
        end
        :stopped
      end

      private

      def step
        outcome = @poll.call
        raise ArgumentError, "invalid inbound poll result" unless [:idle, :polled].include?(outcome)
        @failures = 0
        [outcome, outcome == :idle ? 1.0 : 0.05]
      rescue StandardError
        # AIDEV-NOTE: Never log provider exceptions or causes; they may contain credentials, addresses or message bytes.
        @failures = [@failures + 1, 6].min
        [:failed, [2.0**(@failures - 1), 30.0].min]
      end

      def report(outcome, started, delay)
        now = @clock.call
        last = @last_log_at
        return if outcome == @last_outcome && last && now - last < 60.0
        @logger.call(JSON.generate(event: "inbound_worker.poll", result: outcome.to_s,
          elapsed_ms: ((now - started) * 1000).round, retry_seconds: delay, simulated: true))
        @last_outcome, @last_log_at = outcome, now
      end

      def wait(delay, stop)
        deadline = @clock.call + delay
        until stop.call
          remaining = deadline - @clock.call
          break if remaining <= 0
          @sleeper.call([remaining, 0.1].min)
        end
      end
    end
  end
end
