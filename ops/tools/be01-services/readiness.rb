# frozen_string_literal: true
require "net/http"
# AIDEV-NOTE: Retry only harmless readiness GETs; acceptance assertions themselves never retry denial failures.
[["mailpit", 8025, "/api/v1/messages"], ["rest", 3000, "/"]].each do |host, port, path|
  deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 30
  loop do
    ready = false
    begin
      http = Net::HTTP.new(host, port, nil)
      http.open_timeout = 2
      http.read_timeout = 2
      http.max_retries = 0
      http.start { |session| session.request(Net::HTTP::Get.new(path)) { |response| ready = response.code == "200" } }
    rescue IOError, SystemCallError, Timeout::Error
      ready = false
    end
    break if ready
    raise "readiness timeout" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
    sleep 1
  end
end
puts "PASS private Mailpit/PostgREST readiness"
