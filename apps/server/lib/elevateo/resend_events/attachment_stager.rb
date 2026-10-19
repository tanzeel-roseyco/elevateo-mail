# frozen_string_literal: true

require "digest"
require_relative "../attachments"
require_relative "signature"

module Elevateo
  module ResendEvents
    # AIDEV-NOTE: Rejected imports remain visible metadata; accepted bytes stay quarantined until the existing scanner clears them.
    class AttachmentStager
      def initialize(client:, storage:)
        @client, @storage = client, storage
      end

      def stage(email_id, parts)
        raise Invalid, "invalid attachments" unless Signature::UUID.match?(email_id) && parts.length <= 11
        parts.each_with_index.map { |part, ordinal| stage_one(email_id, part, ordinal) }
      end

      private

      def stage_one(email_id, part, ordinal)
        raise Invalid, "invalid attachment" unless part.is_a?(Hash)
        name, type, size, id = part["filename"], part["content_type"], part["size"], part["id"]
        raise Invalid, "invalid attachment identity" unless id.is_a?(String) && Signature::UUID.match?(id)
        reason = if !name.is_a?(String) || !name.valid_encoding? || !name.bytesize.between?(1, 120) ||
            name.strip != name || Attachments::NAME.match?(name) || [".", ".."].include?(name)
          "invalid_name"
        elsif !type.is_a?(String) || !Attachments::TYPES.key?(type)
          "unsupported_type"
        elsif !size.is_a?(Integer) || !size.between?(1, Signature::MAX_BODY)
          "oversize"
        end
        filename = reason == "invalid_name" ? "rejected-attachment" : name.to_s
        return rejected(ordinal, filename, reason) if reason
        storage = @storage
        raise Invalid, "attachment storage unavailable" unless storage
        bytes = @client.attachment(email_id, id)
        raise Invalid, "attachment size mismatch" unless bytes.bytesize == size
        magic = Attachments::TYPES[type.to_s]
        invalid = (magic && !bytes.b.start_with?(magic)) ||
          (type == "text/plain" && (!bytes.dup.force_encoding(Encoding::UTF_8).valid_encoding? || bytes.include?("\0")))
        return rejected(ordinal, filename, "invalid_signature") if invalid
        key = "quarantine/resend/#{email_id}/#{ordinal}"
        storage.put_once(key, bytes)
        { "ordinal" => ordinal, "filename" => filename, "content_type" => type,
          "byte_size" => bytes.bytesize, "sha256" => Digest::SHA256.hexdigest(bytes),
          "storage_key" => key, "rejection_reason" => nil }
      end

      def rejected(ordinal, filename, reason)
        { "ordinal" => ordinal, "filename" => filename, "content_type" => "application/octet-stream",
          "byte_size" => 0, "sha256" => nil, "storage_key" => nil, "rejection_reason" => reason }
      end
    end
  end
end
