# frozen_string_literal: true

require_relative "../lib/elevateo/draft_attachment_request"

module Elevateo
  module AttachmentGateway
    # AIDEV-NOTE: Reauthorize after storage I/O; a revoked reservation can leave quarantined bytes but never metadata.
    module DraftStage
      def stage_draft(env)
        raise Denied unless env["REQUEST_METHOD"] == "POST" && env["CONTENT_TYPE"] == "application/json"
        length = Integer(env.fetch("CONTENT_LENGTH"), 10)
        raise Denied unless length.between?(1, DraftAttachmentRequest::MAX_BODY)
        body = env.fetch("rack.input").read(DraftAttachmentRequest::MAX_BODY + 1)
        raise Denied unless body.is_a?(String) && body.bytesize == length
        fields = JSON.parse(body)
        raise Denied unless fields.is_a?(Hash)
        signed = DraftAttachmentRequest.new(fields: fields, key: @key, now: @clock.call)
        signature = env["HTTP_X_ELEVATEO_ATTACHMENT_SIGNATURE"]
        raise Denied unless body == signed.body && signature.is_a?(String) && signature.bytesize == 64 &&
          OpenSSL.fixed_length_secure_compare(signature, signed.signature)
        bytes = Base64.strict_decode64(fields.fetch("content_base64"))
        raise Denied unless bytes.bytesize.between?(1, 1_048_576)
        first = @authority.draft_binding(fields)
        raise Denied unless bytes.bytesize == Integer(first.fetch("byte_size"), 10) &&
          Digest::SHA256.hexdigest(bytes) == first.fetch("sha256")
        Timeout.timeout(22) do
          if fields["mode"] == "put" && first["stage_state"] == "reserved"
            @storage.put_draft(first.fetch("storage_key"), bytes)
          else
            raise Unavailable unless @storage.get(first.fetch("storage_key")) == bytes
          end
        end
        raise Denied unless @authority.draft_binding(fields) == first && fields["expires_at"] >= @clock.call
        [204, { "Cache-Control" => "no-store", "Content-Length" => "0" }, []]
      rescue JSON::ParserError, ArgumentError, KeyError, TypeError
        raise Denied
      end
    end
  end
end
