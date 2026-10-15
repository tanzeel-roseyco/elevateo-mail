# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/poll_loop"

class InboundPollLoopTest < Minitest::Test
  def setup
    @time, @calls, @stopping = 0.0, 0, false
    @logs, @sleeps, @starts = [], [], []
  end

  def build(outcomes, stop_after: outcomes.length, on_sleep: nil)
    poll = lambda do
      @starts << @time
      item = outcomes.fetch(@calls)
      @calls += 1
      @stopping = true if @calls == stop_after
      raise item if item.is_a?(Exception)
      item
    end
    Elevateo::Inbound::PollLoop.new(poll: poll, logger: ->(line) { @logs << JSON.parse(line) },
      clock: -> { @time }, sleeper: lambda { |seconds|
        @sleeps << seconds
        @time += seconds
        on_sleep&.call
      })
  end

  def test_idle_waits_one_second_and_success_yields_before_next_account
    assert_equal :stopped, build([:idle, :polled, :idle]).run(stop: -> { @stopping })
    assert_equal 3, @calls
    assert_in_delta 1.0, @starts[1], 0.00001
    assert_in_delta 1.05, @starts[2], 0.00001
    assert(@sleeps.all? { |seconds| seconds.positive? && seconds <= 0.1 })
  end

  def test_failure_backoff_is_capped_and_resets_after_recovery
    failure = RuntimeError.new("private-password-and-message")
    outcomes = [failure] * 8 + [:polled, failure, :idle]
    build(outcomes).run(stop: -> { @stopping })
    expected = [1, 2, 4, 8, 16, 30, 30, 30, 0.05, 1]
    @starts.each_cons(2).with_index do |(left, right), index|
      assert_in_delta expected.fetch(index), right - left, 0.00001
    end
    refute_includes JSON.generate(@logs), "private-password-and-message"
    assert(@logs.all? { |row| row.keys.sort == %w[elapsed_ms event result retry_seconds simulated] })
    assert(@logs.all? { |row| row.fetch("simulated") })
  end

  def test_once_returns_without_sleep_and_reports_failures
    [[:idle, :idle], [:polled, :polled], [RuntimeError.new("secret"), :failed], [nil, :failed]].each do |input, result|
      setup
      assert_equal result, build([input], stop_after: 2).run(stop: -> { @stopping }, once: true)
      assert_empty @sleeps
      assert_equal 1, @calls
      assert_equal result.to_s, @logs.fetch(0).fetch("result")
    end
  end

  def test_pre_stopped_loop_never_admits_work
    @stopping = true
    assert_equal :stopped, build([]).run(stop: -> { @stopping })
    assert_equal 0, @calls
    assert_empty @logs
  end

  def test_signal_during_idle_wait_stops_without_another_poll
    runner = build([:idle, :polled], on_sleep: -> { @stopping = true })
    assert_equal :stopped, runner.run(stop: -> { @stopping })
    assert_equal 1, @calls
    assert_equal [0.1], @sleeps
  end

  def test_stop_set_during_poll_allows_result_but_no_further_wait
    assert_equal :stopped, build([:polled]).run(stop: -> { @stopping })
    assert_equal 1, @calls
    assert_empty @sleeps
    assert_equal "polled", @logs.fetch(0).fetch("result")
  end

  def test_unchanged_outcome_logs_at_most_once_a_minute
    build([:idle] * 62).run(stop: -> { @stopping })
    assert_equal 2, @logs.length
    assert(@logs.all? { |row| row.fetch("result") == "idle" })
  end

  def test_logging_failure_propagates_to_process_exit_instead_of_disappearing
    runner = Elevateo::Inbound::PollLoop.new(poll: -> { :idle }, logger: ->(_line) { raise IOError, "closed" })
    assert_raises(IOError) { runner.run(stop: -> { false }, once: true) }
  end
end
