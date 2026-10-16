# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require_relative "../../lib/elevateo/attachments_storage"
require_relative "../../lib/elevateo/attachments_scan_loop"
require_relative "storage_deadline_server"

class StorageDeadlineTest < Minitest::Test
  include StorageDeadlineServer
  KEY = "quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222"
  ERROR = Elevateo::Attachments::PrivateStorage::Unavailable
  PRIVATE = [:normal, '{"public":false}'].freeze

  def setup
    @adapter = Elevateo::Attachments::PrivateStorage.new(base_url: "http://storage:5000", bucket: "inbox-private",
      service_token: "synthetic-private-token-should-not-escape", process: "worker")
  end

  def assert_bounded_error(expected)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    error = assert_raises(ERROR) { @adapter.get(KEY) }
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    assert_operator elapsed, :>=, 0.15
    assert_operator elapsed, :<, 1.5
    assert_equal expected, error.message
    assert_nil error.cause
    refute_includes error.full_message, "synthetic-private-token"
  end

  def test_slow_metadata_headers_are_bounded_before_object_access
    with_short_storage_deadlines do |budgets|
      with_storage_server([[:headers, ""]]) do |state|
        assert_bounded_error("private bucket unavailable")
        assert_equal ["/bucket/inbox-private"], state[:paths]
      end
      assert_equal [5.0], budgets
    end
  end

  def test_slow_metadata_body_is_bounded_before_object_access
    with_short_storage_deadlines do |budgets|
      with_storage_server([[:body, "x" * 100]]) do |state|
        assert_bounded_error("private bucket unavailable")
        assert_equal ["/bucket/inbox-private"], state[:paths]
      end
      assert_equal [5.0], budgets
    end
  end

  def test_slow_object_body_and_headers_are_bounded_and_sanitized
    [:body, :headers].each do |kind|
      with_short_storage_deadlines do |budgets|
        with_storage_server([PRIVATE, [kind, "x" * 100]]) do |state|
          assert_bounded_error("private object unavailable")
          assert_equal ["/bucket/inbox-private", "/object/inbox-private/#{KEY}"], state[:paths]
        end
        assert_equal [5.0, 20.0], budgets
      end
    end
  end

  def test_successful_binary_transfer_retains_exact_bytes
    with_short_storage_deadlines do |budgets|
      with_storage_server([PRIVATE, [:normal, "\x00\xffbytes".b]]) do
        assert_equal "\x00\xffbytes".b, @adapter.get(KEY)
      end
      assert_equal [5.0, 20.0], budgets
    end
  end

  def test_truncated_metadata_and_object_fail_closed
    [[[:truncated, '{"public":false}']], [PRIVATE, [:truncated, "partial"]]].each do |scenarios|
      with_short_storage_deadlines do
        with_storage_server(scenarios) do
          error = assert_raises(ERROR) { @adapter.get(KEY) }
          expected = scenarios.length == 1 ? "private bucket unavailable" : "private object unavailable"
          assert_equal expected, error.message
          assert_nil error.cause
          refute_includes error.full_message, "synthetic-private-token"
        end
      end
    end
  end

  def test_scanner_recovers_on_next_tick_and_stops_after_storage_timeout
    with_short_storage_deadlines do
      with_storage_server([PRIVATE, [:body, "x" * 100]]) do
        calls, events, stop, clock = 0, [], false, 0.0
        scan = -> {
          calls += 1
          @adapter.get(KEY) if calls == 1
          stop = true
          { "clean" => 1, "held" => 0, "malware" => 0 }
        }
        loop = Elevateo::Attachments::ScanLoop.new(scan: scan, logger: ->(event) { events << JSON.parse(event) },
          clock: -> { clock }, sleeper: ->(seconds) { clock += seconds })
        assert_equal :stopped, loop.run(stop: -> { stop })
        assert_equal 2, calls
        assert_equal %w[failed scanned], (events.map { |event| event.fetch("result") })
        refute_includes events.to_s, "synthetic-private-token"
      end
    end
  end
end
