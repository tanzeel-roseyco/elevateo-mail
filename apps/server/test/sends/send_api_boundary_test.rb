# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/send_api/input"
require_relative "../../lib/elevateo/send_api/review"

class SendAPIBoundaryTest < Minitest::Test
  ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  def binding
    { "organization_id" => ID, "mailbox_id" => ID, "draft_id" => ID, "actor_id" => ID,
      "version" => 1, "state" => "editable", "subject" => "Hello", "body_text" => "body/\u2028\u{1F48C}",
      "recipients" => [{ "display_name" => nil, "address" => "Local@EXAMPLE.invalid" }],
      "reply_to_thread_id" => nil, "sender_address" => "Sender@EXAMPLE.invalid", "reply_available" => true,
      "policy_revision" => "1", "mailbox_enabled" => true, "suppressed_addresses" => [], "consented_addresses" => [] }
  end

  def test_resend_requires_consent_evidence_for_every_recipient
    denied = Elevateo::SendAPI::Review.new(binding, outbound_mode: "resend").result
    assert_equal false, denied.fetch("ready")
    assert_equal "ok", denied.fetch("recipient_checks").first.fetch("status")
    assert_equal false, denied.fetch("recipient_checks").first.fetch("consent_evidence")
    assert_includes denied.fetch("issues"), { "code" => "consent_required", "recipient_index" => 0 }

    allowed = Elevateo::SendAPI::Review.new(
      binding.merge("consented_addresses" => ["local@example.invalid"]), outbound_mode: "resend"
    ).result
    assert_equal true, allowed.fetch("ready")
    assert_equal true, allowed.fetch("recipient_checks").first.fetch("consent_evidence")
    assert_equal "resend", allowed.fetch("outbound_mode")
    assert_equal false, allowed.fetch("simulated")
  end

  def approval
    { "mailbox_id" => ID, "operation_id" => ID, "expected_version" => 1,
      "review_digest" => "a" * 64, "correspondence_confirmed" => true }
  end

  def test_ready_review_preserves_content_and_folds_only_domains
    source = binding
    review = Elevateo::SendAPI::Review.new(source)
    assert_equal true, review.result["ready"]
    assert_equal "held", review.result["outbound_mode"]
    assert_equal false, review.result["recipient_checks"].first.fetch("consent_evidence")
    assert_equal "Local@example.invalid", review.result["to"][0]["address"]
    assert_equal "Sender@example.invalid", review.result["sender"]["address"]
    assert_equal source["body_text"], review.result["body_text"]
    assert_equal "Local@EXAMPLE.invalid", source["recipients"][0]["address"]
    expected = ["elevateo.send.snapshot.v1", ID, ID, ID, 1, [nil, "Sender@example.invalid"],
      [[nil, "Local@example.invalid"]], "Hello", source["body_text"], nil,
      "correspondence", "human_correspondence_attestation", [], "1"]
    assert_equal JSON.generate(expected), review.snapshot
    assert_equal Digest::SHA256.hexdigest(review.snapshot), review.result["review_digest"]
  end

  def test_duplicate_suppressed_and_invalid_recipients_have_only_indexed_issues
    source = binding.merge("recipients" => [
      { "display_name" => "", "address" => "Local@example.invalid" },
      { "display_name" => nil, "address" => "Local@EXAMPLE.invalid" },
      { "display_name" => nil, "address" => "local@example.invalid" },
      { "display_name" => nil, "address" => "bad..local@example.invalid" }],
      "suppressed_addresses" => ["local@example.invalid"])
    result = Elevateo::SendAPI::Review.new(source).result
    assert_equal(%w[ok duplicate suppressed invalid], result["recipient_checks"].map { |check| check["status"] })
    assert_nil result["review_digest"]
    assert_equal([1, 2, 3], result["issues"].map { |issue| issue["recipient_index"] })
    result["issues"].each { |issue| assert_equal %w[code recipient_index], issue.keys.sort }
  end

  def test_consumed_missing_policy_empty_and_header_failures_stay_visible_unsent
    source = binding.merge("state" => "consumed", "policy_revision" => nil, "mailbox_enabled" => false,
      "sender_address" => nil, "recipients" => [], "subject" => "bad\r\nheader")
    result = Elevateo::SendAPI::Review.new(source).result
    assert_equal false, result["ready"]
    assert_nil result["review_digest"]
    assert_equal source["subject"], result["subject"]
    assert_equal %w[draft_consumed header_invalid mailbox_disabled purpose_unavailable recipient_required sender_unconfigured],
      result["issues"].map { |issue| issue["code"] }.sort
  end

  def test_missing_policy_never_mints_ready_digest_even_with_enabled_mailbox
    result = Elevateo::SendAPI::Review.new(binding.merge("policy_revision" => nil)).result
    assert_equal false, result["ready"]
    assert_nil result["review_digest"]
    assert_includes result["issues"].map { |issue| issue["code"] }, "purpose_unavailable"
  end

  def test_invalid_sender_reply_and_display_controls_are_nonready_without_hiding_source
    source = binding.merge("sender_address" => "invalid sender", "reply_available" => false)
    source["recipients"][0]["display_name"] = "bad\tname"
    result = Elevateo::SendAPI::Review.new(source).result
    assert_equal false, result["ready"]
    assert_nil result["review_digest"]
    assert_equal "invalid sender", result["sender"]["address"]
    assert_equal %w[header_invalid reply_unavailable sender_invalid], result["issues"].map { |issue| issue["code"] }.sort
  end

  def test_address_grammar_limits_and_case_identity
    valid = "a" * 64 + "@" + "b" * 63 + ".invalid"
    assert_equal valid, Elevateo::SendAPI::Address.canonical(valid)
    ["a" * 65 + "@example.invalid", ".a@example.invalid", "a.@example.invalid", "a@localhost",
      "a@-example.invalid", "a@example-.invalid", "a@ex..invalid", "a@example.invalid\n", "é@example.invalid",
      '"a"@example.invalid', "a@[127.0.0.1]", "a@" + "b" * 64 + ".invalid"].each do |address|
      assert_nil Elevateo::SendAPI::Address.canonical(address)
    end
    refute_equal Elevateo::SendAPI::Address.canonical("A@example.invalid"),
      Elevateo::SendAPI::Address.canonical("a@example.invalid")
  end

  def test_recipient_limits_null_empty_names_and_digest_changes
    source = binding
    source["recipients"] = 100.times.map { |index| { "display_name" => nil, "address" => "a#{index}@example.invalid" } }
    assert_equal true, Elevateo::SendAPI::Review.new(source).result["ready"]
    source["recipients"] << source["recipients"].first
    assert_raises(Elevateo::ReadResponse::Invalid) { Elevateo::SendAPI::Review.new(source) }
    original = Elevateo::SendAPI::Review.new(binding).result["review_digest"]
    changed = binding
    changed["recipients"][0]["display_name"] = ""
    refute_equal original, Elevateo::SendAPI::Review.new(changed).result["review_digest"]
    refute_equal original, Elevateo::SendAPI::Review.new(binding.merge("policy_revision" => "2")).result["review_digest"]
  end

  def test_approval_is_closed_literal_attestation_and_integer_token
    assert_equal 1, Elevateo::SendAPI::Input.new(draft_id: ID, input: approval).expected_version
    [{ "expected_version" => 1.0 }, { "expected_version" => 0 }, { "expected_version" => 2_147_483_648 },
      { "correspondence_confirmed" => false }, { "correspondence_confirmed" => "true" },
      { "review_digest" => "A" * 64 }, { "snapshot_bytes" => "forged" }, { "epoch" => ID }].each do |change|
      error = assert_raises(Elevateo::SendError) do
        Elevateo::SendAPI::Input.new(draft_id: ID, input: approval.merge(change))
      end
      assert_equal "request_invalid", error.code
    end
  end

  def test_canonical_bytes_have_independent_escape_and_unicode_spelling
    source = binding.merge("subject" => [34, 92, 47].pack("C*") + "雪", "body_text" => "\b\f\n\r\t\u0001/\u2028\u2029💌")
    review = Elevateo::SendAPI::Review.new(source)
    expected = '["elevateo.send.snapshot.v1","' + ID + '","' + ID + '","' + ID +
      '",1,[null,"Sender@example.invalid"],[[null,"Local@example.invalid"]],"' +
      [92, 34, 92, 92, 47].pack("C*") + '雪' + '","' + '\b\f\n\r\t\u0001/' + "\u2028\u2029💌" +
      '",null,"correspondence","human_correspondence_attestation",[],"1"]'
    assert_equal expected, review.snapshot
    assert_equal Digest::SHA256.hexdigest(expected), review.result["review_digest"]
    assert_equal true, review.result["ready"]
  end

  def test_subject_body_and_display_boundaries_preserve_maximum_unsent_content
    source = binding.merge("subject" => "雪" * 998, "body_text" => "💌" * 65_536)
    source["recipients"][0]["display_name"] = "雪" * 256
    review = Elevateo::SendAPI::Review.new(source)
    assert_equal true, review.result["ready"]
    assert_equal source["body_text"], review.result["body_text"]
    [{ "subject" => "a" * 999 }, { "body_text" => "a" * 65_537 }].each do |changes|
      assert_raises(Elevateo::ReadResponse::Invalid) { Elevateo::SendAPI::Review.new(binding.merge(changes)) }
    end
  end

  def test_error_envelope_never_widens_collaboration_and_bounds_request_id
    assert_raises(KeyError) { Elevateo::CollaborationError.new("review_stale") }
    error = Elevateo::SendError.new("not_available")
    assert_equal "This item is unavailable.", error.message
    assert_equal %w[code message request_id], error.body("é" * 200).keys.sort
    assert_operator error.body("é" * 200)["request_id"].bytesize, :<=, 128
    assert error.body("é" * 200)["request_id"].valid_encoding?
  end
end
