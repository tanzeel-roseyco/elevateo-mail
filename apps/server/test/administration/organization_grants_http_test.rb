# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/organization_grants_controller"

class OrganizationGrantsHttpTest < Minitest::Test
  include AuthFixtures

  TARGET = "55555555-5555-4555-8555-555555555555"
  FOREIGN = "66666666-6666-4666-8666-666666666666"

  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :role_result, :page_result
    attr_reader :role_arguments

    def exec_query(sql, name, binds)
      if sql.include?("app.organization_grants_page")
        return ActiveRecord::Result.new(["result"], [[@page_result]])
      end
      return super unless sql.include?("app.change_organization_role")
      @role_arguments = binds.map(&:value_for_database)
      ActiveRecord::Result.new(["result"], [[@role_result]])
    end
  end

  class Pool < WriteBoundaryHarness::Pool
    def with_connection = yield(@connection)
  end

  class Controller < V2::Admin::OrganizationGrantsController
    protected

    def read_sessions = request.get_header("adm803.sessions")
    def read_config = request.get_header("adm803.config")
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @connection.page_result = { "status" => "ok", "items" => [
      { "user_id" => TARGET, "role" => "admin", "revision" => 2 }], "next_after_user" => nil }
    @connection.role_result = { "status" => "ok", "metadata" => metadata,
      "revision" => 1, "role" => "admin" }
  end

  def test_redacted_paginated_get_and_roster
    status, headers, body = dispatch(action: "index", method: "GET", query: "limit=1")
    assert_equal 200, status
    assert_equal "no-store", headers.fetch("cache-control")
    assert_equal [{ "organization_id" => ORG, "user_id" => TARGET,
      "role" => "organization_admin", "revision" => 2 }], body.fetch("items")
    refute body.key?("email")
    status, _headers, roster = dispatch(action: "roster", method: "GET", query: "limit=2")
    assert_equal 200, status
    assert_equal 2, roster.fetch("items").length
    assert_equal "elev-person-001", roster.fetch("items").first.fetch("key")
    refute_includes JSON.generate(roster), "auth_user_id"
    refute_includes JSON.generate(roster), "proposed_org_role"
  end

  def test_get_rejects_foreign_organization_and_invalid_cursor
    status, _headers, body = dispatch(action: "index", method: "GET", organization: FOREIGN)
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    status, _headers, body = dispatch(action: "index", method: "GET", query: "cursor=forged")
    assert_equal 400, status
    assert_equal "cursor_invalid", body.fetch("code")
  end

  def test_get_cursor_pages_and_rejects_malformed_authority_rows
    @connection.page_result["next_after_user"] = TARGET
    status, _headers, first = dispatch(action: "index", method: "GET", query: "limit=1")
    assert_equal 200, status
    @connection.page_result = { "status" => "ok", "items" => [], "next_after_user" => nil }
    status, _headers, second = dispatch(action: "index", method: "GET",
      query: "limit=1&cursor=#{first.fetch("next_cursor")}")
    assert_equal 200, status
    assert_equal [], second.fetch("items")
    @connection.page_result = { "status" => "ok", "items" => [
      { "user_id" => TARGET, "role" => "unexpected", "revision" => 2 }], "next_after_user" => nil }
    status, _headers, body = dispatch(action: "index", method: "GET")
    assert_equal 500, status
    assert_equal "internal_error", body.fetch("code")
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

  def dispatch(organization: ORG, payload: { "role" => "organization_admin", "expected_revision" => 0 },
    action: "update", method: "PUT", query: "")
    env = Rack::MockRequest.env_for("https://app.test/v2/organizations/#{organization}/grants/#{TARGET}",
      method: method, input: method == "GET" ? "" : JSON.generate(payload))
    configuration = config
    configuration.cursor_signing_key = "disposable-admin-cursor-signing-key-001"
    env.merge!("QUERY_STRING" => query, "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "adm803-http",
      "action_dispatch.request.path_parameters" => { organization_id: organization, user_id: TARGET },
      "adm803.sessions" => @service, "adm803.config" => configuration)
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
