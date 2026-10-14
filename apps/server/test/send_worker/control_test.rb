# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require_relative "../../lib/elevateo/send_worker/control"

class SendWorkerControlTest < Minitest::Test
  EPOCH = "a1111111-1111-4111-8111-111111111111"

  def setup
    @directory = Dir.mktmpdir("be03-worker-control-")
    @path = File.join(@directory, "control.json")
    @control = Elevateo::SendWorker::Control.new(path: @path)
  end

  def teardown = FileUtils.remove_entry(@directory)

  def test_missing_unreadable_and_non_regular_control_are_held
    assert_held
    Dir.mkdir(@path)
    assert_held
    Dir.rmdir(@path)
    File.mkfifo(@path)
    assert_held
  end

  def test_readable_control_release_and_hold_preserve_epoch
    write(JSON.generate({ "epoch" => EPOCH, "outbound_held" => false }))
    state = @control.read
    assert state.readable?
    assert state.submission_allowed?
    assert_equal EPOCH, state.epoch
    assert state.frozen?
    assert state.epoch.frozen?
    write(JSON.generate({ "epoch" => EPOCH, "outbound_held" => true }))
    state = @control.read
    assert state.readable?
    refute state.submission_allowed?
    assert_equal EPOCH, state.epoch
  end

  def test_invalid_duplicate_extra_keys_and_oversized_control_fail_closed
    ["", "null", "[]", "\xFF", "x" * 4097,
      '{"epoch":"' + EPOCH + '","outbound_held":false,"outbound_held":true}',
      JSON.generate({ "epoch" => EPOCH.upcase, "outbound_held" => false }),
      JSON.generate({ "epoch" => EPOCH, "outbound_held" => "false" }),
      JSON.generate({ "epoch" => EPOCH, "outbound_held" => false, "override" => true }),
      JSON.generate({ "epoch" => nil, "outbound_held" => false })].each do |bytes|
      write(bytes)
      assert_held
    end
  end

  def test_nil_epoch_cannot_be_released_and_state_copies_epoch
    epoch = EPOCH.dup
    state = Elevateo::SendWorker::ControlState.new(epoch: epoch, outbound_held: false)
    epoch.replace("changed")
    assert_equal EPOCH, state.epoch
    state = Elevateo::SendWorker::ControlState.new(epoch: nil, outbound_held: false)
    refute state.submission_allowed?
    assert state.outbound_held
  end

  private

  def write(bytes) = File.binwrite(@path, bytes)

  def assert_held
    state = @control.read
    refute state.readable?
    refute state.submission_allowed?
    assert state.outbound_held
    assert_nil state.epoch
  end
end
