# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/organization_grants_controller"

class OrganizationGrantsHttpTest < Minitest::Test
  include AuthFixtures

  TARGET = "55555555-5555-4555-8555-555555555555"
  FOREIGN = "66666666-6666-4666-8666-666666666666"

  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :role_result
    attr_reader :role_arguments

    def exec_query(sql, name, binds)
      return super unless sql.include?("app.change_organization_role")
      @role_arguments = binds.map(&:value_for_database)
      ActiveRecord::Result.new(["result"], [[@role_result]])
    end
  end

  class Controller < V2::Admin::OrganizationGrantsController
    protected

    def read_sessions = request.get_header("adm803.sessions")
    def read_config = request.get_header("adm803.config")
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @connection.role_result = { "status" => "ok", "metadata" => metadata,
      "revision" => 1, "role" => "admin" }
  end

  def test_guarded_http_role_change
    status, headers, body = dispatch
    assert_equal 200, status
    assert_equal({ "organization_id" => ORG, "user_id" => TARGET,
      "role" => "organization_admin", "revision" => 1 }, body)
    assert_equal [@service.crypto.digest(@cookie), TARGET, "0", "admin"], @connection.role_arguments
    assert_equal "no-store", headers.fetch("cache-control")
  end

  def test_foreign_organization_denies_before_business_sql
    status, _headers, body = dispatch(organization: FOREIGN)
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    assert_nil @connection.role_arguments
  end

  def test_unapproved_role_and_stale_revision_do_not_claim_success
    status, _headers, body = dispatch(payload: { "role" => "organization_owner", "expected_revision" => 0 })
    assert_equal 400, status
    assert_equal "request_invalid", body.fetch("code")
    assert_nil @connection.role_arguments
    @connection.role_result = { "status" => "role_conflict" }
    status, _headers, body = dispatch
    assert_equal 409, status
    assert_equal "membership_conflict", body.fetch("code")
  end

  private

  def dispatch(organization: ORG, payload: { "role" => "organization_admin", "expected_revision" => 0 })
    env = Rack::MockRequest.env_for("https://app.test/v2/organizations/#{organization}/grants/#{TARGET}",
      method: "PUT", input: JSON.generate(payload))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "adm803-http",
      "action_dispatch.request.path_parameters" => { organization_id: organization, user_id: TARGET },
      "adm803.sessions" => @service, "adm803.config" => config)
    status, headers, rack_body = ActiveRecord::Base.stub(:connection_pool, WriteBoundaryHarness::Pool.new(@connection)) do
      Controller.action("update").call(env)
    end
    response = +""
    rack_body.each { |part| response << part }
    [status, headers.transform_keys(&:downcase), JSON.parse(response)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end
end
