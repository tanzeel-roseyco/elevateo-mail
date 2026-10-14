# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/outreach/campaigns_controller"

class CampaignControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Campaigns < V2::Outreach::CampaignsController
    include CollaborationControllerHarness::Sessions
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def dispatch(input)
    env = Rack::MockRequest.env_for("https://app.test/v2/outreach/campaigns",
      method: "POST", input: JSON.generate(input))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "campaign-test",
      "action_dispatch.request.path_parameters" => {}, "be02.sessions" => @service, "be02.config" => config)
    pool = CollaborationControllerHarness::Pool.new(@connection)
    status, headers, body = ActiveRecord::Base.stub(:connection_pool, pool) { Campaigns.action("create").call(env) }
    serialized = +""
    body.each { |part| serialized << part }
    [status, headers, JSON.parse(serialized)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def input
    { "id" => THREAD, "operation_id" => NOTE, "name" => "Pilot", "status" => "draft" }
  end

  def test_create_persists_inert_draft_under_guarded_session
    @connection.rows = [[{ "result" => { "status" => "ok" } }], [{ "id" => THREAD }],
      [{ "id" => THREAD, "name" => "Pilot", "status" => "draft", "version" => 1 }]]
    result = dispatch(input)
    assert_equal 201, result[0]
    assert_equal "draft", result[2].fetch("status")
    assert_equal 1, result[2].fetch("version")
    assert_operator(@connection.sql.index { |sql| sql.include?("authorize_outreach_draft_write") }, :<,
      @connection.sql.index { |sql| sql.include?("INSERT INTO app.campaigns") })
    refute(@connection.sql.any? { |sql| sql.match?(/send_intents|provider|smtp/i) })
  end

  def test_current_role_denial_precedes_campaign_insert
    @connection.rows = [[{ "result" => { "status" => "not_found" } }]]
    result = dispatch(input)
    assert_equal [404, "not_available"], [result[0], result[2].fetch("code")]
    refute(@connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaigns") })
  end

  def test_extra_field_rejected_before_authenticated_write
    result = dispatch(input.merge("provider_key" => "forbidden"))
    assert_equal [400, "request_invalid"], [result[0], result[2].fetch("code")]
    assert_empty @connection.sql
  end

  def test_active_state_rejected_with_no_campaign_insert
    result = dispatch(input.merge("status" => "active"))
    assert_equal [400, "request_invalid"], [result[0], result[2].fetch("code")]
    refute(@connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaigns") })
  end
end
