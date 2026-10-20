# frozen_string_literal: true

require "json"
require "minitest/autorun"
require_relative "../../apps/server/config/v2_route_registry"

class ContractV2Test < Minitest::Test
  SOURCE = File.expand_path("openapi.json", __dir__)
  V1 = File.expand_path("../v1/openapi.json", __dir__)

  def setup
    @contract = JSON.parse(File.read(SOURCE))
  end

  def test_happy_path_has_additive_interfaces
    assert_equal "2.0.0-draft.8", @contract.dig("info", "version")
    assert_equal %w[get post put], @contract.fetch("paths").values.flat_map(&:keys).uniq.sort
    assert @contract.dig("components", "schemas", "OrganizationGrant")
    assert_equal "active", @contract.dig("paths", "/v2/outreach/campaigns", "get", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/outreach/campaigns", "post", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}", "put", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}/leads", "post", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}/leads/{lead_id}", "put", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}/leads/{lead_id}/consent", "post", "x-elevateo-status")
    assert_equal "#/components/schemas/LeadDetail", @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}/leads/{lead_id}", "get", "responses", "200", "content", "application/json", "schema", "$ref")
    assert_equal "active", @contract.dig("paths", "/v2/threads/{thread_id}/messages/{message_id}", "get", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/me/preferences", "get", "x-elevateo-status")
    assert_equal "active", @contract.dig("paths", "/v2/me/preferences", "put", "x-elevateo-status")
    sequence = @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}/sequence")
    assert_equal %w[getOutreachSequenceDraft saveOutreachSequenceDraft], sequence.values.map { |operation| operation.fetch("operationId") }
    assert sequence.values.all? { |operation| operation.fetch("x-elevateo-status") == "active" }
  end

  def test_failure_no_live_dispatch_or_v1_collision
    assert_empty(@contract.fetch("paths").keys & JSON.parse(File.read(V1)).fetch("paths").keys)
    assert_equal %w[draft paused], @contract.dig("components", "schemas", "OutreachPlan", "properties", "status", "enum")
    refute @contract.fetch("paths").keys.any? { |path| path.include?("send") }
    assert_equal "disabled", @contract.dig("paths", "/v2/outreach/campaigns/{campaign_id}/accounts", "get", "x-elevateo-status")
    assert_equal "disabled", @contract.dig("paths", "/v2/worker/jobs/{job_id}", "get", "x-elevateo-status")
    assert_equal %w[draft held], @contract.dig("components", "schemas", "OutreachSequenceDraft", "properties", "status", "enum")
    refute @contract.fetch("paths").keys.any? { |path| path.include?("enroll") || path.include?("due") }
    assert_equal %w[context_id authorization_version mailbox_id thread_id message],
      @contract.dig("components", "schemas", "DirectMessagePage", "required")
  end

  def test_failure_worker_does_not_inherit_browser_authority
    operation = @contract.dig("paths", "/v2/worker/jobs/{job_id}", "get")
    assert_equal [{"workerPrincipal" => []}], operation.fetch("security")
    refute operation.fetch("security").any? { |scheme| scheme.key?("sessionCookie") }
  end

  def test_source_active_operations_match_the_registry_allowlist
    active = @contract.fetch("paths").values.flat_map(&:values)
      .select { |operation| operation.fetch("x-elevateo-status") == "active" }
      .map { |operation| operation.fetch("operationId") }
    assert_equal V2RouteRegistry::ACTIVE_OPERATIONS.sort, active.sort
  end
end
