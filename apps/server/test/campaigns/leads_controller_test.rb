# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/outreach/leads_controller"

class OutreachLeadsControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Leads < V2::Outreach::LeadsController
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

  def dispatch(action, input)
    path = "https://app.test/v2/outreach/campaigns/#{THREAD}/leads"
    path += "/#{NOTE}/consent" if action == "record_consent"
    env = Rack::MockRequest.env_for(path, method: "POST", input: JSON.generate(input))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "lead-test",
      "action_dispatch.request.path_parameters" => { campaign_id: THREAD, lead_id: NOTE },
      "be02.sessions" => @service, "be02.config" => config)
    pool = CollaborationControllerHarness::Pool.new(@connection)
    status, headers, body = ActiveRecord::Base.stub(:connection_pool, pool) { Leads.action(action).call(env) }
    serialized = +""
    body.each { |part| serialized << part }
    [status, headers, JSON.parse(serialized)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def campaign_row
    { "id" => THREAD, "name" => "Pilot", "status" => "draft", "version" => 1 }
  end

  def lead_row
    { "id" => NOTE, "campaign_id" => THREAD, "email" => "a@example.invalid", "consent_status" => "unknown",
      "consent_recorded_at" => nil, "consent_source" => nil, "consent_recorded_by" => nil,
      "suppressed_at" => nil, "globally_suppressed" => false, "version" => 1 }
  end

  def test_new_lead_persists_unknown_without_consent_assertion
    @connection.rows = [[campaign_row], [{ "id" => NOTE }], [lead_row]]
    result = dispatch("create", { "id" => NOTE, "operation_id" => TARGET, "email" => "A@Example.invalid" })
    assert_equal 201, result[0]
    assert_equal ["a@example.invalid", "unknown", false],
      result[2].values_at("email", "consent_status", "suppressed")
    insert = @connection.sql.find { |sql| sql.include?("INSERT INTO app.campaign_leads") }
    assert_includes insert, "consent_source"
    refute(@connection.sql.any? { |sql| sql.include?("send_intents") })
  end

  def test_cannot_assert_consent_in_create_body
    result = dispatch("create", { "id" => NOTE, "operation_id" => TARGET,
      "email" => "a@example.invalid", "consent_status" => "granted" })
    assert_equal [400, "request_invalid"], [result[0], result[2].fetch("code")]
    assert_empty @connection.sql
  end

  def test_sourced_consent_records_actor_and_returns_granted_status
    granted = lead_row.merge("consent_status" => "granted", "consent_recorded_at" => Time.utc(2026, 10, 14, 10),
      "consent_source" => "confirmed opt-in", "consent_recorded_by" => AuthFixtures::USER, "version" => 2)
    @connection.rows = [[lead_row], [], [], [granted], [], [granted], []]
    result = dispatch("record_consent", { "operation_id" => TARGET, "expected_version" => 1,
      "source" => "confirmed opt-in", "observed_at" => "2026-10-14T10:00:00Z", "attested" => true })
    assert_equal 200, result[0]
    assert_equal "granted", result[2].fetch("consent_status")
    update = @connection.sql.find { |sql| sql.include?("UPDATE app.campaign_leads") }
    assert_includes update, "consent_recorded_by=$10::uuid"
    assert(@connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaign_consent_events") })
    assert(@connection.sql.any? { |sql| sql.include?("INSERT INTO app.campaign_mutations") })
  end

  def test_consent_attestation_requires_explicit_true_before_sql
    result = dispatch("record_consent", { "operation_id" => TARGET, "expected_version" => 1,
      "source" => "confirmed opt-in", "observed_at" => "2026-10-14T10:00:00Z", "attested" => false })
    assert_equal [400, "request_invalid"], [result[0], result[2].fetch("code")]
    refute(@connection.sql.any? { |sql| sql.include?("UPDATE app.campaign_leads") })
  end
end
