# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/read_response"

class ReadResponseTest < Minitest::Test
  RESPONSE = Elevateo::ReadResponse
  FIXTURES = File.expand_path("../../../../contracts/v1/fixtures.json", __dir__)
  CONTRACT = File.expand_path("../../../../contracts/v1/openapi.json", __dir__)

  def setup
    @envelope = { "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789" }
  end

  def test_canonical_mailbox_and_empty_fixtures
    examples = JSON.parse(File.read(FIXTURES)).fetch("examples")
    %w[mailboxes mailboxes_empty].each do |name|
      expected = examples.fetch(name).fetch("body")
      body = page(expected.fetch("items"))
      assert_equal expected, JSON.parse(body)
      assert_operator body.bytesize, :<=, RESPONSE::MAILBOX_BYTES
    end
  end

  def test_budget_counts_json_escaping_utf8_and_cursor_and_preserves_whole_items
    items = (1..3).map { |id| { "id" => id.to_s, "text" => "\u0001💌\"\\\n" * 20, "nullable" => nil } }
    budget = JSON.generate(@envelope.merge("next_cursor" => "after:1", "items" => items.first(1))).bytesize
    body = page(items, limit: 3, budget: budget)
    parsed = JSON.parse(body)
    assert_equal items.first(1), parsed.fetch("items")
    assert_equal "after:1", parsed.fetch("next_cursor")
    assert_equal budget, body.bytesize
    assert body.valid_encoding?
  end

  def test_exact_limit_lookahead_and_end_cursor
    items = (1..3).map { |id| { "id" => id.to_s } }
    assert_equal "after:2", JSON.parse(page(items, limit: 2)).fetch("next_cursor")
    terminal = JSON.parse(page(items.first(2), limit: 2))
    assert_equal items.first(2), terminal.fetch("items")
    assert_nil terminal.fetch("next_cursor")
    assert_nil JSON.parse(page([])).fetch("next_cursor")
  end

  def test_small_pages_eventually_return_every_item_without_repetition
    items = (1..7).map { |id| { "id" => id.to_s, "text" => "\u0001" * 32 } }
    collected = []
    after = 0
    7.times do
      current = JSON.parse(page(items.drop(after), limit: 7, budget: 500))
      refute_empty current.fetch("items")
      collected.concat(current.fetch("items"))
      break unless current.fetch("next_cursor")

      after = current.fetch("next_cursor").delete_prefix("after:").to_i
    end
    assert_equal items, collected
  end

  def test_an_item_or_even_an_empty_envelope_that_cannot_fit_raises
    assert_raises(RESPONSE::Overflow) { page([{ "id" => "1", "text" => "x" * 1000 }], budget: 100) }
    assert_raises(RESPONSE::Overflow) { page([], budget: 1) }
  end

  def test_array_keys_and_limits_are_bounded_without_mutating_inputs
    items = [{ "id" => "1", "nullable" => nil }]
    before = JSON.generate([items, @envelope])
    assert_equal items, JSON.parse(page(items, items_key: "messages", limit: 20)).fetch("messages")
    assert_equal before, JSON.generate([items, @envelope])
    [0, 51, 1.5].each { |limit| assert_raises(RESPONSE::Invalid) { page(items, limit: limit) } }
    assert_raises(RESPONSE::Invalid) { page(items, items_key: "messages", limit: 21) }
    assert_raises(RESPONSE::Invalid) { page(items, items_key: "unexpected") }
    assert_raises(RESPONSE::Invalid) { page(items, budget: 1.5) }
  end

  def test_malformed_encoding_nonfinite_numbers_and_reserved_keys_fail
    [{ "id" => "\xFF".force_encoding("UTF-8") }, { "id" => Float::INFINITY }].each do |item|
      assert_raises(RESPONSE::Invalid) { page([item]) }
    end
    assert_raises(RESPONSE::Invalid) { page(Array.new(52) { { "id" => "1" } }) }
    assert_raises(RESPONSE::Invalid) { page([], envelope: @envelope.merge("next_cursor" => nil)) }
    assert_raises(RESPONSE::Invalid) { page([], cursor_for: ->(_) { "" }, limit: 0) }
    assert_raises(RESPONSE::Invalid) { page([{ "id" => "1" }, { "id" => "2" }], limit: 1, cursor_for: ->(_) { "" }) }
  end

  def test_schema_maximum_mailbox_is_not_silently_truncated
    # AIDEV-NOTE: Control characters expand to six JSON bytes each; emoji cover native four-byte UTF-8 as well.
    ["\u0001", "💌"].each do |character|
      item = { "id" => "00000000-0000-4000-8000-000000000021", "display_name" => character * 256,
               "display_address" => character * 256,
               "capabilities" => { "read" => true, "compose" => false, "approve_send" => false, "manage_members" => false } }
      envelope = { "context_id" => "c" * 256, "authorization_version" => "v" * 256 }
      body = page([item, item], limit: 1, envelope: envelope, cursor_for: ->(_) { "x" * 2048 })
      assert_equal [item], JSON.parse(body).fetch("items")
      assert_operator body.bytesize, :<=, RESPONSE::MAILBOX_BYTES
    end
  end

  def test_schema_maximum_message_with_all_recipients_fits_real_serializer
    schemas = JSON.parse(File.read(CONTRACT)).fetch("components").fetch("schemas")
    message_schema = schemas.fetch("Message").fetch("properties")
    assert_equal 100, message_schema.fetch("to").fetch("maxItems")
    assert_equal 16_384, message_schema.fetch("body_text").fetch("maxLength")
    ["\u0001", "💌"].each do |character|
      address = { "display_name" => character * 256, "address" => character * 256 }
      message = { "id" => "00000000-0000-4000-8000-000000000031", "sender" => address,
                  "to" => Array.new(100) { address.dup }, "sent_at" => "2026-10-13T23:59:59.999999Z",
                  "body_text" => character * 16_384, "body_truncated" => false, "attachment_count" => 1000 }
      envelope = { "context_id" => "c" * 256, "authorization_version" => "v" * 256,
                   "thread" => { "id" => message.fetch("id"), "mailbox_id" => message.fetch("id"),
                                 "subject" => character * 998, "subject_truncated" => false,
                                 "unread" => true, "message_count" => 2_147_483_647 } }
      body = page([message, message], limit: 1, envelope: envelope, cursor_for: ->(_) { "c" * 2048 },
                  budget: RESPONSE::MESSAGE_BYTES, items_key: "messages")
      assert_equal [message], JSON.parse(body).fetch("messages")
      assert_operator body.bytesize, :<=, RESPONSE::MESSAGE_BYTES
    end
  end

  private

  def page(items, **options)
    RESPONSE.page(**{ items: items, limit: 50, envelope: @envelope, budget: RESPONSE::MAILBOX_BYTES,
                      cursor_for: ->(item) { "after:#{item.fetch('id')}" } }.merge(options))
  end
end
