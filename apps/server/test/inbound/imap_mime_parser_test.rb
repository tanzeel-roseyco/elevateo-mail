# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_mime_parser"
require_relative "imap_mime_fixtures"

class ImapMimeParserTest < Minitest::Test
  include ImapMimeFixtures

  def test_plain_and_alternative_preserve_text_and_validate_both_representations
    plain = leaf("text/plain", "hello & goodbye")
    assert_equal "hello & goodbye", parse_part(plain).fetch(:record).fetch(:text)
    [ [plain, leaf("text/html", "<b>different</b>")], [leaf("text/html", "<b>different</b>"), plain] ].each do |parts|
      parsed = parse_part(multi("alternative", parts))
      assert_equal "hello & goodbye", parsed.fetch(:record).fetch(:text)
      assert_empty parsed.fetch(:attachments)
    end
    reject_part(multi("alternative", [plain, leaf("text/html", "x" * 262_145)]), "invalid_text")
    reject_part(multi("alternative", [plain, leaf("text/html", "a\0b")]), "invalid_text")
  end

  def test_nested_mixed_and_alternative_keep_attachment_order_and_hash
    body = multi("alternative", [leaf("text/plain", "body"), leaf("text/html", "<p>html</p>")], boundary: "inner")
    parsed = parse_part(multi("mixed", [body, leaf("application/pdf", "%PDF-demo", filename: "report.pdf")]))
    assert_equal "body", parsed.fetch(:record).fetch(:text)
    attachment = parsed.fetch(:attachments).fetch(0)
    assert_equal "%PDF-demo", attachment.fetch(:bytes)
    assert_equal Digest::SHA256.hexdigest("%PDF-demo"), attachment.fetch(:sha256)
    assert_equal 0, attachment.fetch(:ordinal)
    assert_equal 9, attachment.fetch(:byte_size)
  end

  def test_independent_duplicate_attached_or_unsupported_bodies_reject
    plain = leaf("text/plain", "body")
    [multi("mixed", [plain, plain]), multi("alternative", [plain, plain]),
     multi("alternative", [plain, multi("mixed", [plain], boundary: "inner")]),
     multi("signed", [plain]), leaf("message/rfc822", "nested"),
     multi("mixed", [plain, leaf("text/html", "<p>x</p>", filename: "body.html")])].each do |part|
      reject_part(part, "unsupported_mime")
    end
  end

  def test_decoding_charset_expansion_nul_invalid_and_exact_maximum
    assert_equal 262_144, parse_part(leaf("text/plain", "x" * 262_144)).fetch(:record).fetch(:text).bytesize
    reject_part(leaf("text/plain", "x" * 262_145), "invalid_text")
    reject_part(leaf("text/plain", "\xE9".b * 131_073, charset: "ISO-8859-1"), "invalid_text")
    assert_equal "\u00E9", parse_part(leaf("text/plain", "\xE9".b, charset: "ISO-8859-1")).fetch(:record).fetch(:text)
    ["ISO-8859-1", "Windows-1252"].each do |charset|
      ["base64", "quoted-printable"].each do |encoding|
        encoded = encoding == "base64" ? "6Q==" : "=E9"
        part = "Content-Type: text/plain; charset=#{charset}\r\nContent-Transfer-Encoding: #{encoding}\r\n\r\n#{encoded}"
        assert_equal "\u00E9", parse_part(part).fetch(:record).fetch(:text)
      end
    end
    assert_equal "\u00E9", parse_part(leaf("text/plain", "\u00E9")).fetch(:record).fetch(:text)
    reject_part(leaf("text/plain", "\0"), "invalid_text")
    reject_part(leaf("text/plain", "\xFF".b))
    reject_part(leaf("text/plain", "body", charset: "unsupported-charset"))
  end

  def test_text_attachment_preserves_original_bytes_instead_of_transcoding
    ["ISO-8859-1", "Windows-1252"].each do |charset|
      bytes = "\xE9".b
      part = leaf("text/plain", bytes, charset: charset, filename: "original.txt")
      item = parse_part(multi("mixed", [leaf("text/plain", "body"), part])).fetch(:attachments).fetch(0)
      assert_equal bytes, item.fetch(:bytes)
      assert_equal 1, item.fetch(:byte_size)
      assert_equal Digest::SHA256.hexdigest(bytes), item.fetch(:sha256)
    end
  end

  def test_unknown_transfer_encodings_reject_body_and_attachment
    plain = leaf("text/plain", "body")
    reject_part(plain.sub("base64", "unknown-transfer"), "invalid_mime")
    attachment = leaf("image/png", "png", filename: "x.png").sub("base64", "unknown-transfer")
    reject_part(multi("mixed", [plain, attachment]), "invalid_mime")
  end

  def test_empty_oversized_and_disallowed_attachments_never_return_bytes
    plain = leaf("text/plain", "body")
    ["", "x" * 262_145].each do |bytes|
      reject_part(multi("mixed", [plain, leaf("image/png", bytes, filename: "picture.png")]), "oversized_attachment")
    end
    reject_part(multi("mixed", [plain, leaf("application/octet-stream", "x", filename: "file.bin")]), "unsupported_mime")
    reject_part(multi("mixed", [plain, leaf("application/pdf", "%PDF", filename: "..")]), "invalid_filename")
  end

  def test_tree_depth_leaf_count_and_raw_input_are_bounded
    part = leaf("text/plain", "body")
    8.times { |index| part = multi("mixed", [part], boundary: "d#{index}") }
    assert_equal "body", parse_part(part).fetch(:record).fetch(:text)
    reject_part(multi("mixed", [part], boundary: "outer"), "invalid_mime")
    parts = [leaf("text/plain", "body")] + Array.new(12) { leaf("image/png", "x", filename: "x.png") }
    reject_part(multi("mixed", parts), "invalid_mime")
    [nil, "", "\0", "x" * 1_048_577].each do |raw|
      assert_equal "invalid_mime", assert_raises(Elevateo::Inbound::Rejected) {
        Elevateo::Inbound::ImapMimeParser.new.parse(raw_mime: raw)
      }.code
    end
  end

  def test_invalid_envelope_and_headers_are_not_accepted
    raw = HEADER.sub("sender@example.invalid", "not-an-address") + leaf("text/plain", "body")
    assert_equal "invalid_mime", assert_raises(Elevateo::Inbound::Rejected) {
      Elevateo::Inbound::ImapMimeParser.new.parse(raw_mime: raw)
    }.code
    parsed = parse_part(leaf("text/plain", "body"))
    assert_equal "sender@example.invalid", parsed.fetch(:record).fetch(:from)
    assert_equal ["inbox@example.invalid"], parsed.fetch(:record).fetch(:to)
    assert_equal "Fixture", parsed.fetch(:record).fetch(:subject)
  end
end
