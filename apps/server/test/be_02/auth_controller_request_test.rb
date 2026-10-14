# frozen_string_literal: true

require "rails"
require "active_record"
require "action_controller"
require "action_controller/api"
require "rack/mock"
require "minitest/mock"
require "logger"
require_relative "auth_test_helper"
require_relative "../../app/controllers/application_controller"
require_relative "../../app/controllers/v1/api_controller"
require_relative "../../app/controllers/v1/auth_controller"

class AuthControllerRequestTest < Minitest::Test
  include AuthFixtures

  def setup
    @service, @store, @client = harness
    @logs = StringIO.new
    @logger = Logger.new(@logs)
    @issued = Elevateo::SessionChallenges.new(config: config, crypto: @service.crypto)
      .issue(session_cookie: nil, pending_cookie: nil)
  end

  def test_challenge_renders_with_framework_config_and_bound_cookie
    @client.define_singleton_method(:user) { |*| raise "challenge must not contact Auth" }
    status, headers, body = dispatch("challenge")
    assert_equal 200, status
    assert_equal %w[csrf_token expires_at], body.keys.sort
    assert_equal 43, body.fetch("csrf_token").bytesize
    assert_equal "no-store", headers.fetch("cache-control")
    assert_equal "Cookie", headers.fetch("vary")
    assert_includes headers.fetch("set-cookie").to_s, "elevateo_challenge="
    assert_empty @store.calls
    assert_equal V1::AuthController.config, V1::AuthController.new.config
    assert_empty @logs.string
  end

  def test_login_happy_path_publishes_session_after_real_controller_render
    status, headers, body = dispatch("login")
    assert_equal 200, status
    assert_includes headers.fetch("set-cookie").to_s, "elevateo_session="
    refute body.key?("access_token")
    assert(@store.calls.any? { |name, _| name == "create_session" })
    assert_empty @logs.string
  end

  def test_upstream_rejection_unavailable_and_malformed_response_remain_deliberate
    [[401, "application/json", '{"private":"sensitive-upstream"}', 401, "unauthenticated"],
     [503, "application/json", '{"private":"sensitive-upstream"}', 503, "temporarily_unavailable"],
     [200, "application/json", "sensitive-upstream", 503, "temporarily_unavailable"]].each do |upstream, type, wire, status, code|
      @store.calls.clear
      @logs.truncate(0)
      @logs.rewind
      calls = []
      client = Elevateo::AuthClient.new(config: config, transaction_open: -> { false },
        transport: ->(*args) { calls << args; [upstream, type, wire] })
      @service = Elevateo::Sessions.new(config: config, store: @store, client: client)
      actual, headers, body = dispatch("login")
      assert_equal status, actual
      assert_equal code, body.fetch("code")
      assert_equal %w[code message request_id], body.keys.sort
      assert_equal "auth-request-test", body.fetch("request_id")
      assert_equal 1, calls.length
      refute(@store.calls.any? { |name, _| name == "create_session" })
      refute headers.key?("set-cookie")
      refute_includes @logs.string, "sensitive-upstream"
      refute_includes @logs.string, "fixture@example.invalid"
      refute_includes @logs.string, "disposable-password"
      if status == 503
        event = JSON.parse(@logs.string.lines.last.split(" -- : ", 2).last)
        assert_equal({ "event" => "auth.boundary_unavailable", "request_id" => "auth-request-test" }, event)
      else
        assert_empty @logs.string
      end
    end
  end

  private

  # AIDEV-NOTE: Rack dispatch keeps Rails logger/render active; isolated action calls missed the config collision.
  def dispatch(action)
    wire = action == "login" ? JSON.generate(email: "fixture@example.invalid", password: "disposable-password") : ""
    env = Rack::MockRequest.env_for("https://app.test/v1/auth/#{action}",
      method: action == "login" ? "POST" : "GET", input: wire)
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "REMOTE_ADDR" => "127.0.0.1", "action_dispatch.request_id" => "auth-request-test")
    if action == "login"
      env.merge!("HTTP_COOKIE" => "elevateo_challenge=#{@issued.fetch(:cookie)}",
        "HTTP_X_CSRF_TOKEN" => @issued.fetch(:body).fetch("csrf_token"))
    end
    status, headers, rack_body = Rails.stub(:logger, @logger) do
      Elevateo::Config.stub(:current, config) do
        Elevateo::Sessions.stub(:new, @service) { V1::AuthController.action(action).call(env) }
      end
    end
    serialized = +""
    rack_body.each { |part| serialized << part }
    [status, headers.transform_keys(&:downcase), JSON.parse(serialized)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end
end
