# frozen_string_literal: true

require "timeout"
require_relative "auth_error"

module Elevateo
  # AIDEV-NOTE: A single monotonic budget covers input, Auth, SQL and serialization; each Auth exchange is capped at 2s.
  class RequestDeadline
    class Expired < StandardError; end
    def initialize(seconds: 10.0, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
      @clock = clock
      @expires = @clock.call + seconds
    end

    def remaining
      seconds = @expires - @clock.call
      raise AuthError.new if seconds <= 0
      seconds
    end

    def check! = remaining
    def timeout(cap = 2.0) = [remaining, cap].min

    def within(cap = 10.0)
      Timeout.timeout(timeout(cap), Expired) { yield }
    rescue Expired
      raise AuthError.new
    end
  end
end
