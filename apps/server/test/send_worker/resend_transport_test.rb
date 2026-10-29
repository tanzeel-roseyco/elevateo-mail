# frozen_string_literal: true

require "minitest/autorun"
require "json"
require_relative "../../lib/elevateo/send_api/canonical"
require_relative "../../lib/elevateo/send_worker/resend_transport"

class SendWorkerResendTransportTest < Minitest::Test
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"

  FakeResponse = Struct.new(:code, :body) do
    def read_body = yield(body)
  end
  class FakeHTTP
    attr_accessor :open_timeout, :read_timeout, :write_timeout, :max_retries, :ignore_eof
    attr_reader :requests
    def initialize(responses) = (@responses, @requests = responses, [])
    def request(request)
      @requests << request
      response = @responses.shift || raise("missing fake response")
      yield response if block_given?
      response
    end
  end

  class BlockingHTTP < FakeHTTP
    def request(_request) = sleep(1)
  end

  def snapshot
    Elevateo::SendAPI::Canonical.bytes(organization_id: "33333333-3333-4333-8333-333333333333",
      mailbox_id: "44444444-4444-4444-8444-444444444444", draft_id: "55555555-5555-4555-8555-555555555555",
      version: 1, sender: "sender@example.test", recipients: [{ "display_name" => nil, "address" => "to@example.net" }],
      subject: "Subject", body: "Body", reply_id: nil, policy: "1")
  end

  def test_status_mapping_and_idempotency_header
    [[202, '{"id":"provider_1"}', "accepted"], [400, "bad", "rejected"], [429, "limited", "unknown"],
      [503, "down", "unknown"], [200, "{}", "unknown"], [200, "not-json", "unknown"]].each do |code, body, kind|
      http = FakeHTTP.new([FakeResponse.new(code.to_s, body)])
      result = transport(http).submit(snapshot, send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
      assert_equal kind, result.kind, "HTTP #{code}"
      assert_equal "elevateo/#{SEND}", http.requests.fetch(0)["Idempotency-Key"]
      assert_equal "Bearer re_test_token_not_a_secret", http.requests.fetch(0)["Authorization"]
    end
  end

  # AIDEV-NOTE: A process restart cannot establish whether an old ambiguous POST is within provider retention.
  def test_observation_never_resubmits_an_ambiguous_post
    http = FakeHTTP.new([])
    result = transport(http).observation(send_id: SEND, attempt_id: ATTEMPT,
      snapshot_digest: Digest::SHA256.hexdigest(snapshot), snapshot_bytes: snapshot)
    assert_nil result
    assert_empty http.requests
  end

  def test_attachments_bind_exact_private_bytes_before_provider_io
    bytes = "private attachment"
    approved = JSON.parse(snapshot)
    approved[0] = "elevateo.send.snapshot.v2"
    approved[12] = [[ATTEMPT, "drafts/#{approved[1]}/#{ATTEMPT}", "note.txt", "text/plain",
      bytes.bytesize, Digest::SHA256.hexdigest(bytes)]]
    storage = Object.new
    storage.define_singleton_method(:get) { |_key| bytes }
    http = FakeHTTP.new([FakeResponse.new("200", '{"id":"provider_1"}')])
    instance = Elevateo::SendWorker::ResendTransport.new(api_key: "re_test_token_not_a_secret",
      from_domain: "example.test", http_factory: ->(_uri) { http }, attachment_storage: storage)
    assert_equal "accepted", instance.submit(JSON.generate(approved), send_id: SEND,
      attempt_id: ATTEMPT, deadline: deadline).kind
    payload = JSON.parse(http.requests.fetch(0).body)
    assert_equal bytes, Base64.strict_decode64(payload.fetch("attachments").first.fetch("content"))
    assert_equal "<elevateo.#{SEND}@example.test>", payload.fetch("headers").fetch("Message-ID")
    storage.define_singleton_method(:get) { |_key| "changed" }
    assert_equal "unknown", instance.submit(JSON.generate(approved), send_id: SEND,
      attempt_id: ATTEMPT, deadline: deadline).kind
    assert_equal 1, http.requests.length
  end

  def test_entire_http_exchange_is_bounded_and_configures_write_timeout
    http = BlockingHTTP.new([])
    result = transport(http).submit(snapshot, send_id: SEND, attempt_id: ATTEMPT,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 0.01))
    assert_equal "unknown", result.kind
    assert_operator http.write_timeout, :>, 0
  end

  # AIDEV-NOTE: The transport must retain V3 reply metadata and reject malformed wire identities before HTTP.
  def test_reply_snapshot_preserves_wire_thread_headers
    value = JSON.parse(snapshot)
    value[0] = "elevateo.send.snapshot.v3"
    value[9] = [ATTEMPT, "<original@example.net>"]
    http = FakeHTTP.new([FakeResponse.new("200", '{"id":"reply_1"}')])
    result = transport(http).submit(JSON.generate(value), send_id: SEND, attempt_id: ATTEMPT, deadline: deadline)
    assert_equal "accepted", result.kind
    headers = JSON.parse(http.requests.fetch(0).body).fetch("headers")
    assert_equal "<original@example.net>", headers.fetch("In-Reply-To")
    assert_equal headers.fetch("In-Reply-To"), headers.fetch("References")
  end

  def test_reply_snapshot_rejects_header_injection_and_missing_identity
    [nil, [ATTEMPT, "<original@example.net>\r\nBcc: victim@example.net"]].each do |reply|
      value = JSON.parse(snapshot)
      value[0] = "elevateo.send.snapshot.v3"
      value[9] = reply
      http = FakeHTTP.new([])
      assert_equal "unknown", transport(http).submit(JSON.generate(value), send_id: SEND,
        attempt_id: ATTEMPT, deadline: deadline).kind
      assert_empty http.requests
    end
  end

  private

  def transport(http)
    Elevateo::SendWorker::ResendTransport.new(api_key: "re_test_token_not_a_secret", from_domain: "example.test",
      base_url: "http://resend-stub:8788", http_factory: ->(_uri) { http })
  end

  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10)
end
