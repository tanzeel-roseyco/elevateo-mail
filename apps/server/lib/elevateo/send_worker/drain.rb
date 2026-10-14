# frozen_string_literal: true

require_relative "executor"
require_relative "database_store"

module Elevateo
  module SendWorker
    class Drain
      def initialize(connection:, control:, driver:, max_steps: 32, max_seconds: 30,
        idle_delay: 1.0, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }, sleeper: ->(seconds) { Kernel.sleep(seconds) })
        unless max_steps.is_a?(Integer) && max_steps.between?(1, 32) &&
            max_seconds.is_a?(Numeric) && max_seconds.positive? && max_seconds <= 60 &&
            idle_delay.is_a?(Float) && idle_delay.between?(0.05, 30)
          raise ArgumentError, "invalid drain limits"
        end
        @connection, @control, @driver = connection, control, driver
        @max_steps, @max_seconds, @idle_delay = max_steps, max_seconds, idle_delay
        @clock, @sleeper = clock, sleeper
      end

      # AIDEV-NOTE: Due lookup is advisory; claim_job is the atomic lease. Every invocation exits within fixed bounds.
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
            @sleeper.call(@idle_delay)
            next
          end
          idle_checks = 0
          raise DatabaseStore::InvalidResult, "due lookup repeated an excluded send" if excluded.include?(send_id)
          excluded << send_id
          store = DatabaseStore.new(connection: @connection, send_id: send_id)
          Executor.new(store: store, driver: @driver, control: @control).run_once
          steps += 1
        end
        steps
      end
    end
  end
end
