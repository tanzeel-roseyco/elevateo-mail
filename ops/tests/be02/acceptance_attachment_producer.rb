# frozen_string_literal: true
require "/workspace/ops/tests/be02/http_support"
require "/workspace/tests/acceptance/qa816-attachments-seed"
# AIDEV-NOTE: Service credentials stay inside this privileged fixture; only reviewed metadata crosses to the browser.
client = Be02Http.new
seed = JSON.parse(File.read("/acceptance/seed.json"))
credentials = JSON.parse(File.read("/acceptance/acceptance-credentials.json"))
challenge = client.challenge.merge("Origin" => "http://app.test")
response = client.request("post", "/v1/auth/login", body: {
  email: seed.fetch("actors").fetch("reader").fetch("email"),
  password: credentials.fetch("passwords").fetch("reader") }, headers: challenge)
raise "reader login failed" unless response.code == "200"
ENV["QA816_READER_COOKIE"] = client.cookies.map { |key, value| "#{key}=#{value}" }.join("; ")
storage = Be02Http.new("http://storage:5000")
headers = { "Authorization" => "Bearer #{ENV.fetch('BE02_STORAGE_SERVICE')}" }
scanner = Elevateo::Attachments::ClamdScanner.new
deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 100
loop do
  begin
    break if storage.request("get", "/status").code == "200" && scanner.scan("safe readiness\n") == "clean" &&
      Be02Http.new("http://attachment-gateway:4708").request("get", "/").code == "404"
  rescue IOError, SocketError, SystemCallError, Timeout::Error, Elevateo::Attachments::ClamdScanner::Error
    # AIDEV-NOTE: Retry readiness only; fixture assertions below execute once.
  end
  raise "attachment readiness exceeded" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
  sleep 1
end
response = storage.request("post", "/bucket", body: { id: "be02-attachments", name: "be02-attachments", public: false }, headers: headers)
raise "private bucket creation failed" unless response.code == "200"
Qa816AttachmentsSeed.seed unless ENV["QA830_STORAGE_ONLY"] == "true"
