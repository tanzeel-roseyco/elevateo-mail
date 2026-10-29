# frozen_string_literal: true

require "minitest/autorun"
require "json"
require_relative "../support/resend_http_stub"
require_relative "../../lib/elevateo/send_api/canonical"
require_relative "../../lib/elevateo/send_worker/resend_transport"

# AIDEV-NOTE: Run with Docker --network none; six real HTTP requests stay on container loopback, never Resend.
class ResendWireTest < Minitest::Test
  SEND = "11111111-1111-4111-8111-111111111111"
  ATTEMPT = "22222222-2222-4222-8222-222222222222"

  def snapshot
    Elevateo::SendAPI::Canonical.bytes(organization_id: "33333333-3333-4333-8333-333333333333",
      mailbox_id: "44444444-4444-4444-8444-444444444444", draft_id: "55555555-5555-4555-8555-555555555555",
      version: 1, sender: "sender@example.test", recipients: [{ "display_name" => nil, "address" => "to@example.net" }],
      subject: "Subject", body: "Body", reply_id: nil, policy: "1")
  end

  def with_transport(status:, body:, storage: nil)
    stub = ResendHTTPStub.new(status: status, body: body)
    factory = lambda do |uri|
      assert_equal "https://api.resend.com/emails", uri.to_s
      stub.client(uri)
    end
    transport = Elevateo::SendWorker::ResendTransport.new(api_key: "re_disposable_fixture",
      from_domain: "example.test", http_factory: factory, attachment_storage: storage)
    yield transport, stub
  ensure
    stub&.close
  end

  def submit(transport, bytes = snapshot)
    transport.submit(bytes, send_id: SEND, attempt_id: ATTEMPT,
      deadline: Elevateo::SendWorker::CallDeadline.new(seconds: 5))
  end

  def test_accepted_attachment_and_changed_bytes_fail_before_second_request
    content = "private attachment"
    value = JSON.parse(snapshot)
    value[0] = "elevateo.send.snapshot.v2"
    value[12] = [[ATTEMPT, "drafts/#{value[1]}/#{ATTEMPT}", "proof.txt", "text/plain",
      content.bytesize, Digest::SHA256.hexdigest(content)]]
    storage = Object.new
    storage.define_singleton_method(:get) { |_key| content }
    with_transport(status: 202, body: '{"id":"fixture_accepted"}', storage: storage) do |transport, stub|
      assert_equal "accepted", submit(transport, JSON.generate(value)).kind
      request = stub.requests.fetch(0)
      assert_equal "POST /emails HTTP/1.1\r\n", request.fetch(:line)
      assert_equal "elevateo/#{SEND}", request.fetch(:headers).fetch("idempotency-key")
      payload = JSON.parse(request.fetch(:body))
      assert_equal content, Base64.strict_decode64(payload.fetch("attachments").first.fetch("content"))
      storage.define_singleton_method(:get) { |_key| "tampered" }
      assert_equal "unknown", submit(transport, JSON.generate(value)).kind
      assert_equal 1, stub.requests.length
    end
  end

  def test_definite_rejection
    with_transport(status: 400, body: '{"message":"invalid fixture"}') do |transport, stub|
      assert_equal "rejected", submit(transport).kind
      assert_equal 1, stub.requests.length
    end
  end

  def test_ambiguous_responses_are_not_retried
    [[429, "limited"], [503, "unavailable"], [200, "{}"], [200, "not-json"]].each do |status, body|
      with_transport(status: status, body: body) do |transport, stub|
        assert_equal "unknown", submit(transport).kind
        assert_nil transport.observation(send_id: SEND, attempt_id: ATTEMPT,
          snapshot_digest: Digest::SHA256.hexdigest(snapshot), snapshot_bytes: snapshot)
        assert_equal 1, stub.requests.length
      end
    end
  end
end
