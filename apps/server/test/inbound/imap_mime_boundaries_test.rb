# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_mime_parser"
require_relative "imap_mime_fixtures"

# AIDEV-NOTE: Boundary fixtures distinguish capacity limits from ambiguous body rejection without live mail.
class ImapMimeBoundariesTest < Minitest::Test
  include ImapMimeFixtures

  def test_related_preserves_multiple_attachment_order_and_allowed_types
    parts = [leaf("text/html", "<p>Visible</p>")]
    %w[image/png image/jpeg text/plain application/pdf].each_with_index do |type, index|
      parts << leaf(type, "#{index}", filename: "file#{index}")
    end
    parsed = parse_part(multi("related", parts))
    assert_equal "Visible", parsed.fetch(:record).fetch(:text)
    assert_equal %w[image/png image/jpeg text/plain application/pdf], (parsed.fetch(:attachments).map { |item| item.fetch(:content_type) })
    parsed.fetch(:attachments).each_with_index do |attachment, index|
      assert_equal index, attachment.fetch(:ordinal)
      assert_equal "#{index}", attachment.fetch(:bytes)
      assert_equal 1, attachment.fetch(:byte_size)
      assert_equal "file#{index}", attachment.fetch(:filename)
    end
  end

  def test_exact_attachment_maximum
    parsed = parse_part(multi("mixed", [leaf("text/plain", "body"),
      leaf("application/pdf", "x" * 262_144, filename: "report.pdf")]))
    assert_equal 262_144, parsed.fetch(:attachments).first.fetch(:byte_size)
  end

  def test_exact_twelve_leaves_and_twenty_four_nodes_then_one_extra_node
    parts = [leaf("text/plain", "body")]
    11.times do |index|
      parts << multi("mixed", [leaf("image/png", "x", filename: "f#{index}.png")], boundary: "a#{index}")
    end
    parsed = parse_part(multi("mixed", parts))
    assert_equal 11, parsed.fetch(:attachments).length
    parts[0] = multi("mixed", [parts.fetch(0)], boundary: "one_more")
    reject_part(multi("mixed", parts), "invalid_mime")
  end

  def test_exact_raw_limit_then_one_extra_byte
    part = multi("mixed", [leaf("text/plain", "body")])
    raw = HEADER + part
    # AIDEV-NOTE: MIME preamble has no body semantics but still consumes the raw message allocation budget.
    raw = raw.sub("\r\n\r\n", "\r\n\r\n" + "x" * (1_048_574 - raw.bytesize) + "\r\n")
    assert_equal 1_048_576, raw.bytesize
    assert_equal "body", Elevateo::Inbound::ImapMimeParser.new.parse(raw_mime: raw).fetch(:record).fetch(:text)
    assert_equal "invalid_mime", assert_raises(Elevateo::Inbound::Rejected) {
      Elevateo::Inbound::ImapMimeParser.new.parse(raw_mime: raw + "x")
    }.code
  end

  def test_html_exact_attribute_node_and_output_limits
    converter = Elevateo::Inbound::ImapHtmlText.new
    html = '<div ' + (1..64).map { |index| "a#{index}=x" }.join(' ') + '>ok</div>'
    assert_equal "ok", converter.convert(html)
    # AIDEV-NOTE: html/head/body consume three visited nodes; 8190 element/text pairs and one text node reach 16384.
    assert_equal "x" * 8191, converter.convert('<i>x</i>' * 8190 + 'x')
    assert_equal "invalid_text", assert_raises(Elevateo::Inbound::Rejected) {
      converter.convert('<i>x</i>' * 8191)
    }.code
    assert_equal 262_144, converter.convert('x' * 262_144).bytesize
  end
end
