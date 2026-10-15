# frozen_string_literal: true

require "open3"
require "rbconfig"
require "uri"
require "/workspace/apps/server/test/inbound/worker_environment"

# AIDEV-NOTE: Only this disposable Mox namespace supplies process credentials; output is bounded and never echoed.
module MoxInboundProcess
  include InboundWorkerEnvironment

  def process_environment(path)
    url = URI.parse(ENV.fetch("BE02_WORKER_DATABASE_URL"))
    worker_environment.merge("ELEVATEO_DB_HOST" => url.host, "ELEVATEO_DB_NAME" => url.path.delete_prefix("/"),
      "WORKER_DB_PASSWORD" => URI.decode_www_form_component(url.password),
      "ELEVATEO_IMAP_CREDENTIALS_PATH" => path, "ELEVATEO_IMAP_CA_PATH" => self.class::CA)
  end

  def append_process_event(line, events)
    row = JSON.parse(line)
    raise "unexpected inbound fixture event" unless row.is_a?(Hash)
    raise "inbound fixture event bound" if events.length >= 64
    events << row
    row
  end

  def worker_process(env, arguments, signal: nil)
    events, buffer = [], +""
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 30
    Open3.popen2e(env, RbConfig.ruby, "/workspace/apps/server/bin/inbound-worker", *arguments) do |input, output, waiter|
      input.close
      signalled = false
      begin
        loop do
          raise "inbound fixture process deadline" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
          ready = IO.select([output], nil, nil, 0.1)
          next unless ready
          chunk = output.read_nonblock(4096, exception: false)
          break if chunk.nil?
          next if chunk == :wait_readable
          buffer << chunk
          raise "inbound fixture output bound" if buffer.bytesize > 65_536
          while (line = buffer.slice!(/.*\n/))
            row = append_process_event(line, events)
            if signal && !signalled && row["result"] == "idle" && (!block_given? || yield)
              Process.kill(signal, waiter.pid)
              signalled = true
            end
          end
        end
        raise "unterminated inbound fixture event" unless buffer.empty?
        remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
        raise "inbound fixture exit deadline" unless remaining.positive? && waiter.join(remaining)
        [waiter.value.exitstatus, events, signalled]
      ensure
        # AIDEV-NOTE: A failed fixture must reap only its own child; never leak an infinite poll loop into later tests.
        if waiter.alive?
          Process.kill("KILL", waiter.pid)
          raise "inbound fixture cleanup deadline" unless waiter.join(5)
        end
      end
    end
  end
end
