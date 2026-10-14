# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/outreach_sequence/draft_input"

class OutreachSequenceDraftInputTest < Minitest::Test
  Input = Elevateo::OutreachSequence::DraftInput
  ID = "11111111-1111-4111-8111-111111111111"
  CAMPAIGN = "22222222-2222-4222-8222-222222222222"
  OPERATION = "33333333-3333-4333-8333-333333333333"
  STEP = "44444444-4444-4444-8444-444444444444"

  def value
    { "id" => ID, "campaign_id" => CAMPAIGN, "operation_id" => OPERATION,
      "expected_version" => nil, "status" => "held", "timezone" => "Europe/Berlin",
      "steps" => [{ "id" => STEP, "position" => 1, "delay_seconds" => 3600,
        "local_time" => "09:00:00", "label" => "First note" }] }
  end

  def test_valid_held_draft_is_immutable_and_replay_fingerprint_stable
    first = Input.new(value: value)
    assert_equal "held", first.status
    assert_equal 1, first.steps.length
    assert_equal first.fingerprint, Input.new(value: value).fingerprint
    assert first.steps.first.frozen?
  end

  def test_rejects_missing_extra_and_out_of_order_steps
    assert_raises(ArgumentError) { Input.new(value: value.merge("extra" => "x")) }
    assert_raises(ArgumentError) { Input.new(value: value.reject { |key, _| key == "steps" }) }
    wrong = value
    wrong["steps"][0]["position"] = 2
    assert_raises(ArgumentError) { Input.new(value: wrong) }
  end

  def test_rejects_duplicate_steps_invalid_delay_and_empty_or_control_label
    duplicate = value
    duplicate["steps"] << duplicate["steps"].first.dup.merge("position" => 2)
    assert_raises(ArgumentError) { Input.new(value: duplicate) }
    over = value
    over["steps"][0]["delay_seconds"] = 2_592_001
    assert_raises(ArgumentError) { Input.new(value: over) }
    ["", "hello\nworld"].each do |label|
      invalid = value
      invalid["steps"][0]["label"] = label
      assert_raises(ArgumentError) { Input.new(value: invalid) }
    end
  end

  def test_rejects_unknown_timezone_and_wrong_version
    assert_raises(ArgumentError) { Input.new(value: value.merge("timezone" => "No/SuchZone")) }
    assert_raises(ArgumentError) { Input.new(value: value.merge("expected_version" => 0)) }
  end
end
