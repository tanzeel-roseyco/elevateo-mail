# frozen_string_literal: true

require_relative "collaboration_controller_helper"
require_relative "../../app/controllers/v1/threads_controller"

# AIDEV-NOTE: Controller tests prove HTTP errors/envelopes; thread_database_test proves real tenant/mailbox RLS.
class OrganizationThreadsHTTPTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Controller < V1::ThreadsController
    include CollaborationControllerHarness::Sessions

    rescue_from StandardError do |error|
      raise error
    end
    rescue_from Elevateo::AuthError, with: :api_error
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
  end

  def dispatch(query: "", rows: [], cookie: @cookie)
    @connection.rows = rows
    configuration = config
    configuration.cursor_signing_key = "disposable-org-list-key-000000001"
    env = Rack::MockRequest.env_for("https://app.test/v1/threads", method: "GET", input: "")
    env.merge!("QUERY_STRING" => query, "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "action_dispatch.request_id" => "organization-threads-test",
      "be02.sessions" => @service, "be02.config" => configuration)
    status, _, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      Controller.action("organization_index").call(env)
    end
    wire = +""
    rack_body.each { |part| wire << part }
    [status, JSON.parse(wire)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def summary
    { "id" => THREAD, "mailbox_id" => BOX, "subject" => "Example", "unread" => true,
      "sender" => nil, "preview_text" => "Plain text", "last_message_at" => nil, "message_count" => 0,
      "folder" => "inbox", "snoozed_until" => nil, "starred" => false }
  end

  def test_authorized_get_has_existing_summary_contract_and_one_query
    status, body = dispatch(rows: [[summary]])
    assert_equal 200, status
    assert_equal %w[authorization_version context_id items next_cursor], body.keys.sort
    assert_equal THREAD, body.fetch("items").first.fetch("id")
    assert_equal BOX, body.fetch("items").first.fetch("mailbox_id")
    assert_nil body.fetch("next_cursor")
    assert_equal 1, (@connection.sql.count { |sql| sql.include?("CROSS JOIN LATERAL") })
  end

  def test_invalid_query_and_cursor_mismatch_are_deliberate_http_errors
    status, body = dispatch(query: "limit=51")
    assert_equal [400, "request_invalid"], [status, body.fetch("code")]
    status, first = dispatch(query: "limit=1", rows: [[summary, summary]])
    assert_equal 200, status
    status, body = dispatch(query: "limit=1&filter=unread&cursor=#{first.fetch('next_cursor')}")
    assert_equal [400, "cursor_invalid"], [status, body.fetch("code")]
  end

  def test_unauthenticated_get_never_queries_threads
    status, = dispatch(cookie: "invalid")
    assert_equal 401, status
    refute(@connection.sql.any? { |sql| sql.include?("CROSS JOIN LATERAL") })
  end
end
