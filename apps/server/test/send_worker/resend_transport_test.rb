# frozen_string_literal: true

require "minitest/autorun"
require "json"
require_relative "../../lib/elevateo/send_api/canonical"
require_relative "../../lib/elevateo/send_worker/resend_transport"

class SendWorkerResendTransportTest < Minitest::Test
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"

  FakeResponse = Struct.new(:code, :body)
  class FakeHTTP
    attr_accessor :open_timeout, :read_timeout, :write_timeout
    attr_reader :requests
    def initialize(responses) = (@responses, @requests = responses, [])
    def request(request)
      @requests << request
      @responses.shift || raise("missing fake response")
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
      assert_equal ATTEMPT, http.requests.fetch(0)["Idempotency-Key"]
      assert_equal "Bearer re_test_token_not_a_secret", http.requests.fetch(0)["Authorization"]
    end
  end

  def test_observation_replays_the_attempt_key_to_recover_a_lost_provider_id
    http = FakeHTTP.new([FakeResponse.new("202", '{"id":"provider_1"}'),
      FakeResponse.new("200", '{"id":"provider_1"}')])
    instance = transport(http)
    digest = Digest::SHA256.hexdigest(snapshot)
    result = instance.observation(send_id: SEND, attempt_id: ATTEMPT, snapshot_digest: digest,
      snapshot_bytes: snapshot)
    assert_equal "accepted", result.kind
    assert_equal ATTEMPT, http.requests.first["Idempotency-Key"]
    assert_equal "POST", http.requests.first.method
    assert_equal "/emails/provider_1", http.requests.last.path
  end

  def test_entire_http_exchange_is_bounded_and_configures_write_timeout
    http = BlockingHTTP.new([])
    result = transport(http).submit(snapshot, send_id: SEND, attempt_id: ATTEMPT,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 0.01))
    assert_equal "unknown", result.kind
    assert_operator http.write_timeout, :>, 0
  end

  private

  def transport(http)
    Elevateo::SendWorker::ResendTransport.new(api_key: "re_test_token_not_a_secret", from_domain: "example.test",
      base_url: "http://resend.test", http_factory: ->(_uri) { http })
  end

  def deadline = Elevateo::SendWorker::CallDeadline.new(seconds: 10)
end
