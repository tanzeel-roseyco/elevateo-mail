# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/send_worker/drain"
require_relative "../../lib/elevateo/send_worker/durable_local_driver"

class SendWorkerDrainBoundsTest < Minitest::Test
  EPOCH = "a1111111-1111-4111-8111-111111111111"
  SEND_ID = "a2222222-2222-4222-8222-222222222222"

  def test_idle_sleep_is_clamped_to_remaining_admission_window
    slept = []
    drain = build(clock: sequence(0.0, 0.1, 0.2, 1.0), sleeper: ->(seconds) { slept << seconds })
    Elevateo::SendWorker::DatabaseStore.stub(:next_due_send, nil) { assert_equal 0, drain.run }
    assert_equal [0.8], slept
  end

  def test_expired_window_does_not_query_due_work
    drain = build(clock: sequence(0.0, 1.0))
    Elevateo::SendWorker::DatabaseStore.stub(:next_due_send, ->(**_args) { flunk "queried after deadline" }) do
      assert_equal 0, drain.run
    end
  end

  def test_slow_lookup_cannot_start_an_atomic_claim_after_window_expires
    drain = build(clock: sequence(0.0, 0.2, 1.0))
    Elevateo::SendWorker::DatabaseStore.stub(:next_due_send, SEND_ID) do
      Elevateo::SendWorker::DatabaseStore.stub(:new, ->(**_args) { flunk "created store after deadline" }) do
        assert_equal 0, drain.run
      end
    end
  end

  def test_a_step_admitted_in_time_finishes_and_prevents_another_step
    steps = 0
    clock = 0.0
    executor = Object.new
    # AIDEV-NOTE: Drain leaves in-flight execution to Executor; this assertion detects a second invocation only.
    executor.define_singleton_method(:run_once) { steps += 1; clock = 2.0; :unknown }
    drain = build(clock: -> { clock })
    Elevateo::SendWorker::DatabaseStore.stub(:next_due_send, SEND_ID) do
      Elevateo::SendWorker::DatabaseStore.stub(:new, Object.new) do
        Elevateo::SendWorker::Executor.stub(:new, executor) { assert_equal 1, drain.run }
      end
    end
    assert_equal 1, steps
  end

  def test_nonfinite_and_unsupported_windows_are_rejected
    [nil, "1", 0, -1, 61, Float::NAN, Float::INFINITY, -Float::INFINITY, Complex(1, 2)].each do |seconds|
      assert_raises(ArgumentError) { build(clock: -> { 0.0 }, max_seconds: seconds) }
    end
  end

  private

  def sequence(*times)
    last = times.last
    -> { times.empty? ? last : times.shift }
  end

  def build(clock:, sleeper: ->(_seconds) {}, max_seconds: 1)
    state = Struct.new(:epoch) { def submission_allowed? = true }.new(EPOCH)
    control = Struct.new(:state) { def read = state }.new(state)
    driver = Elevateo::SendWorker::DurableLocalDriver.new(path: "/unused/drain-test.jsonl", outcome: "accept")
    Elevateo::SendWorker::Drain.new(connection: Object.new, control: control, driver: driver,
      max_seconds: max_seconds, idle_delay: 30, clock: clock, sleeper: sleeper)
  end
end
