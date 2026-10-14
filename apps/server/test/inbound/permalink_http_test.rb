# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v1/threads_controller"

class InboundPermalinkHTTPTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Controller < V1::ThreadsController
    include CollaborationControllerHarness::Sessions
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
  end

  def dispatch(thread: THREAD, message: NOTE, mailbox: BOX, rows: [])
    @connection.rows = rows
    env = Rack::MockRequest.env_for("https://app.test/v2/threads/#{thread}/messages/#{message}", method: "GET")
    configuration = config
    configuration.cursor_signing_key = "disposable-permalink-key-00001"
    env.merge!("QUERY_STRING" => "mailbox_id=#{mailbox}", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "action_dispatch.request_id" => "permalink-test",
      "action_dispatch.request.path_parameters" => { thread_id: thread, message_id: message },
      "be02.sessions" => @service, "be02.config" => configuration)
    status, _, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      Controller.action("message").call(env)
    end
    wire = +""
    rack_body.each { |part| wire << part }
    [status, JSON.parse(wire)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def test_plaintext_message_resolves_by_exact_path
    row = { "id" => NOTE, "sender" => nil, "recipients" => "[]", "body_text" => "<b>plain</b>",
      "attachment_count" => 0, "sent_at" => nil }
    status, body = dispatch(rows: [[row]])
    assert_equal 200, status
    assert_equal NOTE, body.fetch("message").fetch("id")
    assert_equal "<b>plain</b>", body.fetch("message").fetch("body_text")
    assert_equal 1, (@connection.sql.count { |sql| sql.include?("FROM app.mailboxes AS mailbox") })
  end

  def test_missing_and_denied_have_same_http_result
    missing = dispatch(rows: [[]])
    denied = dispatch(mailbox: TARGET, rows: [[]])
    assert_equal [404, "not_available"], [missing.first, missing.last.fetch("code")]
    assert_equal [missing.first, missing.last.fetch("code")], [denied.first, denied.last.fetch("code")]
  end

  def test_malformed_path_never_queries_message
    status, body = dispatch(message: "bad")
    assert_equal [400, "request_invalid"], [status, body.fetch("code")]
    refute(@connection.sql.any? { |sql| sql.include?("FROM app.mailboxes AS mailbox") })
  end
end
