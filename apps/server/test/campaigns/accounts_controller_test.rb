# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/outreach/accounts_controller"

class OutreachAccountsControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Accounts < V2::Outreach::AccountsController
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

  def dispatch(action, campaign_id: THREAD, account_id: NOTE)
    path = "https://app.test/v2/outreach/campaigns/#{campaign_id}/accounts"
    path += "/#{account_id}" if action == "show"
    env = Rack::MockRequest.env_for(path, method: "GET")
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "action_dispatch.request_id" => "account-test",
      "action_dispatch.request.path_parameters" => { campaign_id: campaign_id, account_id: account_id },
      "be02.sessions" => @service, "be02.config" => config)
    pool = CollaborationControllerHarness::Pool.new(@connection)
    status, _headers, body = ActiveRecord::Base.stub(:connection_pool, pool) { Accounts.action(action).call(env) }
    serialized = +""
    body.each { |part| serialized << part }
    [status, JSON.parse(serialized)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def account_row(campaign_id = THREAD)
    { "id" => NOTE, "campaign_id" => campaign_id, "mailbox_id" => TARGET,
      "label" => "Shared pilot", "status" => "disabled", "version" => 1 }
  end

  def test_list_is_filtered_by_campaign_and_returns_disabled_account
    @connection.rows = [[{ "result" => { "status" => "ok" } }],
      [{ "id" => THREAD, "name" => "Pilot", "status" => "draft", "version" => 1 }], [account_row]]
    status, response = dispatch("index")
    assert_equal 200, status
    assert_equal "disabled", response.fetch("items").first.fetch("status")
    sql = @connection.sql.find { |statement| statement.include?("FROM app.campaign_accounts WHERE") }
    assert_includes sql, "campaign_id=$2::uuid"
  end

  def test_detail_denies_account_from_another_campaign
    @connection.rows = [[{ "result" => { "status" => "ok" } }], [account_row(TARGET)]]
    status, response = dispatch("show")
    assert_equal [404, "not_available"], [status, response.fetch("code")]
  end
end
