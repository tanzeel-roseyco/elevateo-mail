# frozen_string_literal: true

require "rails"
require "logger"
require_relative "send_api_controller_test"
require_relative "../../app/controllers/v1/send_reviews_controller"

class SendAPIReadsTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Reviews < V1::SendReviewsController
    include CollaborationControllerHarness::Sessions
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
    @logger = Logger.new(StringIO.new)
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def row(value) = ActiveRecord::Result.new(["result"], [[JSON.generate(value)]])

  def binding
    { "organization_id" => AuthFixtures::ORG, "mailbox_id" => BOX, "draft_id" => THREAD, "actor_id" => AuthFixtures::USER,
      "version" => 1, "state" => "editable", "subject" => "Hello", "body_text" => "literal <script> text",
      "recipients" => [{ "display_name" => nil, "address" => "Local@EXAMPLE.invalid" }],
      "reply_to_thread_id" => nil, "sender_address" => "Sender@EXAMPLE.invalid", "reply_available" => true,
      "policy_revision" => "1", "mailbox_enabled" => true, "suppressed_addresses" => [], "consented_addresses" => [] }
  end

  def status
    { "send_id" => THREAD, "mailbox_id" => BOX, "draft_id" => THREAD, "approved_version" => 1,
      "approved_at" => TIME, "state" => "queued", "attempts" => 0, "first_possible_at" => nil,
      "retry_deadline_at" => nil, "cancel_requested" => false, "cancellable" => false,
      "hold_reason" => nil, "updated_at" => TIME, "delivery_state" => nil,
      "suppression_reason" => nil, "simulated" => true }
  end

  def dispatch_read(controller, query: "mailbox_id=#{BOX}", headers: {})
    configuration = config
    configuration.send_api_enabled = true
    configuration.send_control_path = ""
    env = Rack::MockRequest.env_for("https://app.test/v1/send-review", method: "GET", input: "")
    env.merge!("QUERY_STRING" => query, "HTTP_COOKIE" => "elevateo_session=#{@cookie}",
      "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "action_dispatch.request_id" => "send-read-test",
      "action_dispatch.request.path_parameters" => { draft_id: THREAD, send_id: THREAD },
      "be02.sessions" => @service, "be02.config" => configuration)
    env.merge!(headers)
    pool = CollaborationControllerHarness::Pool.new(@connection)
    code, response_headers, body = Rails.stub(:logger, @logger) do
      ActiveRecord::Base.stub(:connection_pool, pool) do
        controller.action("show").call(env)
      end
    end
    serialized = +""
    body.each { |part| serialized << part }
    [code, response_headers, JSON.parse(serialized)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def test_review_returns_full_consistent_ready_draft_with_fresh_context
    @connection.rows = [row(binding)]
    result = dispatch_read(Reviews)
    assert_equal 200, result[0]
    assert_equal "literal <script> text", result[2]["body_text"]
    assert_equal true, result[2]["ready"]
    assert_equal Elevateo::SendAPI::Review.new(binding).result["review_digest"], result[2]["review_digest"]
    assert_equal AuthFixtures::CONTEXT, result[2]["context_id"]
    assert_equal "no-store", result[1]["cache-control"]
  end

  def test_queued_status_excludes_content_and_does_not_claim_dispatch_or_delivery
    @connection.rows = [row(status)]
    result = dispatch_read(SendAPIControllerTest::Intents)
    assert_equal 200, result[0]
    assert_equal "queued", result[2]["state"]
    assert_equal false, result[2]["cancellable"]
    assert_equal true, result[2]["simulated"]
    refute result[2].key?("body_text")
    refute result[2].key?("snapshot_bytes")
  end

  def test_foreign_scope_is_generic_and_invalid_status_projection_is_internal
    @connection.rows = [row("code" => "not_available")]
    result = dispatch_read(Reviews)
    assert_equal 404, result[0]
    assert_equal "This item is unavailable.", result[2]["message"]
    @connection = CollaborationControllerHarness::Connection.new(metadata)
    @connection.rows = [row(status.merge("snapshot_bytes" => "forbidden"))]
    result = dispatch_read(SendAPIControllerTest::Intents)
    assert_equal 500, result[0]
    assert_equal "internal_error", result[2]["code"]
    refute result[2].key?("snapshot_bytes")
  end

  def test_duplicate_query_and_stale_proof_do_not_reach_business_sql
    result = dispatch_read(Reviews, query: "mailbox_id=#{BOX}&mailbox_id=#{BOX}")
    assert_equal 400, result[0]
    assert_empty @client.calls
    assert_empty @connection.sql
    result = dispatch_read(Reviews, headers: { "HTTP_X_SESSION_CONTEXT" => "different-context-token-123" })
    assert_equal 409, result[0]
    assert_equal "context_changed", result[2]["code"]
    assert_empty @connection.business
  end
end
