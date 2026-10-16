# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_mime_parser"

class ImapMimeParserAttachmentTest < Minitest::Test
  HEADER = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\n".freeze

  def test_bounded_plaintext_and_attachment_bytes
    parsed = parser.parse(raw_mime: multipart("application/pdf", "report.pdf", "%PDF-demo"))
    assert_equal "hello", parsed.fetch(:record).fetch(:text)
    attachment = parsed.fetch(:attachments).fetch(0)
    assert_equal 0, attachment.fetch(:ordinal)
    assert_equal "report.pdf", attachment.fetch(:filename)
    assert_equal "%PDF-demo", attachment.fetch(:bytes)
    assert_equal "application/pdf", attachment.fetch(:content_type)
  end

  def test_html_and_disallowed_binary_never_produce_staging_bytes
    assert_equal "unsupported_mime", assert_raises(Elevateo::Inbound::Rejected) {
      parser.parse(raw_mime: multipart("text/html", "body.html", "<b>unsafe</b>"))
    }.code
    assert_equal "unsupported_mime", assert_raises(Elevateo::Inbound::Rejected) {
      parser.parse(raw_mime: multipart("application/octet-stream", "payload.bin", "bytes"))
    }.code
  end

  def test_oversized_or_malformed_event_rejected_before_staging
    assert_equal "oversized_attachment", assert_raises(Elevateo::Inbound::Rejected) {
      parser.parse(raw_mime: multipart("image/png", "large.png", "x" * 262_145))
    }.code
    assert_equal "invalid_mime", assert_raises(Elevateo::Inbound::Rejected) {
      parser.parse(raw_mime: "Content-Type: text/plain\r\n\r\nno envelope")
    }.code
  end

  private

  def parser = Elevateo::Inbound::ImapMimeParser.new

  def multipart(type, filename, bytes)
    HEADER + "Content-Type: multipart/mixed; boundary=x\r\n\r\n" \
      "--x\r\nContent-Type: text/plain\r\n\r\nhello\r\n" \
      "--x\r\nContent-Type: #{type}\r\n" \
      "Content-Disposition: attachment; filename=#{filename}\r\n\r\n#{bytes}\r\n--x--\r\n"
  end
end
