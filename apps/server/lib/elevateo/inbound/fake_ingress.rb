# frozen_string_literal: true

require "digest"
require "mail"

module Elevateo
  module Inbound
    # A rejected simulated event has one fixed code and never includes MIME content.
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

      # Store#insert_once keys on tenant, mailbox, provider, account and event in one transaction.
      def ingest(organization_id:, mailbox_id:, authorized_mailbox_ids:, provider_account_id:, provider_event_id:, raw_mime:)
        validate_scope!(organization_id, mailbox_id, authorized_mailbox_ids, provider_account_id, provider_event_id, raw_mime)
        mail = parse_mail(raw_mime)
        selection = select_plaintext(mail)
        body = decoded_text(selection.first)
        scope = { organization_id: organization_id, mailbox_id: mailbox_id,
                  provider_account_id: provider_account_id, provider_event_id: provider_event_id }
        record = record_for(mail, raw_mime, body, selection, scope)
        # AIDEV-NOTE: The store owns durable atomic dedup; an in-memory set cannot establish replay safety.
        @store.insert_once(record)
      rescue ArgumentError, EncodingError
        reject("invalid_mime")
      end

      def capability(provider)
        provider == "fake" ? "isolated_only" : "unsupported_provider"
      end

      private

      def validate_scope!(org, mailbox, grants, account, event, raw)
        reject("invalid_scope") unless uuid?(org) && uuid?(mailbox)
        reject("forbidden") unless grants.is_a?(Array) && grants.include?(mailbox)
        reject("invalid_account_id") unless event_key?(account)
        reject("invalid_event_id") unless event_key?(event)
        reject("invalid_mime") unless raw.is_a?(String) && raw.valid_encoding? &&
                                      raw.bytesize.between?(1, MAX_RAW) && !raw.include?("\0")
      end

      def event_key?(value)
        value.is_a?(String) && /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}\z/.match?(value)
      end

      def parse_mail(raw)
        Mail.read_from_string(raw)
      rescue StandardError
        reject("invalid_mime")
      end

      def select_plaintext(mail)
        senders, recipients = mail.from, mail.to
        reject("invalid_mime") unless mail.header && senders.is_a?(Array) && senders.length == 1 &&
                                      recipients.is_a?(Array) && recipients.length.between?(1, 100)
        reject("invalid_mime") unless (senders + recipients).all? { |address| valid_address?(address) }
        parts = leaf_parts(mail)
        text_parts = parts.select { |part| part.mime_type == "text/plain" && !part.attachment? }
        reject("unsupported_mime") unless text_parts.length == 1 &&
                                          parts.all? { |part| part.equal?(text_parts.first) || part.attachment? }
        reject("unsupported_mime") if parts.any? { |part| part.mime_type == "text/html" }
        [text_parts.fetch(0), parts]
      end

      def valid_address?(value)
        value.is_a?(String) && value.bytesize <= 255 && /\A[^@\s]+@[^@\s]+\z/.match?(value)
      end

      def decoded_text(part)
        body = part.decoded
        reject("invalid_text") unless body.is_a?(String) && body.bytesize <= MAX_TEXT
        body = body.encode("UTF-8", part.charset || "UTF-8")
        reject("invalid_text") unless body.valid_encoding? && !body.include?("\0")
        body
      end

      def record_for(mail, raw, body, selection, scope)
        text_part, parts = selection
        senders, recipients = mail.from || [], mail.to || []
        # @type var record: Inbound::record
        record = { organization_id: scope.fetch(:organization_id), mailbox_id: scope.fetch(:mailbox_id),
          provider_account_id: scope.fetch(:provider_account_id), provider_event_id: scope.fetch(:provider_event_id),
          provider: "fake", content_sha256: Digest::SHA256.hexdigest(raw.b),
          from: clean_header(senders.first), to: recipients.map { |address| clean_header(address) },
          subject: clean_header(mail.subject), text: body,
          attachments: parts.reject { |part| part.equal?(text_part) }.map { |part| attachment(part) } }
        record
      end

      def attachment(part)
        type = part.mime_type
        reject("unsupported_mime") unless type.is_a?(String) &&
          %w[text/plain application/octet-stream application/pdf image/png image/jpeg].include?(type)
        data = part.decoded
        reject("oversized_attachment") unless data.bytesize <= MAX_TEXT
        { filename: clean_filename(part.filename), content_type: type, size: data.bytesize,
          sha256: Digest::SHA256.hexdigest(data) }
      end

      def uuid?(value)
        value.is_a?(String) && UUID.match?(value)
      end

      def reject(code)
        raise Rejected, code
      end

      def leaf_parts(message)
        # AIDEV-NOTE: Explicit tuple context keeps MIME nodes and depth counters distinct during stack traversal.
        # @type var stack: Array[[Mail::Message, Integer]]
        stack = []
        stack << [message, 0]
        # @type var leaves: Array[Mail::Message]
        leaves = []
        seen = 0
        until stack.empty?
          frame = stack.pop
          break unless frame

          part, depth = frame
          seen += 1
          reject("invalid_mime") if seen > MAX_PARTS * 2 || depth > 8
          part.multipart? ? add_children(stack, part, depth) : leaves << part
          reject("invalid_mime") if leaves.length > MAX_PARTS
        end
        leaves
      end

      def add_children(stack, part, depth)
        children = part.parts
        reject("invalid_mime") if children.empty? || children.length > MAX_PARTS
        children.reverse_each { |child| stack << [child, depth + 1] }
        nil
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
