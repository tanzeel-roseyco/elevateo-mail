# frozen_string_literal: true

require "json"
require "open3"
require "rbconfig"
require "uri"
require "/workspace/apps/server/test/inbound/worker_environment"

# AIDEV-NOTE: Spawn the shipped scanner in the disposable namespace; never echo private child output on failure.
module ScannerProcess
  include InboundWorkerEnvironment

  def scanner_environment(path)
    url = URI.parse(ENV.fetch("BE02_WORKER_DATABASE_URL"))
    runtime = worker_environment.reject { |key, _value| key.start_with?("ELEVATEO_IMAP_") }.merge(
      "ELEVATEO_DB_HOST" => url.host, "ELEVATEO_DB_NAME" => url.path.delete_prefix("/"),
      "WORKER_DB_PASSWORD" => URI.decode_www_form_component(url.password),
      "ELEVATEO_SCAN_PROFILE" => "private-storage-test-v1", "ELEVATEO_SCAN_STORAGE_TOKEN_PATH" => path,
      "ELEVATEO_SCAN_STORAGE_BUCKET" => "be02-attachments")
    ENV.to_h.select { |key, _value| %w[PATH HOME GEM_HOME GEM_PATH BUNDLE_GEMFILE BUNDLE_PATH RUBYOPT].include?(key) }.merge(runtime)
  end

  def scanner_event(line)
    # AIDEV-NOTE: Reject unknown private child output before Minitest can display values or parser excerpts.
    row = JSON.parse(line)
    valid = row.is_a?(Hash) && row["simulated"] == true
    if valid && row["event"] == "attachment_scanner.scan"
      elapsed, retry_seconds = row.values_at("elapsed_ms", "retry_seconds")
      valid = row.keys.sort == %w[elapsed_ms event result retry_seconds simulated] &&
        %w[idle scanned held failed].include?(row["result"]) &&
        [elapsed, retry_seconds].all? { |value| value.is_a?(Numeric) && value.finite? && value >= 0 } &&
        elapsed <= 1_000_000 && retry_seconds <= 30
    else
      valid &&= row.keys.sort == %w[event simulated] &&
        %w[attachment_scanner.startup_failed attachment_scanner.cleanup_failed].include?(row["event"])
    end
    raise "invalid scanner fixture event" unless valid
    row
  rescue JSON::ParserError
    raise "invalid scanner fixture event", cause: nil
  end

  def scanner_process(env, arguments, signal: nil, signal_result: "idle")
    events, buffer = [], +""
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 45
    Open3.popen2e(env, RbConfig.ruby, "/workspace/apps/server/bin/attachment-scanner", *arguments,
      unsetenv_others: true) do |input, output, waiter|
      input.close
      signalled = false
      begin
        loop do
          raise "scanner fixture process deadline" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
          next unless IO.select([output], nil, nil, 0.1)
          chunk = output.read_nonblock(4096, exception: false)
          break if chunk.nil?
          next if chunk == :wait_readable
          buffer << chunk
          raise "scanner fixture output bound" if buffer.bytesize > 65_536
          while (line = buffer.slice!(/.*\n/))
            row = scanner_event(line)
            raise "scanner fixture event bound" unless events.length < 64
            events << row
            if signal && !signalled && row["result"] == signal_result
              Process.kill(signal, waiter.pid)
              signalled = true
            end
          end
        end
        raise "unterminated scanner event" unless buffer.empty?
        remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
        raise "scanner fixture exit deadline" unless remaining.positive? && waiter.join(remaining)
        [waiter.value.exitstatus, events, signalled]
      ensure
        if waiter.alive?
          begin
            Process.kill("KILL", waiter.pid)
          rescue Errno::ESRCH
            # AIDEV-NOTE: Natural exit may win the alive/kill race; still join the exact owned child.
          end
          raise "scanner fixture cleanup deadline" unless waiter.join(5)
        end
      end
    end
  end
end
