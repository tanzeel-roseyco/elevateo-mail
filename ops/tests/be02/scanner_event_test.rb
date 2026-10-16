# frozen_string_literal: true

require "minitest/autorun"
require_relative "scanner_process"

class ScannerEventTest < Minitest::Test
  include ScannerProcess

  def event
    { "event" => "attachment_scanner.scan", "result" => "idle", "elapsed_ms" => 0.2,
      "retry_seconds" => 1, "simulated" => true }
  end

  def test_only_fixed_events_and_bounded_metrics_cross_output_boundary
    assert_equal event, scanner_event(JSON.generate(event))
    %w[startup_failed cleanup_failed].each do |name|
      row = { "event" => "attachment_scanner.#{name}", "simulated" => true }
      assert_equal row, scanner_event(JSON.generate(row))
    end
  end

  def test_unexpected_output_cannot_leak_private_values_or_causes
    secret = "synthetic-private-token-marker"
    inputs = [secret, "{#{secret}", JSON.generate(event.merge("result" => secret)),
      JSON.generate(event.merge("extra" => secret)), JSON.generate(event.merge("event" => secret)),
      JSON.generate(event.merge("elapsed_ms" => secret)), JSON.generate(secret), "null", "[]"]
    inputs.each do |line|
      error = assert_raises(RuntimeError) { scanner_event(line) }
      assert_equal "invalid scanner fixture event", error.message
      assert_nil error.cause
      refute_includes error.full_message, secret
    end
  end

  def test_negative_oversize_and_missing_metrics_are_rejected
    [event.merge("elapsed_ms" => -1), event.merge("elapsed_ms" => 1_000_001),
      event.merge("retry_seconds" => 31), event.reject { |key, _value| key == "retry_seconds" },
      event.merge("simulated" => false)].each do |row|
      assert_raises(RuntimeError) { scanner_event(JSON.generate(row)) }
    end
  end
end
