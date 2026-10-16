# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/inbound/imap_mime_parser"
require_relative "imap_mime_fixtures"

class ImapHtmlTextTest < Minitest::Test
  include ImapMimeFixtures

  def test_html_body_becomes_entity_decoded_text_with_block_and_break_boundaries
    parsed = parse_part(leaf("text/html", "<p>Hello &amp; goodbye</p><div>Next<br>line</div>"))
    assert_equal "Hello & goodbye\n\nNext\nline", parsed.fetch(:record).fetch(:text)
    assert_empty parsed.fetch(:attachments)
  end

  def test_active_and_remote_content_never_becomes_message_text
    html = '<html><head><title>private title</title><style>private style</style></head><body>' \
      '<script>private script</script><template>private template</template><iframe src="https://example.invalid">private frame</iframe>' \
      '<svg>private svg</svg><object>private object</object><noscript>private fallback</noscript>' \
      '<img src="https://example.invalid/pixel"><a href="https://example.invalid">Visible</a></body></html>'
    assert_equal "Visible", parse_part(leaf("text/html", html)).fetch(:record).fetch(:text)
  end

  def test_parser_depth_attributes_nodes_and_output_have_limits
    converter = Elevateo::Inbound::ImapHtmlText.new
    ['<div>' * 65 + 'x' + '</div>' * 65,
     '<div ' + (1..65).map { |i| "a#{i}=x" }.join(' ') + '>x</div>',
     '<i>x</i>' * 9000,
     '&nLt;' * 43_691,
     'x' * 262_145].each do |html|
      assert_equal "invalid_text", assert_raises(Elevateo::Inbound::Rejected) { converter.convert(html) }.code
    end
  end

  def test_malformed_html_is_inert_and_empty_html_is_an_empty_body
    assert_equal "Hello <world>", parse_part(leaf("text/html", "<p>Hello &lt;world&gt;")).fetch(:record).fetch(:text)
    assert_equal "", parse_part(leaf("text/html", "<script>nothing visible</script>")).fetch(:record).fetch(:text)
  end
end
