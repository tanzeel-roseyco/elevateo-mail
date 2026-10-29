# frozen_string_literal: true

require "rails"
require "active_record"
require "action_controller"
require "action_controller/api"
require "rack/mock"
require "minitest/mock"
require_relative "auth_test_helper"
require_relative "../../app/controllers/authentik_discovery_controller"

class AuthentikDiscoveryRequestTest < Minitest::Test
  # AIDEV-NOTE: Exercise real Rails serialization; private API credentials must never enter public discovery.
  def test_public_metadata_and_disabled_gate
    settings = OpenStruct.new(sso_enabled: true, sso_provider: "custom:authentik",
      authentik_issuer: "https://identity.example.test/application/o/mail/", authentik_api_token: "private-token")
    status, headers, body = dispatch(settings)
    assert_equal 200, status
    assert_equal "no-store", headers.fetch("cache-control")
    document = JSON.parse(body)
    assert_equal settings.authentik_issuer, document.fetch("issuer")
    refute document.key?("userinfo_endpoint")
    refute_includes body, "private-token"
    settings.sso_enabled = false
    status, headers, body = dispatch(settings)
    assert_equal 503, status
    assert_equal "no-store", headers.fetch("cache-control")
    assert_empty body
  end

  private

  def dispatch(settings)
    result = nil
    Elevateo::Config.stub(:current, settings) do
      result = AuthentikDiscoveryController.action("show").call(Rack::MockRequest.env_for("/.well-known/elevateo-authentik"))
    end
    status, headers, rack_body = result
    body = +""
    rack_body.each { |chunk| body << chunk }
    rack_body.close if rack_body.respond_to?(:close)
    [status, headers, body]
  end
end
