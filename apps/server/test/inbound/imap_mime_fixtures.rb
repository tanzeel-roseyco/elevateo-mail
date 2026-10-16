# frozen_string_literal: true

require "base64"

# AIDEV-NOTE: Synthetic MIME never leaves isolated tests; builders allow precise tree and decoded-size boundary cases.
module ImapMimeFixtures
  HEADER = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nSubject: Fixture\r\n".freeze

  def leaf(type, body, charset: "UTF-8", filename: nil)
    disposition = filename ? "Content-Disposition: attachment; filename=\"#{filename}\"\r\n" : ""
    "Content-Type: #{type}; charset=#{charset}\r\n#{disposition}" \
      "Content-Transfer-Encoding: base64\r\n\r\n#{Base64.strict_encode64(body)}"
  end

  def multi(type, parts, boundary: "b")
    "Content-Type: multipart/#{type}; boundary=#{boundary}\r\n\r\n" +
      parts.map { |part| "--#{boundary}\r\n#{part}\r\n" }.join + "--#{boundary}--\r\n"
  end

  def parse_part(part)
    Elevateo::Inbound::ImapMimeParser.new.parse(raw_mime: HEADER + part)
  end

  def reject_part(part, code = nil)
    error = assert_raises(Elevateo::Inbound::Rejected) { parse_part(part) }
    assert_equal code, error.code if code
    error
  end
end
