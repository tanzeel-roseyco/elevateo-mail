# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/send_worker/drain"

class SendWorkerDrainTest < Minitest::Test
  EPOCH = "a1111111-1111-4111-8111-111111111111"

  def test_integer_and_float_idle_delays_reach_sleeper_as_floats
    [1, 0.05].each do |delay|
      slept = []
      drain = build(delay, sleeper: ->(seconds) { slept << seconds })
      Elevateo::SendWorker::DatabaseStore.stub(:next_due_send, nil) do
        assert_equal 0, drain.run
      end
      assert_equal [delay.to_f], slept
    end
  end

  def test_invalid_idle_delays_fail_before_due_lookup
    [nil, "1", 0, -1, 0.049, 31, Float::NAN, Float::INFINITY, -Float::INFINITY].each do |delay|
      assert_raises(ArgumentError) { build(delay) }
    end
  end

  private

  def build(delay, sleeper: ->(_seconds) {})
    state = Struct.new(:epoch) do
      def submission_allowed? = true
    end.new(EPOCH)
    control = Struct.new(:state) do
      def read = state
    end.new(state)
    Elevateo::SendWorker::Drain.new(connection: Object.new, control: control, driver: Object.new,
      idle_delay: delay, clock: -> { 0.0 }, sleeper: sleeper)
  end
end
