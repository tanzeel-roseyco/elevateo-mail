# frozen_string_literal: true

require "json"
require "base64"
require_relative "../send_api/address"
require_relative "control"
require_relative "rendered_message"

module Elevateo
  module SendWorker
    class SmtpSnapshot
      MAX_MIME_BYTES = 524_288
      MAX_BODY_CHARS = 65_536
      FORMAT = "elevateo.send.snapshot.v1"

      class Invalid < StandardError; end

      def self.render(bytes, send_id:, verified_sender:)
        raise Invalid, "invalid send snapshot" unless bytes.is_a?(String) && bytes.bytesize.between?(1, 1_048_576) &&
          bytes.dup.force_encoding(Encoding::UTF_8).valid_encoding? && Control.valid_epoch?(send_id)
        value = JSON.parse(bytes, max_nesting: 5)
        identities = value.is_a?(Array) ? value[1, 3] : nil
        raise Invalid, "invalid send snapshot" unless value.is_a?(Array) && value.length == 14 && value[0] == FORMAT &&
          identities.is_a?(Array) && identities.all? { |id| Control.valid_epoch?(id) } &&
          value[4].is_a?(Integer) && value[4].positive? &&
          value[5].is_a?(Array) && value[5].length == 2 && value[5][0].nil? &&
          (value[9].nil? || Control.valid_epoch?(value[9]))
        sender = value[5][1]
        unless sender.is_a?(String) && sender == verified_sender && sender == SendAPI::Address.canonical(sender)
          raise Invalid, "sender not verified"
        end
        recipients = parse_recipients(value[6])
        subject, body = value[7], value[8]
        unless subject.is_a?(String) && subject.length <= 998 && SendAPI::Address.header?(subject) &&
            body.is_a?(String) && body.valid_encoding? && body.length <= MAX_BODY_CHARS && !body.include?("\0") &&
            value[10] == "correspondence" && value[11] == "human_correspondence_attestation" &&
            value[12].is_a?(Array) && value[12].empty? &&
            value[13].is_a?(String) && /\A[1-9][0-9]{0,18}\z/.match?(value[13])
          raise Invalid, "unsupported send content"
        end
        message = RenderedMessage.new(sender: sender, recipients: recipients, subject: subject, text: body,
          attachments: value[12], organization_id: value[1], mailbox_id: value[2])
        mime = build_mime(send_id, message)
        raise Invalid, "MIME size exceeded" if mime.bytesize > MAX_MIME_BYTES
        message.with_mime(mime)
      rescue JSON::ParserError, TypeError
        raise Invalid, "invalid send snapshot"
      end

      def self.parse_recipients(value)
        unless value.is_a?(Array) && value.length.between?(1, 100)
          raise Invalid, "invalid recipients"
        end
        seen = {} # : Hash[String, bool]
        value.map do |item|
          unless item.is_a?(Array) && item.length == 2 &&
              (item[0].nil? || (item[0].is_a?(String) && item[0].bytesize <= 256 && SendAPI::Address.header?(item[0]))) &&
              item[1].is_a?(String) && item[1] == SendAPI::Address.canonical(item[1]) && !seen[item[1]]
            raise Invalid, "invalid recipients"
          end
          seen[item[1]] = true
          [item[0], item[1]]
        end
      end
      private_class_method :parse_recipients

      def self.build_mime(send_id, message)
        encoded_subject = encoded_words(message.subject)
        encoded_body = Base64.strict_encode64(message.text.encode(Encoding::UTF_8)).scan(/.{1,76}/).join("\r\n")
        domain = message.sender.split("@", 2).last
        destinations = message.recipients.map do |name, address|
          name ? "#{encoded_words(name)} <#{address}>" : address
        end
        headers = ["From: #{message.sender}", "To: #{destinations.join(",\r\n ")}", "Subject: #{encoded_subject}",
          "Message-ID: <elevateo-#{send_id}@#{domain}>", "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64"]
        headers.join("\r\n") + "\r\n\r\n" + encoded_body + "\r\n"
      end
      private_class_method :build_mime

      # RFC 2047 encoded words are bounded by 30 UTF-8 bytes so every folded line stays short.
      def self.encoded_words(value)
        return "" if value.empty?
        chunks = [] # : Array[String]
        chunk = +""
        value.each_char do |character|
          if chunk.bytesize + character.bytesize > 30
            chunks << chunk
            chunk = +""
          end
          chunk << character
        end
        chunks << chunk unless chunk.empty?
        chunks.map { |part| "=?UTF-8?B?#{Base64.strict_encode64(part)}?=" }.join("\r\n ")
      end
      private_class_method :encoded_words
    end
  end
end
