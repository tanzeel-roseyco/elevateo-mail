# frozen_string_literal: true

require "tmpdir"
require_relative "attachment_support"
require_relative "scanner_process"
require_relative "scanner_event_test"

class AttachmentScannerTest < AttachmentFixture
  include ScannerProcess

  def scan_rows(items)
    items.map do |item|
      @admin.exec_params("SELECT id,scan_status,scan_attempt FROM app.inbox_attachments WHERE id=$1", [item.fetch(:id)]).first
    end
  end

  def assert_scan_event(events, result)
    assert_equal [result], (events.map { |event| event.fetch("result") })
    assert_equal %w[elapsed_ms event result retry_seconds simulated], events.first.keys.sort
    assert_equal "attachment_scanner.scan", events.first.fetch("event")
    assert_equal true, events.first.fetch("simulated")
  end

  # AIDEV-NOTE: One ordered scenario keeps deliberately failed claims from contaminating another process fixture.
  def test_shipped_scanner_lifecycle_failure_and_signal_delivery
    Dir.mktmpdir("scanner-process") do |directory|
      token = File.join(directory, "storage-token")
      File.write(token, ENV.fetch("BE02_STORAGE_SERVICE"), mode: "w", perm: 0o600)
      env = scanner_environment(token)
      clean, malware = stage(@fixture, CLEAN), stage(@fixture, EICAR)
      items = [clean, malware]
      items.each { |item| expect(download(item), 423) }
      code, events, = scanner_process(env, ["--once"])
      assert_equal 0, code
      assert_scan_event(events, "scanned")
      # AIDEV-NOTE: Independent SQL proves --once actually claims one item, not merely one reported outcome.
      rows = scan_rows(items)
      assert_equal 1, (rows.count { |row| row.fetch("scan_status") == "pending_scan" })
      assert_equal 1, (rows.sum { |row| Integer(row.fetch("scan_attempt")) })
      code, events, signalled = scanner_process(env, ["--run"], signal: "TERM")
      assert_equal 0, code
      assert_equal true, signalled
      assert_equal %w[scanned idle], (events.map { |event| event.fetch("result") })
      rows = scan_rows(items)
      assert_equal %w[clean malware], (rows.map { |row| row.fetch("scan_status") })
      assert_equal %w[1 1], (rows.map { |row| row.fetch("scan_attempt") })
      assert_equal CLEAN, expect(download(clean), 200).body.b
      expect(download(malware), 423)
      expect(download(clean, client: Be02Http.new), 401)
      code, events, = scanner_process(env, ["--once"])
      assert_equal 0, code
      assert_scan_event(events, "idle")
      assert_equal rows, scan_rows(items)
      code, events, signalled = scanner_process(env, ["--run"], signal: "INT")
      assert_equal 0, code
      assert_equal true, signalled
      assert_scan_event(events, "idle")
      # AIDEV-NOTE: Missing bytes must persist a held verdict and fail --once without releasing download rights.
      missing = stage(@fixture, CLEAN)
      @storage.delete(missing.fetch(:key))
      code, events, = scanner_process(env, ["--once"])
      assert_equal 1, code
      assert_scan_event(events, "held")
      assert_equal "scan_failed", scan_rows([missing]).first.fetch("scan_status")
      assert_equal "1", scan_rows([missing]).first.fetch("scan_attempt")
      expect(download(missing), 423)
      @admin.exec_params("UPDATE app.inbox_attachments SET scan_next_at=now() WHERE id=$1", [missing.fetch(:id)])
      code, events, signalled = scanner_process(env, ["--run"], signal: "TERM", signal_result: "held")
      assert_equal 0, code
      assert_equal true, signalled
      assert_scan_event(events, "held")
      assert_equal "2", scan_rows([missing]).first.fetch("scan_attempt")
      expect(download(missing), 423)
      snapshot = scan_rows([*items, missing])
      variants = [[env, []], [env.merge("ELEVATEO_SCAN_PROFILE" => "live"), ["--once"]],
        [env.merge("ELEVATEO_SCAN_STORAGE_TOKEN_PATH" => File.join(directory, "absent")), ["--once"]],
        [env.merge("ELEVATEO_DB_ROLE" => "elevateo_api"), ["--once"]]]
      variants.each do |settings, arguments|
        code, events, = scanner_process(settings, arguments)
        assert_equal 1, code
        assert_equal [{ "event" => "attachment_scanner.startup_failed", "simulated" => true }], events
        assert_equal snapshot, scan_rows([*items, missing])
      end
    end
  end
end
