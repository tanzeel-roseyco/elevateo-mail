# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/attachment_gateway_request"

class AttachmentGatewayRequestTest < Minitest::Test
  ID = "00000000-0000-4000-8000-000000000001"

  def fields
    Elevateo::AttachmentGatewayRequest::ORDER.to_h do |name|
      value = case name
      when "operation" then "attachment.read"
      when "audience" then "attachment_gateway.v1"
      when "session_digest" then "a" * 64
      when "authorization_version" then "context_hint_1234"
      when "authorization_generation" then 7
      when "expires_at" then 1_700_000_020
      else ID
      end
      [name, value]
    end
  end

  def test_exact_ordered_body_and_signature
    request = Elevateo::AttachmentGatewayRequest.new(fields: fields, key: "k" * 32, now: 1_700_000_000)
    assert_equal Elevateo::AttachmentGatewayRequest::ORDER, JSON.parse(request.body).keys
    assert_equal "attachment.read", JSON.parse(request.body).fetch("operation")
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", "k" * 32,
      "POST\n/internal/attachments/read\n" + request.body), request.signature
    refute_includes request.body, "storage_key"
  end

  def test_rejects_extra_key_and_wrong_target
    assert_raises(ArgumentError) do
      Elevateo::AttachmentGatewayRequest.new(fields: fields.merge("storage_key" => "secret"), key: "k" * 32, now: 1_700_000_000)
    end
    assert_raises(ArgumentError) do
      Elevateo::AttachmentGatewayRequest.new(fields: fields.merge("operation" => "attachment.write"), key: "k" * 32, now: 1_700_000_000)
    end
  end

  def test_rejects_expired_long_lived_or_malformed_authority
    [1_699_999_999, 1_700_000_031].each do |expiry|
      assert_raises(ArgumentError) do
        Elevateo::AttachmentGatewayRequest.new(fields: fields.merge("expires_at" => expiry), key: "k" * 32, now: 1_700_000_000)
      end
    end
    assert_raises(ArgumentError) do
      Elevateo::AttachmentGatewayRequest.new(fields: fields.merge("session_digest" => "invalid"), key: "k" * 32, now: 1_700_000_000)
    end
    assert_raises(ArgumentError) do
      Elevateo::AttachmentGatewayRequest.new(fields: fields.merge("context_id" =>
        "00000000-0000-4000-8000-000000000002"), key: "k" * 32, now: 1_700_000_000)
    end
  end
end
