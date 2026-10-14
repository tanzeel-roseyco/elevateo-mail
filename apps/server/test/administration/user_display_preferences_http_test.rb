# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/user_display_preferences_controller"

class UserDisplayPreferencesHttpTest < Minitest::Test
  include AuthFixtures

  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :read_result, :write_result
    attr_reader :read_arguments, :write_arguments

    def exec_query(sql, name, binds)
      if sql.include?("app.read_user_display_preference")
        @read_arguments = binds.map(&:value_for_database)
        return ActiveRecord::Result.new(["result"], [[@read_result]])
      end
      if sql.include?("app.write_user_display_preference")
        @write_arguments = binds.map(&:value_for_database)
        return ActiveRecord::Result.new(["result"], [[@write_result]])
      end
      super
    end
  end

  class Pool < WriteBoundaryHarness::Pool
    def with_connection = yield(@connection)
  end

  class Controller < V2::Admin::UserDisplayPreferencesController
    protected

    def read_sessions = request.get_header("adm803.sessions")
    def read_config = request.get_header("adm803.config")
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @connection.read_result = { "status" => "ok", "display_name" => nil, "revision" => 0 }
    @connection.write_result = { "status" => "ok", "metadata" => metadata,
      "display_name" => "Ada", "revision" => 1 }
  end

  def test_own_read_and_versioned_write
    status, headers, body = dispatch(action: "show", method: "GET")
    assert_equal 200, status
    assert_equal({ "context_id" => CONTEXT, "authorization_version" => @service.presentation.version(metadata),
      "display_name" => nil, "revision" => 0 }, body)
    assert_equal "no-store", headers.fetch("cache-control")
    assert_equal [@service.crypto.digest(@cookie)], @connection.read_arguments
    status, _headers, body = dispatch
    assert_equal 200, status
    assert_equal({ "display_name" => "Ada", "revision" => 1 }, body)
    assert_equal [@service.crypto.digest(@cookie), "0", "Ada"], @connection.write_arguments
  end

  def test_rejects_forged_target_and_stale_revision
    status, _headers, body = dispatch(payload: { "display_name" => "Ada", "expected_revision" => 0,
      "user_id" => "55555555-5555-4555-8555-555555555555" })
    assert_equal 400, status
    assert_equal "request_invalid", body.fetch("code")
    assert_nil @connection.write_arguments
    @connection.write_result = { "status" => "preference_conflict" }
    status, _headers, body = dispatch
    assert_equal 409, status
    assert_equal "membership_conflict", body.fetch("code")
  end

  def test_denies_foreign_identity_and_malformed_sql_result
    @connection.read_result = { "status" => "not_found" }
    status, _headers, body = dispatch(action: "show", method: "GET")
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    @connection.write_result = { "status" => "ok", "metadata" => metadata.merge("user_id" =>
      "55555555-5555-4555-8555-555555555555"), "display_name" => "Ada", "revision" => 1 }
    status, _headers, body = dispatch
    assert_equal 500, status
    assert_equal "internal_error", body.fetch("code")
  end

  private

  def dispatch(action: "update", method: "PUT", payload: { "display_name" => "Ada", "expected_revision" => 0 })
    env = Rack::MockRequest.env_for("https://app.test/v2/me/preferences", method: method,
      input: method == "GET" ? "" : JSON.generate(payload))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "preference-http",
      "adm803.sessions" => @service, "adm803.config" => config)
    status, headers, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      Controller.action(action).call(env)
    end
    response = +""
    rack_body.each { |part| response << part }
    [status, headers.transform_keys(&:downcase), JSON.parse(response)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end
end
