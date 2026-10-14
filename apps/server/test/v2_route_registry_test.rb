# frozen_string_literal: true

require "minitest/autorun"
require_relative "../config/v2_route_registry"

class V2RouteRegistryTest < Minitest::Test
  class Mapper
    attr_reader :routes
    def initialize = (@routes = [])
    %i[get put post].each do |verb|
      define_method(verb) { |path, to:| @routes << [verb, path, to] }
    end
  end

  def test_ready_registry_exposes_only_fourteen_active_versioned_routes
    mapper = Mapper.new
    assert V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: true)
    assert_equal 14, mapper.routes.size
    assert mapper.routes.all? { |_, path, _| path.start_with?("/v2/") }
    refute mapper.routes.any? { |_, path, _| path.start_with?("/v2/worker/") }
  end

  def test_manual_consent_route_uses_guarded_lead_controller
    mapper = Mapper.new
    assert V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: true,
      operations: ["recordOutreachLeadConsent"])
    assert_equal [[:post, "/v2/outreach/campaigns/:campaign_id/leads/:lead_id/consent",
      "v2/outreach/leads#record_consent"]], mapper.routes
  end

  def test_selected_operation_exposes_only_implemented_route
    mapper = Mapper.new
    assert V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: true, operations: ["listOutreachCampaigns"])
    assert_equal [[:get, "/v2/outreach/campaigns", "v2/outreach/campaigns#index"]], mapper.routes
  end

  def test_direct_message_keeps_v1_controller_behind_v2_path
    mapper = Mapper.new
    assert V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: true, operations: ["getDirectMessage"])
    assert_equal [[:get, "/v2/threads/:thread_id/messages/:message_id", "v1/threads#message"]], mapper.routes
  end

  def test_disabled_registry_exposes_nothing
    mapper = Mapper.new
    refute V2RouteRegistry.register!(mapper, enabled: false, controllers_ready: false)
    assert_empty mapper.routes
  end

  def test_unready_registry_fails_before_any_route_is_added
    mapper = Mapper.new
    assert_raises(ArgumentError) { V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: false) }
    assert_empty mapper.routes
  end

  def test_string_flags_cannot_activate_routes
    mapper = Mapper.new
    assert_raises(ArgumentError) { V2RouteRegistry.register!(mapper, enabled: "false", controllers_ready: true) }
    assert_raises(ArgumentError) { V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: "true") }
    assert_empty mapper.routes
  end

  def test_worker_proposal_cannot_be_registered_explicitly
    mapper = Mapper.new
    assert_raises(ArgumentError) do
      V2RouteRegistry.register!(mapper, enabled: true, controllers_ready: true, operations: ["getWorkerJob"])
    end
    assert_empty mapper.routes
  end
end
