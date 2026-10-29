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
require_relative "../../app/controllers/v1/sso_controller"

class SsoControllerRequestTest < Minitest::Test
  include AuthFixtures

  def config
    super.tap do |value|
      value.sso_provider = "custom:authentik"
      value.sso_enabled = true
      value.sso_only = true
      value.auth_public_url = "https://auth.test"
    end
  end

  def setup
    @service, @store, = harness
    @logs = StringIO.new
    @sso = Elevateo::GoogleSso.new(sessions: @service, config: config)
  end

  def test_status_and_start_expose_only_public_contract
    status, headers, body = dispatch("status")
    assert_equal 200, status
    assert_equal({ "enabled" => true, "provider" => "custom:authentik", "password_login_enabled" => false }, JSON.parse(body))
    assert_equal "no-store", headers.fetch("cache-control")
    status, headers, = dispatch("start")
    assert_equal 303, status
    assert headers.fetch("location").start_with?("https://auth.test/authorize?")
    cookie = headers.fetch("set-cookie").to_s
    assert_includes cookie, "httponly"
    assert_includes cookie, "samesite=lax"
    assert_includes cookie, "path=/v1/auth/sso"
  end

  def test_callback_success_sets_opaque_strict_cookie_and_fixed_redirect
    cookie = @service.crypto.cookie
    result = Elevateo::SessionResult.new(cookie: cookie, metadata: @store.row, expires_at: Time.now + 3600, display_name: nil)
    @sso.stub(:complete, result) do
      status, headers, body = dispatch("callback", query: "code=private&state=secret")
      assert_equal 303, status
      assert_equal "https://app.test/", headers.fetch("location")
      assert_empty body
      assert_includes headers.fetch("set-cookie").to_s, "elevateo_session=#{cookie}"
      assert_includes headers.fetch("set-cookie").to_s, "samesite=strict"
      assert_equal "no-referrer", headers.fetch("referrer-policy")
    end
    refute_includes @logs.string, "private"
    refute_includes @logs.string, "secret"
  end

  def test_missing_flow_is_fixed_failure_without_credential_leak
    status, headers, = dispatch("callback", query: "code=private&state=secret")
    assert_equal 303, status
    assert_equal "https://app.test/?sso_error=invalid_response", headers.fetch("location")
    refute_includes headers.fetch("set-cookie").to_s, "elevateo_session="
    assert_empty @store.calls
    refute_includes @logs.string, "private"
  end

  private

  # AIDEV-NOTE: Exercise early query redaction and real Rails cookies/rendering together, without network access.
  def dispatch(action, query: nil)
    path = "https://app.test/v1/auth/sso/#{action}"
    path += "?#{query}" if query
    env = Rack::MockRequest.env_for(path, method: "GET")
    env["action_dispatch.request_id"] = "sso-request-test"
    app = lambda do |redacted|
      Rails.stub(:logger, Logger.new(@logs)) do
        Elevateo::Config.stub(:current, config) do
          Elevateo::Sessions.stub(:new, @service) do
            Elevateo::GoogleSso.stub(:new, @sso) { V1::SsoController.action(action).call(redacted) }
          end
        end
      end
    end
    status, headers, rack_body = Elevateo::AuthCallbackRedaction.new(app).call(env)
    serialized = +""
    rack_body.each { |part| serialized << part }
    [status, headers.transform_keys(&:downcase), serialized]
  end
end
