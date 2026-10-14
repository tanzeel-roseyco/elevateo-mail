# frozen_string_literal: true

require "json"
require "openssl"

module Elevateo
  module AttachmentGateway
    module Protocol
      PATH = "/internal/attachments/read"
      AUDIENCE = "attachment_gateway.v1"
      KEYS = %w[operation audience attachment_id organization_id mailbox_id thread_id message_id
                session_digest expected_user_id expected_auth_session_id context_id authorization_version
                context_uuid authorization_generation expires_at request_id].freeze
      UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
      TOKEN = /\A[A-Za-z0-9_-]{43}\z/
      HEX = /\A[0-9a-f]{64}\z/
      MAX_BODY = 2048
      PREFIX = "POST\n#{PATH}\n"

      def self.verify(env, key:, now: Time.now.to_i)
        raise Denied unless env["REQUEST_METHOD"] == "POST" && env["PATH_INFO"] == PATH &&
          env["CONTENT_TYPE"] == "application/json"
        raise Denied if %w[HTTP_RANGE HTTP_IF_RANGE HTTP_IF_NONE_MATCH HTTP_IF_MODIFIED_SINCE].any? { |key| env.key?(key) }
        length = Integer(env.fetch("CONTENT_LENGTH"), 10)
        raise Denied unless length.between?(1, MAX_BODY)
        body = env.fetch("rack.input").read(MAX_BODY + 1)
        body.force_encoding(Encoding::UTF_8) if body.is_a?(String)
        raise Denied unless body.is_a?(String) && body.bytesize == length && body.valid_encoding?
        claim = JSON.parse(body)
        raise Denied unless claim.is_a?(Hash) && claim.keys == KEYS && JSON.generate(claim) == body
        supplied = env["HTTP_X_ELEVATEO_ATTACHMENT_SIGNATURE"]
        raise Denied unless supplied.is_a?(String) && HEX.match?(supplied)
        expected = OpenSSL::HMAC.hexdigest("SHA256", key, PREFIX + body)
        raise Denied unless OpenSSL.fixed_length_secure_compare(supplied, expected)
        raise Denied unless claim["operation"] == "attachment.read" && claim["audience"] == AUDIENCE
        %w[attachment_id organization_id mailbox_id thread_id message_id expected_user_id
           expected_auth_session_id context_id context_uuid request_id].each do |field|
          raise Denied unless claim[field].is_a?(String) && UUID.match?(claim[field])
        end
        raise Denied unless claim["session_digest"].is_a?(String) && HEX.match?(claim["session_digest"])
        raise Denied unless claim["context_id"] == claim["context_uuid"]
        %w[authorization_version].each do |field|
          raise Denied unless claim[field].is_a?(String) && TOKEN.match?(claim[field])
        end
        generation = claim["authorization_generation"]
        expiry = claim["expires_at"]
        raise Denied unless generation.is_a?(Integer) && generation.between?(0, 9_223_372_036_854_775_807) &&
          expiry.is_a?(Integer) && expiry.between?(now, now + 30)
        claim
      rescue JSON::ParserError, JSON::GeneratorError, ArgumentError, KeyError, TypeError
        raise Denied
      end
    end
  end
end
