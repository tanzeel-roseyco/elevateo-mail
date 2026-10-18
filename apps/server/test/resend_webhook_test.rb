# frozen_string_literal: true

require "minitest/autorun"
require "base64"
require "openssl"
require_relative "../lib/elevateo/resend_webhook"

class ResendWebhookTest < Minitest::Test
  NOW = 1_800_000_000
  SECRET = "s" * 32

  def signature(id, timestamp, body)
    Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", SECRET, "#{id}.#{timestamp}.#{body}"))
  end

  def verifier = Elevateo::ResendWebhook::Verifier.new(
    secret: "whsec_#{Base64.strict_encode64(SECRET)}", clock: -> { NOW })

  def test_accepts_any_matching_v1_signature
    body = '{"type":"email.sent","data":{"email_id":"email_1"}}'
    assert verifier.verify!(id: "evt_1", timestamp: NOW.to_s,
      signatures: "v1,invalid v1,#{signature('evt_1', NOW, body)}", body: body)
  end

  def test_rejects_tampered_and_stale_messages
    assert_raises(Elevateo::ResendWebhook::Invalid) do
      verifier.verify!(id: "evt_1", timestamp: NOW.to_s, signatures: "v1,#{signature('evt_1', NOW, 'a')}", body: "b")
    end
    assert_raises(Elevateo::ResendWebhook::Invalid) do
      verifier.verify!(id: "evt_1", timestamp: (NOW - 301).to_s,
        signatures: "v1,#{signature('evt_1', NOW - 301, 'a')}", body: "a")
    end
  end

  FakeResult = Struct.new(:payload) do
    def first = { "result" => payload }
  end

  class FakeConnection
    attr_reader :calls

    def initialize(results)
      @results = results
      @calls = []
    end

    def exec_query(_sql, _name, binds)
      @calls << binds
      FakeResult.new(JSON.generate(@results.fetch(@calls.length - 1)))
    end
  end

  def test_maps_every_supported_event_and_preserves_replay_result
    states = %w[sent delivered delivery_delayed bounced complained received]
    connection = FakeConnection.new(states.map { |state| { "result" => "created", "delivery_state" => state } } +
      [{ "result" => "duplicate", "delivery_state" => "sent" }])
    handler = Elevateo::ResendWebhook::Handler.new(connection: connection, binder: ->(value) { value })

    %w[email.sent email.delivered email.delivery_delayed email.bounced email.complained email.received].each do |type|
      result = handler.ingest(id: "evt_#{type}", body: JSON.generate(
        "type" => type, "data" => { "email_id" => "email_1", "to" => ["recipient@example.invalid"] }
      ))
      assert_equal "created", result.fetch("result")
    end
    replay = handler.ingest(id: "evt_email.sent", body: '{"type":"email.sent","data":{"email_id":"email_1"}}')
    assert_equal "duplicate", replay.fetch("result")
  end

  def test_unknown_provider_id_is_acknowledged_without_ownership_details
    connection = FakeConnection.new([{ "result" => "ignored" }])
    handler = Elevateo::ResendWebhook::Handler.new(connection: connection, binder: ->(value) { value })

    result = handler.ingest(id: "evt_unknown",
      body: '{"type":"email.delivered","data":{"email_id":"unknown"}}')

    assert_equal({ "result" => "ignored" }, result)
  end
end
