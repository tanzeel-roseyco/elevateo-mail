# frozen_string_literal: true

require "json"

module Elevateo
  module Attachments
    # AIDEV-NOTE: One claim per tick bounds in-flight work; Storage/ClamAV own I/O deadlines and SQL owns retry fencing.
    class ScanLoop
      def initialize(scan:, logger:, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) },
        sleeper: ->(seconds) { sleep(seconds) })
        @scan, @logger, @clock, @sleeper = scan, logger, clock, sleeper
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
        counts = @scan.call
        unless counts.keys.sort == %w[clean held malware] &&
            counts.values.all? { |value| value.is_a?(Integer) && value.between?(0, 1) } && counts.values.sum <= 1
          raise ArgumentError, "invalid scanner batch result"
        end
        return failed(:held) if counts.fetch("held") == 1
        @failures = 0
        counts.values.sum.zero? ? [:idle, 1.0] : [:scanned, 0.05]
      rescue StandardError
        failed(:failed)
      end

      def failed(outcome)
        # AIDEV-NOTE: Provider errors can contain secrets; logs record fixed categories, never exception text/causes.
        @failures = [@failures + 1, 6].min
        [outcome, [2.0**(@failures - 1), 30.0].min]
      end

      def report(outcome, started, delay)
        now = @clock.call
        last = @last_log_at
        return if outcome == @last_outcome && last && now - last < 60.0
        @logger.call(JSON.generate(event: "attachment_scanner.scan", result: outcome.to_s,
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
