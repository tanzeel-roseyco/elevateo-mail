# frozen_string_literal: true

require_relative "be_02/write_boundary_test_helper"
require_relative "../app/controllers/v2/outreach_campaigns_controller"

class V2OutreachCampaignsTest < Minitest::Test
  def test_projects_inert_draft_metadata
    row = { "id" => "00000000-0000-4000-8000-000000000001", "name" => "Pilot", "status" => "draft", "created_at" => Time.now }
    assert_equal({ "id" => row["id"], "name" => "Pilot", "status" => "draft" }, V2::OutreachCampaignsController.campaign_projection(row))
  end

  def test_rejects_unexpected_lifecycle_status
    row = { "id" => "00000000-0000-4000-8000-000000000001", "name" => "Pilot", "status" => "sending" }
    assert_raises(Elevateo::CollaborationError) { V2::OutreachCampaignsController.campaign_projection(row) }
  end

  def test_rejects_missing_id
    assert_raises(Elevateo::CollaborationError) { V2::OutreachCampaignsController.campaign_projection({ "name" => "Pilot", "status" => "draft" }) }
  end
end
