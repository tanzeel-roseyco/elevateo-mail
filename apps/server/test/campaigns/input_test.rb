# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../lib/elevateo/campaigns/input"

class CampaignInputTest < Minitest::Test
  ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  OP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

  def test_inert_draft_and_consented_lead
    campaign = Elevateo::Campaigns::Input.new(kind: "campaign", value: {
      "id" => ID, "operation_id" => OP, "name" => "Pilot", "status" => "draft"
    })
    assert_equal "draft", campaign.attributes.fetch("status")
    lead = Elevateo::Campaigns::Input.new(kind: "lead", value: {
      "id" => ID, "operation_id" => OP, "campaign_id" => ID, "email" => "A@Example.invalid",
      "consent_status" => "granted", "consent_recorded_at" => Time.now.utc.iso8601, "consent_source" => "confirmed opt-in", "suppressed" => false
    })
    assert_equal "a@example.invalid", lead.attributes.fetch("email")
  end

  def test_rejects_active_state_and_extra_fields
    input = { "id" => ID, "operation_id" => OP, "name" => "Pilot", "status" => "active" }
    assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::Input.new(kind: "campaign", value: input) }
    input["provider_key"] = "secret"
    assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::Input.new(kind: "campaign", value: input) }
  end

  def test_future_consent_timestamp_rejected
    value = { "id" => ID, "operation_id" => OP, "campaign_id" => ID, "email" => "a@example.invalid",
      "consent_status" => "granted", "consent_recorded_at" => (Time.now.utc + 3600).iso8601,
      "consent_source" => "confirmed opt-in", "suppressed" => false }
    assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::Input.new(kind: "lead", value: value) }
  end

  def test_rejects_unproved_consent_and_unbounded_address
    input = { "id" => ID, "operation_id" => OP, "campaign_id" => ID, "email" => "a@example.invalid",
      "consent_status" => "granted", "consent_recorded_at" => nil, "consent_source" => nil, "suppressed" => false }
    assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::Input.new(kind: "lead", value: input) }
    input["consent_status"] = "unknown"
    input["email"] = "a" * 250 + "@example.invalid"
    assert_raises(Elevateo::CollaborationError) { Elevateo::Campaigns::Input.new(kind: "lead", value: input) }
  end
end

class CampaignInputMixedKeysTest < Minitest::Test
  def test_symbol_key_does_not_escape_boundary_as_argument_error
    value = { "id" => CampaignInputTest::ID, "operation_id" => CampaignInputTest::OP,
      "name" => "Pilot", status: "draft" }
    assert_raises(Elevateo::CollaborationError) do
      Elevateo::Campaigns::Input.new(kind: "campaign", value: value)
    end
  end
end
