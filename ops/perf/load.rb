# frozen_string_literal: true

# PERF-01 HTTP load client. Runs inside the perf-load container (the task's server image) with Ruby stdlib only:
# no new runtime dependency. Emits one JSON document on stdout; progress and diagnostics go to stderr.
#
# AIDEV-NOTE: Ruby's GVL serializes the client threads, so this client measures the server relative to an identical
# client, not absolute server capacity. If client CPU (docker stats of perf-load) reaches its cap while api stays
# below its own, the client is the bottleneck and the run is marked `client_saturated_hint`.
#
# Timing: Process::CLOCK_MONOTONIC around Net::HTTP#request, including reading the full body, observed from the
# client container over the internal bridge network. Percentiles use nearest-rank on sorted samples and are only
# reported when at least MIN_SAMPLES_FOR_PERCENTILES samples exist; otherwise median/min/max/count are reported.
require "json"
require "net/http"
require "optparse"
require "uri"

module Perf01Load
  MIN_SAMPLES_FOR_PERCENTILES = 1_000
  ALLOWED_HOSTS = %w[api].freeze
  MAX_CONCURRENCY = 64
  MAX_DURATION = 600
  MAX_STORED_SAMPLES = 2_000_000

  Options = Struct.new(:url, :concurrency, :duration, :warmup, :mode, :label, :expect_status, :max_error_rate,
                       :min_requests_before_abort, :store_samples, keyword_init: true)

  def self.parse(argv)
    opts = Options.new(concurrency: 1, duration: 10, warmup: 0, mode: "keepalive", label: "", expect_status: 200,
                       max_error_rate: 0.05, min_requests_before_abort: 50, store_samples: true)
    parser = OptionParser.new do |o|
      o.banner = "usage: ruby load.rb --url http://api:3000/health [options]"
      o.on("--url URL", "target; host must be the api service") { |v| opts.url = v }
      o.on("--concurrency N", Integer, "client threads, 1..#{MAX_CONCURRENCY}") { |v| opts.concurrency = v }
      o.on("--duration S", Integer, "measured seconds, 1..#{MAX_DURATION}") { |v| opts.duration = v }
      o.on("--warmup S", Integer, "unrecorded seconds before measurement") { |v| opts.warmup = v }
      o.on("--mode MODE", %w[keepalive new], "keepalive (one persistent connection per thread) or new (connect per request)") { |v| opts.mode = v }
      o.on("--label TEXT", "free-text run label copied into the output") { |v| opts.label = v }
      o.on("--expect-status CODE", Integer, "any other status counts as an error (default 200)") { |v| opts.expect_status = v }
      o.on("--max-error-rate R", Float, "abort when errors/requests exceeds R after the minimum (default 0.05)") { |v| opts.max_error_rate = v }
      o.on("--min-requests-before-abort N", Integer, "default 50") { |v| opts.min_requests_before_abort = v }
      o.on("--no-samples", "omit raw samples from the output") { opts.store_samples = false }
    end
    parser.parse!(argv)
    validate!(opts, parser)
    opts
  end

  def self.validate!(opts, parser)
    uri = URI.parse(opts.url.to_s)
    fail_usage(parser, "url must be plain http to the api service") unless uri.is_a?(URI::HTTP) && !uri.is_a?(URI::HTTPS) && ALLOWED_HOSTS.include?(uri.host)
    fail_usage(parser, "concurrency out of range") unless (1..MAX_CONCURRENCY).cover?(opts.concurrency)
    fail_usage(parser, "duration out of range") unless (1..MAX_DURATION).cover?(opts.duration)
    fail_usage(parser, "warmup out of range") unless (0..MAX_DURATION).cover?(opts.warmup)
    fail_usage(parser, "max-error-rate must be within 0..1") unless (0.0..1.0).cover?(opts.max_error_rate)
  rescue URI::InvalidURIError
    fail_usage(parser, "url is not a valid URI")
  end

  def self.fail_usage(parser, message)
    warn "load.rb: #{message}"
    warn parser
    exit 2
  end

  class Worker
    attr_reader :latencies_us, :status_counts, :errors, :requests

    def initialize(uri, mode, expect_status)
      @uri = uri
      @mode = mode
      @expect_status = expect_status
      @request = Net::HTTP::Get.new(uri.request_uri, "Accept" => "application/json", "User-Agent" => "perf01-load")
      @http = nil
      reset!
    end

    def reset!
      @latencies_us = []
      @status_counts = Hash.new(0)
      @errors = Hash.new(0)
      @requests = 0
    end

    # Runs until the monotonic deadline or until the shared stop flag is raised. Recording is disabled for warmup.
    def run(deadline, stop, record:)
      while !stop.call && now < deadline
        t0 = now
        begin
          response = perform
          elapsed_us = ((now - t0) * 1_000_000).round
          @requests += 1
          next unless record
          @status_counts[response.code] += 1
          if response.code.to_i == @expect_status
            @latencies_us << elapsed_us
          else
            @errors["status_#{response.code}"] += 1
          end
        rescue Net::OpenTimeout, Net::ReadTimeout, IOError, EOFError, SystemCallError, Timeout::Error => e
          @requests += 1
          @errors[e.class.name] += 1 if record
          close
        end
      end
    end

    # Keep-alive connections survive the warmup phase so measurement does not start with a reconnect.
    def close
      @http&.finish if @http&.started?
    rescue IOError
      nil
    ensure
      @http = nil
    end

    private

    def now = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    def perform
      if @mode == "keepalive"
        @http ||= connect
        @http.request(@request)
      else
        connect.start { |h| h.request(@request) }
      end
    end

    def connect
      http = Net::HTTP.new(@uri.host, @uri.port)
      http.open_timeout = 5
      http.read_timeout = 10
      http.keep_alive_timeout = 60
      @mode == "keepalive" ? http.start : http
    end
  end

  class Run
    def initialize(opts)
      @opts = opts
      @uri = URI.parse(opts.url)
      @stop = false
      @abort_reason = nil
      @workers = Array.new(opts.concurrency) { Worker.new(@uri, opts.mode, opts.expect_status) }
    end

    def execute
      started_at = Time.now.utc
      phase(@opts.warmup, record: false) if @opts.warmup.positive?
      @workers.each(&:reset!)
      measured_started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      phase(@opts.duration, record: true)
      measured_seconds = Process.clock_gettime(Process::CLOCK_MONOTONIC) - measured_started
      finished_at = Time.now.utc
      report(started_at, finished_at, measured_seconds)
    ensure
      @workers.each(&:close)
    end

    private

    def phase(seconds, record:)
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + seconds
      stop = -> { @stop }
      threads = @workers.map { |w| Thread.new { w.run(deadline, stop, record: record) } }
      watchdog = Thread.new { watch(deadline, record) }
      threads.each(&:join)
      @stop = true if record # ensure watchdog exits with the phase
      watchdog.join
      @stop = false unless @abort_reason
    end

    # Aborts the phase when the error rate crosses the threshold, so a broken stack never receives a full run.
    def watch(deadline, record)
      while !@stop && Process.clock_gettime(Process::CLOCK_MONOTONIC) < deadline
        sleep 0.5
        next unless record
        requests = @workers.sum(&:requests)
        errors = @workers.sum { |w| w.errors.values.sum }
        next if requests < @opts.min_requests_before_abort
        rate = errors.fdiv(requests)
        if rate > @opts.max_error_rate
          @abort_reason = "error rate #{rate.round(4)} exceeded #{@opts.max_error_rate} after #{requests} requests"
          warn "load.rb: aborting: #{@abort_reason}"
          @stop = true
        end
      end
    end

    def report(started_at, finished_at, measured_seconds)
      samples = @workers.flat_map(&:latencies_us).sort!
      truncated = samples.length > MAX_STORED_SAMPLES
      stored = truncated ? [] : samples
      errors = @workers.each_with_object(Hash.new(0)) { |w, acc| w.errors.each { |k, v| acc[k] += v } }
      statuses = @workers.each_with_object(Hash.new(0)) { |w, acc| w.status_counts.each { |k, v| acc[k] += v } }
      requests = @workers.sum(&:requests)
      {
        tool: "ops/perf/load.rb",
        ruby: RUBY_DESCRIPTION,
        label: @opts.label,
        url: @opts.url,
        mode: @opts.mode,
        concurrency: @opts.concurrency,
        warmup_s: @opts.warmup,
        duration_s: @opts.duration,
        measured_seconds: measured_seconds.round(3),
        started_at: started_at.iso8601(3),
        finished_at: finished_at.iso8601(3),
        timing_method: "client CLOCK_MONOTONIC around Net::HTTP#request incl. body read, inside perf-load container",
        requests: requests,
        successes: samples.length,
        errors: errors,
        status_counts: statuses,
        throughput_rps: measured_seconds.positive? ? (samples.length / measured_seconds).round(2) : nil,
        latency_us: Stats.summarize(samples),
        percentile_method: "nearest-rank on sorted samples; percentiles null below #{MIN_SAMPLES_FOR_PERCENTILES} samples",
        aborted: !@abort_reason.nil?,
        abort_reason: @abort_reason,
        client_saturated_hint: "compare perf-load cpu_perc in stats.csv with its cap; near-cap client with idle api means client-bound",
        samples_truncated: truncated,
        samples: @opts.store_samples ? stored : nil
      }
    end
  end

  module Stats
    def self.summarize(sorted)
      return { count: 0 } if sorted.empty?
      n = sorted.length
      base = { count: n, min: sorted.first, max: sorted.last, mean: (sorted.sum.fdiv(n)).round(1), median: rank(sorted, 50) }
      return base.merge(p50: nil, p95: nil, p99: nil, note: "fewer than #{MIN_SAMPLES_FOR_PERCENTILES} samples") if n < MIN_SAMPLES_FOR_PERCENTILES
      base.merge(p50: rank(sorted, 50), p95: rank(sorted, 95), p99: rank(sorted, 99))
    end

    def self.rank(sorted, percentile)
      index = (percentile / 100.0 * sorted.length).ceil - 1
      sorted[index.clamp(0, sorted.length - 1)]
    end
  end
end

if $PROGRAM_NAME == __FILE__
  options = Perf01Load.parse(ARGV)
  result = Perf01Load::Run.new(options).execute
  $stdout.puts JSON.generate(result)
  exit(result[:aborted] ? 3 : 0)
end
