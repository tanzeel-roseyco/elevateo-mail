# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/send_api/review"

class MarketingReviewTest < Minitest::Test
  ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  def binding
    { "organization_id" => ID, "mailbox_id" => ID, "draft_id" => ID, "actor_id" => ID,
      "version" => 1, "state" => "editable", "subject" => "Newsletter", "body_text" => "Hello",
      "recipients" => [{ "display_name" => nil, "address" => "Recipient@example.invalid" }],
      "reply_to_thread_id" => nil, "sender_address" => "Sender@example.invalid", "reply_available" => true,
      "policy_revision" => "1", "mailbox_enabled" => true, "suppressed_addresses" => [],
      "consented_addresses" => [], "purpose" => "marketing" }
  end

  def test_marketing_requires_recorded_consent_even_when_simulated
    %w[held mailpit resend].each do |mode|
      refute Elevateo::SendAPI::Review.new(binding, outbound_mode: mode).result.fetch("ready")
    end
  end

  def test_marketing_snapshot_binds_explicit_purpose_and_consent
    review = Elevateo::SendAPI::Review.new(binding.merge("consented_addresses" => ["Recipient@example.invalid"]))
    assert review.result.fetch("ready")
    assert_equal "recorded_consent", review.result.fetch("consent_basis")
    assert_equal ["marketing", "recorded_marketing_consent"], JSON.parse(review.snapshot)[10,2]
  end

  def test_unknown_purpose_fails_closed
    assert_raises(Elevateo::ReadResponse::Invalid) { Elevateo::SendAPI::Review.new(binding.merge("purpose" => "other")) }
  end
end
