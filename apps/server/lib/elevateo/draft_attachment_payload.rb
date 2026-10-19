# frozen_string_literal: true

require "base64"
require "digest"
require "json"
require_relative "write_input"

module Elevateo
  # AIDEV-NOTE: Decode and validate before reservation; digest binds the exact immutable file and destination.
  class DraftAttachmentPayload
    FIELDS = %w[operation_id mailbox_id filename content_type content_base64].freeze
    MAX_BYTES = 1_048_576
    attr_reader :draft_id, :mailbox_id, :operation_id, :filename, :content_type, :bytes, :sha256, :digest

    def initialize(draft_id:, input:)
      WriteInput.invalid! unless input.keys.sort == FIELDS.sort
      @draft_id = WriteInput.uuid(draft_id)
      @mailbox_id = WriteInput.uuid(input["mailbox_id"])
      @operation_id = WriteInput.uuid(input["operation_id"])
      filename, type, encoded = input.values_at("filename", "content_type", "content_base64")
      WriteInput.invalid! unless filename.is_a?(String) && filename.valid_encoding? &&
        filename.bytesize.between?(1, 255) && filename == filename.strip && !%w[. ..].include?(filename) &&
        !/[[:cntrl:]\\\/]/.match?(filename) && type.is_a?(String) &&
        %w[application/pdf image/png image/jpeg text/plain].include?(type) && encoded.is_a?(String) &&
        encoded.bytesize.between?(4, 1_398_104)
      @filename, @content_type = filename, type
      @bytes = Base64.strict_decode64(encoded).b.freeze
      WriteInput.invalid! unless @bytes.bytesize.between?(1, MAX_BYTES)
      @sha256 = Digest::SHA256.hexdigest(@bytes)
      @digest = Digest::SHA256.hexdigest(JSON.generate([@mailbox_id, @draft_id, @filename, @content_type, @bytes.bytesize, @sha256]))
    rescue ArgumentError
      WriteInput.invalid!
    end
  end
end
