# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../lib/elevateo/draft_operations"
require_relative "../../app/controllers/v1/drafts_controller"
require_relative "../../app/controllers/v1/draft_operations_controller"

class DraftsRequestTest < Minitest::Test
  include AuthFixtures
  ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  BOX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  class Controller < V1::DraftsController
    protected
    def read_sessions = request.get_header("be02.sessions")
    def read_config = request.get_header("be02.config")
  end

  class OperationsController < V1::DraftOperationsController
    protected
    def read_sessions = request.get_header("be02.sessions")
    def read_config = request.get_header("be02.config")
  end

  class Pool < WriteBoundaryHarness::Pool
    def with_connection = yield(connection)
  end

  # AIDEV-NOTE: The real controller/serializer runs here; actual SQL ownership, atomicity and races have PG tests.
  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :outcome, :scope, :drafts, :lookup
    def initialize(metadata)
      super
      @scope, @drafts = true, []
      @outcome = { "draft_id" => ID, "operation_id" => ID, "version" => 1, "state" => "editable" }
      @lookup = { "operation_id" => ID, "mailbox_id" => BOX, "draft_id" => ID, "outcome" => "unknown" }
    end

    def exec_query(query, label, binds)
      if query.include?("app.save_draft")
        @sql << query
        @events << :save
        @business << :operation unless @outcome["code"] == "not_available"
        [{ "result" => JSON.generate(@outcome) }]
      elsif query.include?("app.draft_operation")
        [{ "result" => JSON.generate(@lookup) }]
      elsif query.include?("app.draft_scope")
        [{ "allowed" => @scope }]
      elsif query.include?("FROM app.drafts")
        @drafts
      else
        super
      end
    end
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @config = config
    @config.cursor_signing_key = "disposable-cursor-key-000000000001"
  end

  def input
    { "mailbox_id" => BOX, "operation_id" => ID, "expected_version" => 0,
      "subject" => "", "to" => [], "body_text" => "", "reply_to_thread_id" => nil }
  end

  def dispatch(action: "update", controller: Controller, body: JSON.generate(input), query: "", headers: {})
    env = Rack::MockRequest.env_for("https://app.test/v1/drafts/#{ID}", method: action == "update" ? "PUT" : "GET", input: body)
    env.merge!("QUERY_STRING" => query, "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata), "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"),
      "action_dispatch.request_id" => "draft-current-request", "action_dispatch.request.path_parameters" => { "draft_id" => ID, "operation_id" => ID },
      "be02.sessions" => @service, "be02.config" => @config)
    env.merge!(headers)
    status, response_headers, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      controller.action(action).call(env)
    end
    wire = +""
    rack_body.each { |part| wire << part }
    [status, response_headers.transform_keys(&:downcase), JSON.parse(wire)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def test_save_success_and_durable_conflict_both_commit_serialized_outcomes
    response = dispatch
    assert_equal [200, @connection.outcome], [response[0], response[2]]
    assert_equal %i[begin guard save commit], @connection.events
    assert_equal "no-store", response[1].fetch("cache-control")
    @connection = Connection.new(metadata)
    @connection.outcome = { "code" => "draft_conflict" }
    response = dispatch
    assert_equal 409, response[0]
    assert_equal({ "code" => "draft_conflict", "message" => "Draft has changed", "request_id" => "draft-current-request" }, response[2])
    assert_equal %i[begin guard save commit], @connection.events
    assert_equal [:operation], @connection.business
  end

  def test_hidden_scope_has_canonical_404_and_does_not_record_an_operation
    @connection.outcome = { "code" => "not_available" }
    response = dispatch
    assert_equal 404, response[0]
    assert_equal "This item is unavailable.", response[2].fetch("message")
    assert_empty @connection.business
  end

  def test_malformed_and_oversized_received_json_fail_before_auth_or_transaction
    [JSON.generate(input).sub('"subject":""', '"subject":"","subject":"again"'), " " * 1_048_577].each do |body|
      response = dispatch(body: body, headers: { "CONTENT_LENGTH" => "1" })
      assert_equal 400, response[0]
      assert_equal "request_invalid", response[2].fetch("code")
      assert_empty @client.calls
      assert_empty @connection.events
    end
  end

  def test_maximum_plaintext_and_nullable_addresses_reach_the_real_serializer
    body = input.merge("subject" => "\u{1F48C}" * 998, "body_text" => "\u0001" * 65_536,
      "to" => [{ "display_name" => "\u0001" * 256, "address" => "\u{1F48C}" * 256 }] * 100)
    assert_operator JSON.generate(body).bytesize, :<=, 1_048_576
    assert_equal 200, dispatch(body: JSON.generate(body))[0]
    assert_equal 400, dispatch(body: JSON.generate(input.merge("subject" => "a" * 999)))[0]
  end

  def test_invalid_save_result_rolls_back_before_any_response_is_committed
    @connection.outcome["version"] = 0
    response = dispatch
    assert_equal 500, response[0]
    assert_equal :rollback, @connection.events.last
    assert_empty @connection.business
  end

  def test_three_get_actions_use_closed_shapes_and_current_scope
    response = dispatch(action: "index", body: "", query: "mailbox_id=#{BOX}")
    assert_equal 200, response[0]
    assert_equal %w[authorization_version context_id items mailbox_id next_cursor], response[2].keys.sort
    assert_equal [], response[2].fetch("items")
    response = dispatch(action: "show", body: "", query: "mailbox_id=#{BOX}")
    assert_equal 404, response[0]
    response = dispatch(action: "show", controller: OperationsController, body: "", query: "mailbox_id=#{BOX}&draft_id=#{ID}")
    assert_equal 200, response[0]
    assert_equal "unknown", response[2].fetch("operation").fetch("outcome")
  end
end
