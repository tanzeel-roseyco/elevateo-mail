# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/campaigns/run_input"

class CampaignRunInputTest < Minitest::Test
  ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

  def input
    { "operation_id" => ID, "mailbox_id" => OTHER, "expected_campaign_version" => 1,
      "subject" => "Newsletter", "body_text" => "Hello\nthere", "lead_ids" => [ID], "marketing_confirmed" => true }
  end

  def test_frozen_digest_is_independent_of_audience_order
    first = Elevateo::Campaigns::RunInput.new(input.merge("lead_ids" => [ID, OTHER]))
    second = Elevateo::Campaigns::RunInput.new(input.merge("lead_ids" => [OTHER, ID]))
    assert_equal first.digest, second.digest
    refute_equal first.digest, Elevateo::Campaigns::RunInput.new(input.merge("body_text" => "Changed")).digest
  end

  def test_requires_explicit_marketing_consent_and_closed_input
    [input.merge("marketing_confirmed" => false), input.merge("extra" => true), input.merge("expected_campaign_version" => 0)].each do |value|
      assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::RunInput.new(value) }
    end
  end

  def test_rejects_empty_duplicate_and_oversized_audiences
    [[], [ID, ID], [ID] * 26, [nil]].each do |ids|
      assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::RunInput.new(input.merge("lead_ids" => ids)) }
    end
  end

  def test_bounds_bytes_and_rejects_header_injection_and_body_control_characters
    [{ "body_text" => "\u00e9" * 32769 }, { "subject" => "Hello\r\nBcc: other" }, { "body_text" => "bad\x01" }, { "body_text" => " " }].each do |change|
      assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::RunInput.new(input.merge(change)) }
    end
    assert_equal 65536, Elevateo::Campaigns::RunInput.new(input.merge("body_text" => "a" * 65536)).body_text.bytesize
  end
end
