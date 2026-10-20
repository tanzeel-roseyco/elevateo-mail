# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/thread_projection"

class ThreadProjectionTest < Minitest::Test
  Projection = Elevateo::ThreadProjection
  Invalid = Elevateo::ReadResponse::Invalid
  ID = "00000000-0000-4000-8000-000000000031"
  MAILBOX = "00000000-0000-4000-8000-000000000021"

  def thread_row
    { "id" => ID, "mailbox_id" => MAILBOX, "subject" => nil, "unread" => true, "message_count" => 0,
      "sender" => nil, "preview_text" => "", "last_message_at" => nil, "folder" => "inbox",
      "snoozed_until" => nil, "starred" => false }
  end

  def message_row
    { "id" => ID, "sender" => nil, "recipients" => [], "body_text" => "", "sent_at" => nil, "attachment_count" => 0 }
  end

  def test_empty_and_nullable_values_match_canonical_shapes
    summary = Projection.thread(thread_row, summary: true)
    assert_nil summary.fetch("subject")
    assert_nil summary.fetch("sender")
    assert_nil summary.fetch("last_message_at")
    assert_equal "inbox", summary.fetch("folder")
    assert_nil summary.fetch("snoozed_until")
    refute summary.fetch("starred")
    refute summary.fetch("subject_truncated")
    assert_equal 0, summary.fetch("message_count")
    assert_equal %w[attachment_count body_text body_truncated id sender sent_at to], Projection.message(message_row).keys.sort
    assert_equal %w[folder id mailbox_id message_count snoozed_until starred subject subject_truncated unread],
      Projection.thread(thread_row, summary: false).keys.sort
    nullable = { "display_name" => nil, "address" => nil }
    assert_equal nullable, Projection.address(nullable, nullable: false)
  end

  def test_subject_limits_are_different_for_summary_and_detail
    [0, 256, 257, 998, 999].each do |length|
      row = thread_row.merge("subject" => "\u{1F48C}" * length)
      [true, false].each do |summary|
        limit = summary ? 256 : 998
        projected = Projection.thread(row, summary: summary)
        assert_equal [length, limit].min, projected.fetch("subject").length
        assert_equal length > limit, projected.fetch("subject_truncated")
        assert projected.fetch("subject").valid_encoding?
      end
    end
  end

  def test_plaintext_preserved_and_body_truncated_by_codepoint
    hostile = "<script>alert(1)</script>\n<img src=\"https://example.invalid/pixel\">"
    assert_equal hostile, Projection.message(message_row.merge("body_text" => hostile)).fetch("body_text")
    [16_384, 16_385].each do |length|
      result = Projection.message(message_row.merge("body_text" => "\u{1F48C}" * length))
      assert_equal 16_384, result.fetch("body_text").length
      assert_equal length > 16_384, result.fetch("body_truncated")
      assert result.fetch("body_text").valid_encoding?
    end
  end

  def test_database_json_text_is_decoded_without_accepting_malformed_shapes
    address = { "display_name" => "<b>quoted</b>", "address" => nil }
    row = message_row.merge("sender" => JSON.generate(address), "recipients" => JSON.generate([address]))
    assert_equal address, Projection.message(row).fetch("sender")
    assert_equal [address], Projection.message(row).fetch("to")
    ["{bad", "null", "[]", "x" * 4097].each do |raw|
      assert_raises(Invalid) { Projection.address(raw, nullable: true) }
    end
  end

  def test_maximum_addresses_recipients_counts_and_escaping_fit_one_message
    # AIDEV-NOTE: ASCII controls are six JSON bytes each; emoji exercises independent Unicode character limits.
    address = { "display_name" => "\u0001" * 256, "address" => "\u0001" * 256 }
    row = message_row.merge("sender" => address, "recipients" => Array.new(100) { address },
                            "body_text" => "\u0001" * 16_384, "attachment_count" => 1000)
    message = Projection.message(row)
    thread = Projection.thread(thread_row.merge("subject" => "\u0001" * 998, "message_count" => 2_147_483_647), summary: false)
    body = Elevateo::ReadResponse.page(items: [message, message], limit: 1,
      envelope: { "context_id" => "c" * 256, "authorization_version" => "v" * 256, "thread" => thread },
      items_key: "messages", budget: 2_097_152, cursor_for: ->(_) { "x" * 2048 })
    assert_operator body.bytesize, :<=, 2_097_152
    assert_equal message, JSON.parse(body).fetch("messages").first
    assert_equal 100, message.fetch("to").length
    assert_raises(Elevateo::ReadResponse::Overflow) do
      Elevateo::ReadResponse.page(items: [message], limit: 1, envelope: {}, items_key: "messages",
                                  budget: 100, cursor_for: ->(_) { "x" })
    end
  end

  def test_utc_conversion_preserves_microsecond_seek_precision
    assert_equal "2026-10-12T00:00:00Z", Projection.timestamp("2026-10-12T00:00:00.000000Z")
    assert_equal "2026-10-12T00:00:00.000001Z", Projection.timestamp("2026-10-12T00:00:00.000001Z")
    assert_equal "2026-10-12T00:00:00.100000Z", Projection.timestamp("2026-10-12T00:00:00.1Z")
    ["infinity", "2026-02-30T00:00:00Z", "2026-10-12T00:00:00+00:00", "2026-10-12T00:00:00.0000001Z", 0].each do |value|
      assert_raises(Invalid) { Projection.timestamp(value) }
    end
  end

  def test_folder_snooze_and_actor_star_values_match_the_contract
    row = thread_row.merge("folder" => "archive", "snoozed_until" => "2026-10-20T00:00:00.000001Z",
                           "starred" => true)
    projected = Projection.thread(row, summary: false)
    assert_equal ["archive", "2026-10-20T00:00:00.000001Z", true],
      projected.values_at("folder", "snoozed_until", "starred")
  end

  def test_invalid_storage_fails_closed_without_repairing_the_payload
    [{ "id" => nil }, { "subject" => "x" * 1000 }, { "unread" => nil }, { "message_count" => -1 },
     { "message_count" => 2_147_483_648 }, { "preview_text" => nil }, { "folder" => "deleted" },
     { "snoozed_until" => "2026-10-20T00:00:00+01:00" }, { "starred" => nil }].each do |change|
      assert_raises(Invalid) { Projection.thread(thread_row.merge(change), summary: true) }
    end
    [{ "recipients" => nil }, { "recipients" => [nil] }, { "recipients" => Array.new(101) { {} } },
     { "body_text" => nil }, { "body_text" => "x" * 16_386 }, { "attachment_count" => 1001 },
     { "body_text" => "\xFF".dup.force_encoding("UTF-8") }].each do |change|
      assert_raises(Invalid) { Projection.message(message_row.merge(change)) }
    end
    [[], {}, { "display_name" => "x", "address" => nil, "html" => "hidden" },
     { "display_name" => nil, "address" => "x" * 257 }].each do |value|
      assert_raises(Invalid) { Projection.address(value, nullable: false) }
    end
  end
end
