# frozen_string_literal: true

require "mail"
require_relative "signature"
require_relative "../inbound/fake_ingress"
require_relative "../inbound/imap_html_text"

module Elevateo
  module ResendEvents
    # AIDEV-NOTE: Incoming bodies become inert text; headers never supply an organization or mailbox identifier.
    class Content
      def normalize(value)
        text = value["text"]
        unless text.is_a?(String)
          html = value["html"]
          text = html.is_a?(String) ? Inbound::ImapHtmlText.new.convert(html) : ""
        end
        raise Invalid, "invalid received text" unless text.valid_encoding? &&
          text.bytesize <= Signature::MAX_BODY && !text.include?("\0")
        subject = value["subject"]
        raise Invalid, "invalid received subject" unless subject.is_a?(String) &&
          subject.length <= 255 && !/[\r\n\0]/.match?(subject)
        recipients = value["to"]
        raise Invalid, "invalid recipients" unless recipients.is_a?(Array) && recipients.length.between?(1, 100)
        attachments = value["attachments"]
        raise Invalid, "invalid attachments" unless attachments.is_a?(Array) && attachments.length <= 100
        headers = value["headers"]
        reference = headers.is_a?(Hash) ? headers.find { |key, _item| key.to_s.downcase == "in-reply-to" }&.last : nil
        reference = nil unless reference.is_a?(String) && reference.bytesize <= 998 && !/[\r\n\0]/.match?(reference)
        message_id = value["message_id"]
        message_id = nil unless message_id.is_a?(String) && message_id.bytesize <= 998 && !/[\r\n\0]/.match?(message_id)
        { "id" => value["id"], "from" => address(value["from"]), "to" => recipients.map { |item| address(item) },
          "subject" => subject, "text" => text, "attachments" => attachments,
          "message_id" => message_id, "in_reply_to" => reference }
      end

      private

      def address(value)
        raise Invalid, "invalid received address" unless value.is_a?(String) && value.bytesize <= 512 &&
          !/[\r\n\0]/.match?(value)
        parsed = Mail::Address.new(value).address
        raise Invalid, "invalid received address" unless parsed.is_a?(String) && parsed.bytesize <= 256 &&
          /\A[^\s@<>]+@[^\s@<>]+\z/.match?(parsed)
        local, domain = parsed.split("@", 2)
        raise Invalid, "invalid received address" unless local && domain
        "#{local}@#{domain.downcase}"
      rescue Mail::Field::ParseError
        raise Invalid, "invalid received address"
      end
    end
  end
end
