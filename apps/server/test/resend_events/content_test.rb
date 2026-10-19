# frozen_string_literal: true
require "minitest/autorun"
require_relative "../../lib/elevateo/resend_events/content"
require_relative "../../lib/elevateo/resend_events/attachment_stager"

class ResendContentTest < Minitest::Test
  ID = "11111111-1111-4111-8111-111111111111"
  class Client
    def attachment(*) = "hello"
  end
  class Storage
    attr_reader :objects
    def initialize = (@objects = {})
    def put_once(key, bytes) = (@objects[key] = bytes)
  end
  def content
    { "id" => ID, "from" => "Sender <sender@EXAMPLE.COM>", "to" => ["inbox@example.com"],
      "subject" => "Hello", "text" => nil, "html" => "<p>Hello <b>there</b></p><script>bad()</script>",
      "headers" => { "In-Reply-To" => "<reply@example.com>" }, "message_id" => "<new@example.com>", "attachments" => [] }
  end
  def test_normalizes_inert_text_and_addresses
    result = Elevateo::ResendEvents::Content.new.normalize(content)
    assert_equal "sender@example.com", result["from"]
    assert_includes result["text"], "Hello"
    refute_includes result["text"], "<b>"
    refute_includes result["text"], "bad()"
    assert_equal "<reply@example.com>", result["in_reply_to"]
  end
  def test_rejects_missing_recipients_and_header_injection
    [content.merge("to" => []), content.merge("from" => "a@example.com\r\nBcc: evil@example.com")].each do |value|
      assert_raises(Elevateo::ResendEvents::Invalid) { Elevateo::ResendEvents::Content.new.normalize(value) }
    end
  end
  def part
    { "id" => ID, "filename" => "hello.txt", "content_type" => "text/plain", "size" => 5 }
  end
  def test_stages_quarantine_and_retains_rejection_metadata
    storage = Storage.new
    stager = Elevateo::ResendEvents::AttachmentStager.new(client: Client.new, storage: storage)
    results = stager.stage(ID, [part, part.merge("filename" => "../bad"), part.merge("size" => 300_000)])
    assert_equal "hello", storage.objects["quarantine/resend/#{ID}/0"]
    assert_nil results[0]["rejection_reason"]
    assert_equal "invalid_name", results[1]["rejection_reason"]
    assert_equal "oversize", results[2]["rejection_reason"]
    assert_equal 1, storage.objects.length
  end
  def test_storage_failure_and_size_mismatch_do_not_acknowledge
    stager = Elevateo::ResendEvents::AttachmentStager.new(client: Client.new, storage: nil)
    assert_raises(Elevateo::ResendEvents::Invalid) { stager.stage(ID, [part]) }
    stager = Elevateo::ResendEvents::AttachmentStager.new(client: Client.new, storage: Storage.new)
    assert_raises(Elevateo::ResendEvents::Invalid) { stager.stage(ID, [part.merge("size" => 6)]) }
  end
end
