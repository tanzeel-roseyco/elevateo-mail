# frozen_string_literal: true

require "json"
require "openssl"

module Elevateo
  # AIDEV-NOTE: Shared canonical protocol signs exact bytes, reservation and current principal; no object key is accepted.
  class DraftAttachmentRequest
    PATH = "/internal/draft-attachments/stage"
    MAX_BODY = 1_402_200
    IDS = %w[organization_id mailbox_id draft_id operation_id reservation_token expected_user_id expected_auth_session_id context_id].freeze
    ORDER = %w[operation audience organization_id mailbox_id draft_id operation_id reservation_token session_digest
      expected_user_id expected_auth_session_id context_id authorization_generation mode expires_at content_base64].freeze
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
    attr_reader :body, :signature

    def initialize(fields:, key:, now: Time.now.to_i)
      raise ArgumentError unless key.is_a?(String) && key.bytesize == 32 && fields.keys.sort == ORDER.sort &&
        fields["operation"] == "draft_attachment.stage" && fields["audience"] == "attachment_gateway.v1"
      raise ArgumentError unless IDS.all? { |name| value = fields[name]; value.is_a?(String) && UUID.match?(value) }
      digest, generation, expiry, encoded, mode = fields.values_at("session_digest", "authorization_generation", "expires_at", "content_base64", "mode")
      raise ArgumentError unless digest.is_a?(String) && /\A[0-9a-f]{64}\z/.match?(digest) &&
        generation.is_a?(Integer) && generation.between?(0, 9_223_372_036_854_775_807) &&
        expiry.is_a?(Integer) && expiry.between?(now, now + 30) && mode.is_a?(String) && %w[put reconcile].include?(mode) &&
        encoded.is_a?(String) && encoded.bytesize.between?(4, 1_398_104)
      @body = JSON.generate(ORDER.to_h { |name| [name, fields.fetch(name)] }).freeze
      raise ArgumentError if @body.bytesize > MAX_BODY
      @signature = OpenSSL::HMAC.hexdigest("SHA256", key, "POST\n#{PATH}\n" + @body).freeze
    end
  end
end
