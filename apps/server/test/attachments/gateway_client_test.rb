# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/attachment_gateway_client"

class AttachmentGatewayClientTest < Minitest::Test
  Config = Struct.new(:attachment_gateway_url, :attachment_gateway_hmac_key)
  ID = "00000000-0000-4000-8000-000000000001"

  def fields
    Elevateo::AttachmentGatewayRequest::ORDER.to_h do |name|
      value = case name
      when "operation" then "attachment.read"
      when "audience" then "attachment_gateway.v1"
      when "session_digest" then "a" * 64
      when "authorization_version" then "v" * 43
      when "authorization_generation" then 7
      when "expires_at" then 1_700_000_020
      else ID
      end
      [name, value]
    end
  end

  def client(transport, transaction_open: -> { false })
    Elevateo::AttachmentGatewayClient.new(config: Config.new("http://attachment-gateway:4708", "k" * 32),
      transport: transport, transaction_open: transaction_open)
  end

  def test_returns_only_bounded_binary_from_exact_private_response
    transport = ->(body, signature, timeout) {
      assert_equal "attachment.read", JSON.parse(body).fetch("operation")
      assert_equal 64, signature.length
      assert_equal 2, timeout
      [200, { "Content-Type" => "application/octet-stream", "Content-Length" => "3",
        "Cache-Control" => "no-store", "X-Content-Type-Options" => "nosniff",
        "Content-Disposition" => 'attachment; filename="attachment"' }, "abc"]
    }
    assert_equal "abc", client(transport).download(fields: fields, timeout: 2, now: 1_700_000_000)
  end

  def test_denied_and_incorrect_response_never_return_bytes
    assert_raises(Elevateo::AttachmentGatewayClient::NotAvailable) do
      client(->(*) { [404, {}, ""] }).download(fields: fields, timeout: 2, now: 1_700_000_000)
    end
    assert_raises(Elevateo::AttachmentGatewayClient::Unavailable) do
      client(->(*) { [200, { "Content-Type" => "application/octet-stream", "Content-Length" => "99",
        "Cache-Control" => "no-store", "X-Content-Type-Options" => "nosniff",
        "Content-Disposition" => 'attachment; filename="attachment"' }, "abc"] })
        .download(fields: fields, timeout: 2, now: 1_700_000_000)
    end
  end

  def test_open_transaction_or_missing_key_blocks_transport
    transport = ->(*) { flunk "transport must not be called" }
    assert_raises(Elevateo::AttachmentGatewayClient::Unavailable) do
      client(transport, transaction_open: -> { true }).download(fields: fields, timeout: 2, now: 1_700_000_000)
    end
    config = Config.new("http://attachment-gateway:4708", nil)
    assert_raises(Elevateo::AttachmentGatewayClient::Unavailable) do
      Elevateo::AttachmentGatewayClient.new(config: config, transport: transport, transaction_open: -> { false })
        .download(fields: fields, timeout: 2, now: 1_700_000_000)
    end
  end
end
