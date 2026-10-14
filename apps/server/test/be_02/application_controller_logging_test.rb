# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "rails"
require "action_controller"
require "action_controller/api"
require "rack/mock"
require "stringio"
require_relative "../../app/controllers/application_controller"

class ApplicationControllerLoggingTest < Minitest::Test
  class FailingController < ApplicationController
    def index = raise("private-message-body")
  end

  def test_standalone_rack_dispatch_logs_fixed_error_without_rails_logger
    # AIDEV-NOTE: Reproduce pre-boot Rails, which exposes logger but has not configured it.
    _stdout, stderr = capture_io { Rails.stub(:logger, nil) { assert_internal_error } }
    assert_includes stderr, '"event":"request.error"'
    assert_includes stderr, '"class":"RuntimeError"'
    assert_includes stderr, '"request_id":"logging-test"'
    refute_includes stderr, "private-message-body"
  end

  def test_configured_rails_logger_keeps_error_record
    output = StringIO.new
    Rails.stub(:logger, Logger.new(output)) { assert_internal_error }
    assert_includes output.string, '"event":"request.error"'
    assert_includes output.string, '"request_id":"logging-test"'
    refute_includes output.string, "private-message-body"
  end

  private

  def assert_internal_error
    env = Rack::MockRequest.env_for("https://app.test/error", method: "GET")
    env["action_dispatch.request_id"] = "logging-test"
    status, _headers, body = FailingController.action("index").call(env)
    assert_equal 500, status
    wire = +""
    body.each { |part| wire << part }
    assert_equal({ "code" => "internal_error", "message" => "Internal error", "request_id" => "logging-test" },
      JSON.parse(wire))
  ensure
    body.close if body.respond_to?(:close)
  end
end
