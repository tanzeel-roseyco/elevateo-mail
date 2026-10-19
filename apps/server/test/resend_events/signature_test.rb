# frozen_string_literal: true
require "minitest/autorun"
require_relative "../../lib/elevateo/resend_events/signature"

class ResendSignatureTest < Minitest::Test
  def setup
    @secret = "x" * 32
    @verifier = Elevateo::ResendEvents::Signature.new(secret: "whsec_" + Base64.strict_encode64(@secret))
    @body = JSON.generate(type: "email.delivered", created_at: "2026-10-17T01:00:00Z",
      data: { email_id: "11111111-1111-4111-8111-111111111111" })
    @id, @timestamp = "msg_test123", "1792198800"
  end
  def options
    signature = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", @secret, "#{@id}.#{@timestamp}.#{@body}"))
    { body: @body, id: @id, timestamp: @timestamp, signatures: "v1,#{signature}", now: @timestamp.to_i }
  end
  def test_verifies_exact_bytes_and_rotation
    args = options
    args[:signatures] = "v1,invalid " + args[:signatures]
    assert_equal "email.delivered", @verifier.verify(**args).fetch("type")
  end
  def test_rejects_tampering_and_missing_signature
    assert_raises(Elevateo::ResendEvents::Invalid) { @verifier.verify(**options.merge(body: @body + " ")) }
    assert_raises(Elevateo::ResendEvents::Invalid) { @verifier.verify(**options.merge(signatures: "")) }
  end
  def test_rejects_expired_and_future_signatures
    [-301, 301].each do |delta|
      assert_raises(Elevateo::ResendEvents::Invalid) { @verifier.verify(**options.merge(now: @timestamp.to_i + delta)) }
    end
  end
  def test_rejects_oversize_and_malformed_signed_payload
    @body = "x" * 262_145
    assert_raises(Elevateo::ResendEvents::Invalid) { @verifier.verify(**options) }
    @body = JSON.generate(type: "email.received", created_at: "invalid", data: { email_id: "bad" })
    assert_raises(Elevateo::ResendEvents::Invalid) { @verifier.verify(**options) }
  end
  def test_outbound_provider_ids_are_bounded_and_inbound_requires_uuid
    @body = JSON.generate(type: "email.sent", created_at: "2026-10-17T01:00:00Z", data: { email_id: "provider_123" })
    assert_equal "email.sent", @verifier.verify(**options).fetch("type")
    @body = @body.sub("email.sent", "email.received")
    assert_raises(Elevateo::ResendEvents::Invalid) { @verifier.verify(**options) }
  end
  def test_redacts_configuration
    refute_includes @verifier.inspect, @secret
  end
end
