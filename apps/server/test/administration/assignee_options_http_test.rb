# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/mailbox_assignee_options_controller"

class AssigneeOptionsHttpTest < Minitest::Test
  include AuthFixtures

  MAILBOX = "33333333-3333-4333-8333-333333333333"
  OTHER_MAILBOX = "44444444-4444-4444-8444-444444444444"
  FIRST = "55555555-5555-4555-8555-555555555555"
  SECOND = "66666666-6666-4666-8666-666666666666"
  KEY = "disposable-assignee-option-signing-key-001"

  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :page_result
    attr_reader :page_arguments

    def exec_query(sql, label, binds)
      return super unless sql.include?("app.assignment_member_options")

      @page_arguments = binds.map(&:value_for_database)
      ActiveRecord::Result.new(["result"], [[@page_result]])
    end
  end

  class Pool < WriteBoundaryHarness::Pool
    def with_connection = yield(@connection)
  end

  class Controller < V2::Admin::MailboxAssigneeOptionsController
    protected

    def read_sessions = request.get_header("dir904.sessions")
    def read_config = request.get_header("dir904.config")
  end

  def setup
    @service, _store, _client, @cookie = harness
    @connection = Connection.new(metadata)
    @connection.page_result = { "status" => "ok", "items" => [{ "user_id" => FIRST }], "next_user_id" => FIRST }
  end

  def test_happy_page_and_empty_continuation_are_uuid_only
    status, headers, first = dispatch(query: "limit=1")
    assert_equal 200, status
    assert_equal "no-store", headers.fetch("cache-control")
    assert_equal MAILBOX, first.fetch("mailbox_id")
    assert_equal [{ "user_id" => FIRST }], first.fetch("items")
    refute_includes JSON.generate(first), "email"
    assert_equal [@service.crypto.digest(@cookie), USER, SID, CONTEXT, "1", ORG, MAILBOX, nil, "1"],
      @connection.page_arguments
    @connection.page_result = { "status" => "ok", "items" => [{ "user_id" => SECOND }], "next_user_id" => nil }
    status, _headers, second = dispatch(query: "limit=1&cursor=#{first.fetch('next_cursor')}")
    assert_equal 200, status
    assert_equal [{ "user_id" => SECOND }], second.fetch("items")
    assert_nil second.fetch("next_cursor")
    assert_equal FIRST, @connection.page_arguments[7]
    # A previously listed target may lose mailbox eligibility before the continuation read.
    @connection.page_result = { "status" => "ok", "items" => [], "next_user_id" => nil }
    status, _headers, empty = dispatch(query: "limit=1&cursor=#{first.fetch('next_cursor')}")
    assert_equal 200, status
    assert_equal [], empty.fetch("items")
  end

  def test_tampered_expired_and_cross_mailbox_cursor_are_denied
    valid = cursor
    ["#{valid}x", expired_cursor, wrong_context_cursor, wrong_generation_cursor].each do |token|
      status, _headers, body = dispatch(query: "limit=1&cursor=#{token}")
      assert_equal 400, status
      assert_equal "cursor_invalid", body.fetch("code")
    end
    status, _headers, body = dispatch(mailbox: OTHER_MAILBOX, query: "limit=1&cursor=#{valid}")
    assert_equal 400, status
    assert_equal "cursor_invalid", body.fetch("code")
  end

  def test_revoked_actor_and_target_and_oversized_limit_fail_closed
    @connection.page_result = { "status" => "not_found" }
    status, _headers, body = dispatch
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    status, _headers, body = dispatch(mailbox: OTHER_MAILBOX)
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    @connection.page_result = { "status" => "context_changed" }
    status, _headers, body = dispatch
    assert_equal 409, status
    assert_equal "context_changed", body.fetch("code")
    @connection.page_result = { "status" => "ok", "items" => [], "next_user_id" => nil }
    status, _headers, body = dispatch(query: "limit=51")
    assert_equal 400, status
    assert_equal "request_invalid", body.fetch("code")
    @connection.page_result = { "status" => "ok", "items" => [{ "user_id" => FIRST,
      "email" => "leak@example.test" }], "next_user_id" => nil }
    status, _headers, body = dispatch
    assert_equal 500, status
    assert_equal "internal_error", body.fetch("code")
  end

  private

  def scope(mailbox = MAILBOX)
    { "actor_id" => USER, "organization_id" => ORG, "context_id" => CONTEXT,
      "authorization_version" => @service.presentation.version(metadata),
      "resource" => "mailbox_assignee_options", "filters" => { "mailbox_id" => mailbox },
      "order" => "user_id:asc", "limit" => 1 }
  end

  def cursor = Elevateo::Cursors.new(secret: KEY).encode(position: { "user_id" => FIRST }, scope: scope)
  def wrong_context_cursor
    Elevateo::Cursors.new(secret: KEY).encode(position: { "user_id" => FIRST },
      scope: scope.merge("context_id" => "other-context-token-123"))
  end
  def wrong_generation_cursor
    Elevateo::Cursors.new(secret: KEY).encode(position: { "user_id" => FIRST },
      scope: scope.merge("authorization_version" => "other-generation-token-123"))
  end
  def expired_cursor
    Elevateo::Cursors.new(secret: KEY, clock: -> { Time.now.to_i - 301 })
      .encode(position: { "user_id" => FIRST }, scope: scope)
  end

  def dispatch(mailbox: MAILBOX, query: "")
    env = Rack::MockRequest.env_for("https://app.test/v2/mailboxes/#{mailbox}/assignee-options", method: "GET")
    configuration = config
    configuration.cursor_signing_key = KEY
    env.merge!("QUERY_STRING" => query, "HTTP_COOKIE" => "elevateo_session=#{@cookie}",
      "HTTP_X_SESSION_CONTEXT" => CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "action_dispatch.request_id" => "dir904-http",
      "action_dispatch.request.path_parameters" => { mailbox_id: mailbox },
      "dir904.sessions" => @service, "dir904.config" => configuration)
    status, headers, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      Controller.action("index").call(env)
    end
    response = +""
    rack_body.each { |part| response << part }
    [status, headers.transform_keys(&:downcase), JSON.parse(response)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end
end
