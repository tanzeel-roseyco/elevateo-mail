# frozen_string_literal: true

require "json"
require "openssl"

module Elevateo
  # Signs only the fixed internal read request; it carries no Storage key or service credential.
  class AttachmentGatewayRequest
    PATH = "/internal/attachments/read"
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/
    DIGEST = /\A[0-9a-f]{64}\z/
    VERSION = /\A[A-Za-z0-9_-]{43}\z/
    IDS = %w[attachment_id organization_id mailbox_id thread_id message_id expected_user_id
      expected_auth_session_id context_id context_uuid request_id].freeze
    ORDER = %w[operation audience attachment_id organization_id mailbox_id thread_id message_id
      session_digest expected_user_id expected_auth_session_id context_id authorization_version
      context_uuid authorization_generation expires_at request_id].freeze

    attr_reader :body, :signature

    def initialize(fields:, key:, now: Time.now.to_i)
      raise ArgumentError, "invalid gateway key" unless key.is_a?(String) && key.bytesize == 32
      raise ArgumentError, "invalid gateway request" unless fields.is_a?(Hash) && fields.keys.sort == ORDER.sort
      raise ArgumentError, "invalid gateway operation" unless fields["operation"] == "attachment.read" &&
        fields["audience"] == "attachment_gateway.v1"
      raise ArgumentError, "invalid gateway identifiers" unless IDS.all? { |name|
        value = fields[name]
        value.is_a?(String) && UUID.match?(value)
      }
      raise ArgumentError, "invalid gateway digest" unless fields["session_digest"].is_a?(String) &&
        DIGEST.match?(fields["session_digest"])
      raise ArgumentError, "invalid gateway context" unless fields["context_id"] == fields["context_uuid"]
      version = fields["authorization_version"]
      raise ArgumentError, "invalid gateway version hint" unless version.is_a?(String) && VERSION.match?(version)
      generation, expiry = fields.values_at("authorization_generation", "expires_at")
      raise ArgumentError, "invalid gateway generation" unless generation.is_a?(Integer) && generation >= 0
      raise ArgumentError, "invalid gateway expiry" unless now.is_a?(Integer) && expiry.is_a?(Integer) &&
        expiry.between?(now, now + 30)
      ordered = ORDER.to_h { |name| [name, fields.fetch(name)] }
      @body = JSON.generate(ordered, allow_nan: false).freeze
      raise ArgumentError, "gateway body too large" if @body.bytesize > 2048
      @signature = OpenSSL::HMAC.hexdigest("SHA256", key, "POST\n#{PATH}\n" + @body).freeze
      freeze
    end
  end
end
