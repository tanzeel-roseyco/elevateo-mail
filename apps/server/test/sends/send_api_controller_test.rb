# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v1/send_controller"
require_relative "../../app/controllers/v1/send_approvals_controller"
require_relative "../../app/controllers/v1/send_intents_controller"

class SendAPIControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Approvals < V1::SendApprovalsController
    include CollaborationControllerHarness::Sessions
  end
  class Intents < V1::SendIntentsController
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

  def payload
    { "mailbox_id" => BOX, "operation_id" => THREAD, "expected_version" => 1,
      "review_digest" => "a" * 64, "correspondence_confirmed" => true }
  end

  def dispatch_send(controller = Approvals, action = "create", input: payload, enabled: true, path: "", headers: {})
    configuration = config
    configuration.send_api_enabled = enabled
    configuration.send_control_path = path
    env = Rack::MockRequest.env_for("https://app.test/v1/drafts/#{THREAD}/send-approvals",
      method: "POST", input: JSON.generate(input))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "send-test",
      "action_dispatch.request.path_parameters" => { draft_id: THREAD, send_id: THREAD },
      "be02.sessions" => @service, "be02.config" => configuration)
    env.merge!(headers)
    pool = CollaborationControllerHarness::Pool.new(@connection)
    status, response_headers, rack_body = ActiveRecord::Base.stub(:connection_pool, pool) do
      controller.action(action).call(env)
    end
    serialized = +""
    rack_body.each { |part| serialized << part }
    [status, response_headers, JSON.parse(serialized)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def row(value) = ActiveRecord::Result.new(["result"], [[JSON.generate(value)]])

  def approved
    { "send_id" => THREAD, "draft_id" => THREAD, "approved_version" => 1, "review_digest" => "a" * 64,
      "approved_at" => TIME, "simulated" => true }
  end

  def test_authorized_lost_response_replay_reaches_sql_with_nil_snapshot_and_current_envelope
    @connection.rows = [row("code" => "not_available"), row(approved)]
    result = dispatch_send
    assert_equal 202, result[0]
    assert_equal AuthFixtures::CONTEXT, result[2]["context_id"]
    assert_equal @service.presentation.version(metadata), result[2]["authorization_version"]
    assert_equal THREAD, result[2]["send_id"]
    assert_equal :commit, @connection.events.last
    assert_equal 2, @connection.business.length
    assert @connection.sql.any? { |sql| sql.include?("app.approve_draft_send") }
  end

  def test_disabled_api_and_missing_control_fail_closed_without_approval_mutation
    result = dispatch_send(enabled: false)
    assert_equal 503, result[0]
    assert_equal "temporarily_unavailable", result[2]["code"]
    assert_empty @connection.business
    assert_equal :rollback, @connection.events.last

    @connection = CollaborationControllerHarness::Connection.new(metadata)
    @connection.rows = [row("code" => "not_available"), row("code" => "dispatch_held")]
    result = dispatch_send(path: "/nonexistent-be03-control-r24")
    assert_equal 503, result[0]
    assert_equal "dispatch_held", result[2]["code"]
    assert_empty @connection.business
    assert_equal :rollback, @connection.events.last
  end

  def test_revoked_auth_and_stale_context_never_query_approval
    @client.failure = Elevateo::AuthError.new("unauthenticated", status: 401)
    result = dispatch_send
    assert_equal 401, result[0]
    assert_equal "unauthenticated", result[2]["code"]
    assert_empty @connection.sql
    @client.failure = nil
    result = dispatch_send(headers: { "HTTP_X_SESSION_CONTEXT" => "different-context-token-123" })
    assert_equal 409, result[0]
    assert_equal "context_changed", result[2]["code"]
    assert_empty @connection.business
  end

  def test_invalid_attestation_and_unknown_fields_do_not_reach_approval
    [{ "correspondence_confirmed" => false }, { "snapshot_bytes" => "forged" }].each do |change|
      @connection = CollaborationControllerHarness::Connection.new(metadata)
      result = dispatch_send(input: payload.merge(change))
      assert_equal 400, result[0]
      assert_equal "request_invalid", result[2]["code"]
      assert_empty @connection.business
    end
  end

  def test_semantic_conflict_commits_ledger_outcome_but_invalid_sql_response_rolls_back
    @connection.rows = [row("code" => "not_available"), row("code" => "operation_mismatch")]
    result = dispatch_send
    assert_equal 409, result[0]
    assert_equal :commit, @connection.events.last
    @connection = CollaborationControllerHarness::Connection.new(metadata)
    @connection.rows = [row("code" => "not_available"), row(approved.merge("snapshot_bytes" => "secret"))]
    result = dispatch_send
    assert_equal 500, result[0]
    assert_equal "internal_error", result[2]["code"]
    assert_equal :rollback, @connection.events.last
    assert_empty @connection.business
    refute result[2].key?("snapshot_bytes")
  end

  def test_cancellation_is_guarded_and_unimplemented_without_false_success
    result = dispatch_send(Intents, "cancel", input: { "mailbox_id" => BOX })
    assert_equal 503, result[0]
    assert_equal "temporarily_unavailable", result[2]["code"]
    assert_empty @connection.business
    assert_equal :rollback, @connection.events.last
  end
end
