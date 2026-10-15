# frozen_string_literal: true

require_relative "executor"
require_relative "database_store"

module Elevateo
  module SendWorker
    class Drain
      def initialize(connection:, control:, driver:, max_steps: 32, max_seconds: 30,
        idle_delay: 1.0, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }, sleeper: ->(seconds) { Kernel.sleep(seconds) })
        unless max_steps.is_a?(Integer) && max_steps.between?(1, 32) &&
            (max_seconds.is_a?(Integer) || max_seconds.is_a?(Float)) &&
            max_seconds.finite? && max_seconds.positive? && max_seconds <= 60 &&
            (idle_delay.is_a?(Integer) || idle_delay.is_a?(Float)) &&
            idle_delay.finite? && idle_delay.between?(0.05, 30)
          raise ArgumentError, "invalid drain limits"
        end
        # AIDEV-NOTE: The adapter owns its SQL profile; no caller override may silently pair Mox with synthetic receipts.
        raise ArgumentError, "worker transport profile required" unless driver.respond_to?(:database_profile)
        profile = driver.database_profile
        raise ArgumentError, "invalid worker transport profile" unless profile.is_a?(String) && DatabaseStore::PROFILES.key?(profile)
        @profile = profile.dup.freeze
        @connection, @control, @driver = connection, control, driver
        @max_steps, @max_seconds, @idle_delay = max_steps, max_seconds.to_f, idle_delay.to_f
        @clock, @sleeper = clock, sleeper
      end

      # AIDEV-NOTE: max_seconds bounds admission, not an in-flight step; SQL and transport retain their own deadlines.
      def run
        deadline = @clock.call + @max_seconds
        steps = 0
        idle_checks = 0
        excluded = [] # : Array[String]
        while steps < @max_steps && @clock.call < deadline
          state = @control.read
          break unless state.submission_allowed?
          epoch = state.epoch
          break unless epoch
          send_id = DatabaseStore.next_due_send(connection: @connection, epoch: epoch, excluded: excluded)
          unless send_id
            idle_checks += 1
            break if idle_checks >= 2
            remaining = deadline - @clock.call
            break unless remaining.positive?
            @sleeper.call([@idle_delay, remaining].min)
            next
          end
          # AIDEV-NOTE: A slow advisory lookup must not start a new atomic claim after the admission window closes.
          break if @clock.call >= deadline
          idle_checks = 0
          raise DatabaseStore::InvalidResult, "due lookup repeated an excluded send" if excluded.include?(send_id)
          excluded << send_id
          store = DatabaseStore.new(connection: @connection, send_id: send_id, profile: @profile)
          Executor.new(store: store, driver: @driver, control: @control).run_once
          steps += 1
        end
        steps
      end
    end
  end
end
