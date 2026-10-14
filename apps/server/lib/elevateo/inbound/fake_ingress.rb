# frozen_string_literal: true

require "digest"
require "mail"

module Elevateo
  module Inbound
    class Rejected < StandardError
      attr_reader :code

      def initialize(code)
        @code = code
        super(code)
      end
    end

    # AIDEV-NOTE: This adapter accepts only an isolated caller's scoped mailbox grant; it has no provider credentials.
    class FakeIngress
      MAX_RAW = 1_048_576
      MAX_TEXT = 262_144
      MAX_PARTS = 12
      MAX_FILENAME = 120
      UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

      def initialize(store:)
        @store = store
      end

      # Store#insert_once must atomically key on [organization_id, mailbox_id, provider, provider_event_id].
      def ingest(organization_id:, mailbox_id:, authorized_mailbox_ids:, provider_account_id:, provider_event_id:, raw_mime:)
        reject("invalid_scope") unless uuid?(organization_id) && uuid?(mailbox_id)
        reject("forbidden") unless authorized_mailbox_ids.is_a?(Array) && authorized_mailbox_ids.include?(mailbox_id)
        reject("invalid_event_id") unless provider_event_id.is_a?(String) &&
                                          /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}\z/.match?(provider_event_id)
        reject("invalid_account_id") unless provider_account_id.is_a?(String) &&
                                            /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}\z/.match?(provider_account_id)
        reject("invalid_mime") unless raw_mime.is_a?(String) && raw_mime.valid_encoding? &&
                                      raw_mime.bytesize.between?(1, MAX_RAW) && !raw_mime.include?("\0")

        mail = Mail.read_from_string(raw_mime)
        senders = mail.from
        recipients = mail.to
        reject("invalid_mime") unless mail.header && senders.is_a?(Array) && senders.length == 1 &&
                                      recipients.is_a?(Array) && recipients.any?
        parts = leaf_parts(mail)
        reject("invalid_mime") if parts.empty? || parts.length > MAX_PARTS
        text_parts = parts.select { |part| part.mime_type == "text/plain" && !part.attachment? }
        reject("unsupported_mime") unless text_parts.length == 1 && parts.all? { |part| part.equal?(text_parts.first) || part.attachment? }
        reject("unsupported_mime") if parts.any? { |part| part.mime_type == "text/html" }

        body = text_parts.first.decoded
        reject("invalid_text") unless body.is_a?(String) && body.bytesize <= MAX_TEXT
        body = body.encode("UTF-8", text_parts.first.charset || "UTF-8")
        reject("invalid_text") unless body.valid_encoding? && !body.include?("\0")
        attachments = parts.reject { |part| part.equal?(text_parts.first) }.map do |part|
          reject("unsupported_mime") unless part.mime_type == "text/plain" || part.mime_type == "application/octet-stream"
          data = part.decoded
          reject("oversized_attachment") unless data.bytesize <= MAX_TEXT
          { filename: clean_filename(part.filename), content_type: part.mime_type, size: data.bytesize,
            sha256: Digest::SHA256.hexdigest(data) }
        end
        record = { organization_id: organization_id, mailbox_id: mailbox_id, provider: "fake",
                   provider_account_id: provider_account_id, provider_event_id: provider_event_id,
                   content_sha256: Digest::SHA256.hexdigest(raw_mime.b), from: clean_header(senders.first),
                   to: recipients.map { |address| clean_header(address) }, subject: clean_header(mail.subject.to_s),
                   text: body, attachments: attachments }
        # AIDEV-NOTE: The store owns durable atomic dedup; an in-memory set cannot establish replay safety.
        @store.insert_once(record)
      rescue ArgumentError, EncodingError
        reject("invalid_mime")
      end

      def capability(provider)
        provider == "fake" ? "isolated_only" : "unsupported_provider"
      end

      private

      def uuid?(value)
        value.is_a?(String) && UUID.match?(value)
      end

      def reject(code)
        raise Rejected, code
      end

      def leaf_parts(message)
        stack = [[message, 0]]
        leaves = []
        seen = 0
        until stack.empty?
          part, depth = stack.pop
          seen += 1
          reject("invalid_mime") if seen > MAX_PARTS * 2 || depth > 8
          if part.multipart?
            children = part.parts
            reject("invalid_mime") if children.empty? || children.length > MAX_PARTS
            children.reverse_each { |child| stack << [child, depth + 1] }
          else
            leaves << part
            reject("invalid_mime") if leaves.length > MAX_PARTS
          end
        end
        leaves
      end

      def clean_header(value)
        text = value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
        text.gsub(/[\x00-\x1f\x7f]/, " ").strip.byteslice(0, 255).to_s.scrub
      end

      def clean_filename(value)
        name = clean_header(value.to_s.tr("\\", "/").split("/").last).byteslice(0, MAX_FILENAME).to_s
        reject("invalid_filename") if name.empty? || name == "." || name == ".."
        name
      end
    end
  end
end
