# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/drafts/payload"

class DraftPayloadTest < Minitest::Test
  # AIDEV-NOTE: Golden bytes distinguish ordered recipient semantics from irrelevant object-key ordering.
  BOX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  OP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

  def input
    { "mailbox_id" => BOX, "operation_id" => OP, "expected_version" => 0,
      "subject" => "", "to" => [], "body_text" => "", "reply_to_thread_id" => nil }
  end

  def payload(changes = {})
    Elevateo::Drafts::Payload.new(draft_id: ID, input: input.merge(changes))
  end

  def test_canonical_bytes_are_semantic_ordered_utf8_with_exact_escaping
    source = "\"\\\b\f\n\r\t\u0001/\u2028\u2029\u{1F48C}"
    value = payload("subject" => source, "expected_version" => 0.0,
                    "to" => [{ "address" => "", "display_name" => nil }])
    expected = '["' + BOX + '","' + ID + '",0,"' + '\"\\\\\b\f\n\r\t\u0001/' +
      "\u2028\u2029\u{1F48C}" + '",[[null,""]],"",null]'
    assert_equal expected, value.canonical_bytes
    assert_equal Digest::SHA256.hexdigest(expected), value.digest
    assert_equal value.digest, Elevateo::Drafts::Payload.new(draft_id: ID.upcase,
      input: input.merge("mailbox_id" => BOX.upcase, "subject" => source, "to" => [{ "display_name" => nil, "address" => "" }])).digest
  end

  def test_null_empty_order_and_operation_key_have_the_prescribed_meaning
    first = payload("to" => [{ "display_name" => nil, "address" => "" }])
    refute_equal first.digest, payload("to" => [{ "display_name" => "", "address" => "" }]).digest
    assert_equal payload.digest, payload("operation_id" => ID).digest
    refute_equal payload("body_text" => "e\u0301").digest, payload("body_text" => "\u00e9").digest
    assert_equal 2_147_483_647, payload("expected_version" => 2_147_483_647.0).expected_version
  end

  def test_empty_incomplete_and_unicode_maxima_are_valid
    recipient = { "display_name" => "\u{1F48C}" * 256, "address" => nil }
    value = payload("subject" => "\u{1F48C}" * 998, "body_text" => "\u{1F48C}" * 65_536, "to" => [recipient] * 100)
    assert_equal 998, value.subject.length
    assert_equal 100, value.recipients.length
    assert_equal [], payload.recipients
  end

  def test_recipient_count_is_independent_of_recipient_shape
    recipient = { "display_name" => nil, "address" => nil }
    assert_equal 100, payload("to" => [recipient] * 100).recipients.length
    error = assert_raises(Elevateo::CollaborationError) { payload("to" => [recipient] * 101) }
    assert_equal "request_invalid", error.code
  end

  def test_distinct_recipient_order_changes_exact_canonical_bytes_and_digest
    recipients = [{ "address" => "a@example.invalid", "display_name" => "A" },
                  { "display_name" => nil, "address" => "b@example.invalid" }]
    forward = payload("to" => recipients)
    reverse = payload("to" => recipients.reverse)
    prefix = '["' + BOX + '","' + ID + '",0,"",'
    assert_equal prefix + '[["A","a@example.invalid"],[null,"b@example.invalid"]],"",null]', forward.canonical_bytes
    assert_equal prefix + '[[null,"b@example.invalid"],["A","a@example.invalid"]],"",null]', reverse.canonical_bytes
    refute_equal forward.digest, reverse.digest
    [forward, reverse].each { |value| assert_equal Digest::SHA256.hexdigest(value.canonical_bytes), value.digest }
    assert_equal forward.digest, payload("to" => recipients.map { |recipient| recipient.to_a.reverse.to_h }).digest
  end

  def test_invalid_limits_and_wrong_types_are_rejected
    changes = [{ "subject" => "a" * 999 }, { "body_text" => "a" * 65_537 }, { "to" => [nil] },
      { "to" => [{ "display_name" => nil, "address" => "a" * 257 }] }, { "to" => [{}] },
      { "expected_version" => -1 }, { "expected_version" => 1.5 }, { "expected_version" => "0" },
      { "expected_version" => 2_147_483_648 }, { "subject" => nil }, { "subject" => "\u0000" },
      { "reply_to_thread_id" => "wrong" }, { "actor_id" => ID }]
    changes.each do |change|
      error = assert_raises(Elevateo::CollaborationError) { payload(change) }
      assert_equal "request_invalid", error.code
    end
    assert_raises(Elevateo::CollaborationError) do
      Elevateo::Drafts::Payload.new(draft_id: ID, input: input.reject { |key, _| key == "to" })
    end
  end
end
