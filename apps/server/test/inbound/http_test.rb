# frozen_string_literal: true

require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/fake_inbound_controller"

class FakeInboundHTTPTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  MIME = "From: sender@example.invalid\r\nTo: inbox@example.invalid\r\nSubject: hello\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nhello".freeze

  class Controller < V2::FakeInboundController
    include CollaborationControllerHarness::Sessions
  end

  class Connection < CollaborationControllerHarness::Connection
    attr_accessor :allowed, :outcome

    def initialize(metadata)
      super
      @allowed = true
      @outcome = "created"
    end

    def exec_query(query, label, binds)
      return [{ "id" => CollaborationControllerHarness::BOX }] if query.include?("FROM app.mailboxes") && allowed
      return [] if query.include?("FROM app.mailboxes")
      if query.include?("app.ingest_fake_mail")
        @business << :ingest
        return [{ "result" => JSON.generate("result" => outcome,
          "thread_id" => CollaborationControllerHarness::THREAD,
          "message_id" => CollaborationControllerHarness::NOTE) }]
      end
      super
    end
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @old_rails_env = ENV["RAILS_ENV"]
    @old_enable = ENV["ELEVATEO_FAKE_INBOUND_ENABLED"]
    ENV["RAILS_ENV"] = "test"
    ENV["ELEVATEO_FAKE_INBOUND_ENABLED"] = "1"
  end

  def teardown
    ENV["RAILS_ENV"] = @old_rails_env
    ENV["ELEVATEO_FAKE_INBOUND_ENABLED"] = @old_enable
  end

  def payload
    { "actor_id" => AuthFixtures::USER, "mailbox_id" => BOX,
      "provider_account_id" => "account-a", "provider_event_id" => "event-1", "raw_mime" => MIME }
  end

  def dispatch(input = payload)
    env = Rack::MockRequest.env_for("https://app.test/v2/test/inbound/fake", method: "POST", input: JSON.generate(input))
    configuration = config
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "inbound-test",
      "be02.sessions" => @service, "be02.config" => configuration)
    status, _, body = ActiveRecord::Base.stub(:connection_pool, CollaborationControllerHarness::Pool.new(@connection)) do
      Controller.action("create").call(env)
    end
    data = +""
    body.each { |part| data << part }
    [status, JSON.parse(data)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def test_happy_and_replay_result_are_simulated
    status, result = dispatch
    assert_equal 201, status
    assert_equal "created", result.fetch("result")
    assert_equal true, result.fetch("simulated")
    @connection.outcome = "duplicate"
    assert_equal [200, "duplicate"], (dispatch.then { |code, data| [code, data.fetch("result")] })
  end

  def test_cross_tenant_or_actor_is_hidden
    @connection.allowed = false
    assert_equal [404, "not_available"], (dispatch.then { |code, data| [code, data.fetch("code")] })
    @connection.allowed = true
    assert_includes [401, 404, 409], dispatch(payload.merge("actor_id" => THREAD)).first
    refute_includes @connection.business, :ingest
  end

  def test_malformed_html_and_disabled_route_never_ingest
    assert_equal 400, dispatch(payload.merge("raw_mime" => MIME.sub("text/plain", "text/html"))).first
    refute_includes @connection.business, :ingest
    ENV["ELEVATEO_FAKE_INBOUND_ENABLED"] = "0"
    assert_equal 404, dispatch.first
    refute_includes @connection.business, :ingest
  end
end
