# frozen_string_literal: true

require "digest"
require "mail"
require_relative "imap_mime_error"
require_relative "imap_mime_tree"
require_relative "imap_html_text"

module Elevateo
  module Inbound
    # AIDEV-NOTE: One parse supplies body and staging bytes; FakeIngress keeps its deliberately narrower simulated contract.
    # AIDEV-NOTE: Attachment bytes remain worker-private until quarantine staging; unsupported types never reach storage.
    class ImapMimeParser
      ALLOWED_TYPES = %w[application/pdf image/png image/jpeg text/plain].freeze

      def parse(raw_mime:)
        raise MimeRejected, "invalid_mime" unless raw_mime.is_a?(String) && raw_mime.valid_encoding? &&
          raw_mime.bytesize.between?(1, FakeIngress::MAX_RAW) && !raw_mime.include?("\0")

        mail = Mail.read_from_string(raw_mime)
        senders, recipients = mail.from, mail.to
        raise MimeRejected, "invalid_mime" unless mail.header && senders.is_a?(Array) && senders.length == 1 &&
          recipients.is_a?(Array) && recipients.length.between?(1, 100) &&
          (senders + recipients).all? { |address| address.bytesize <= 255 && /\A[^@\s]+@[^@\s]+\z/.match?(address) }

        bodies, parts = ImapMimeTree.new.select(mail)
        # @type var decoded: Array[[String?, String]]
        decoded = bodies.map { |body| [body.mime_type, text(body)] }
        selected = decoded.find { |type, _| type == "text/plain" } || decoded.fetch(0)
        body = selected.first == "text/html" ? ImapHtmlText.new.convert(selected.last) : selected.last
        attachments = parts.each_with_index.map { |part, ordinal| attachment(part, ordinal) }
        { record: { content_sha256: Digest::SHA256.hexdigest(raw_mime.b), from: header(senders.fetch(0)),
                    to: recipients.map { |value| header(value) }, subject: header(mail.subject), text: body },
          attachments: attachments }
      rescue ArgumentError, EncodingError, Mail::UnknownEncodingType
        raise MimeRejected, "invalid_mime"
      end

      private

      def text(part)
        # AIDEV-NOTE: Message#decoded already transcodes; use Body#decoded bytes to apply the declared charset exactly once.
        value = part.body.decoded
        raise MimeRejected, "invalid_text" if value.bytesize > FakeIngress::MAX_TEXT

        value = value.encode("UTF-8", part.charset || "UTF-8")
        raise MimeRejected, "invalid_text" unless value.valid_encoding? && value.bytesize <= FakeIngress::MAX_TEXT && !value.include?("\0")

        value
      end

      def attachment(part, ordinal)
        type = part.mime_type
        raise MimeRejected, "unsupported_mime" unless type.is_a?(String) && ALLOWED_TYPES.include?(type)

        # AIDEV-NOTE: Attachment hashes and size describe original transfer-decoded bytes, never transcoded text.
        bytes = part.body.decoded.b
        raise MimeRejected, "oversized_attachment" unless bytes.bytesize.between?(1, FakeIngress::MAX_TEXT)

        name = header(part.filename.to_s.tr("\\", "/").split("/").last).byteslice(0, FakeIngress::MAX_FILENAME).to_s.scrub("")
        raise MimeRejected, "invalid_filename" if name.empty? || name == "." || name == ".."

        { ordinal: ordinal, filename: name, content_type: type, byte_size: bytes.bytesize,
          sha256: Digest::SHA256.hexdigest(bytes), bytes: bytes }
      end

      def header(value)
        value.to_s.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
          .gsub(/[\x00-\x1f\x7f]/, " ").strip.byteslice(0, 255).to_s.scrub("")
      end
    end
  end
end
