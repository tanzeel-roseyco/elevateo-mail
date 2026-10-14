# frozen_string_literal: true

require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v2/admin/organization_role_audit_controller"

class OrganizationRoleAuditHttpTest < Minitest::Test
  include AuthFixtures

  EVENT = "77777777-7777-4777-8777-777777777777"
  TARGET = "55555555-5555-4555-8555-555555555555"
  FOREIGN = "66666666-6666-4666-8666-666666666666"

  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :audit_result
    attr_reader :audit_arguments

    def exec_query(sql, name, binds)
      return super unless sql.include?("app.organization_role_audit_page")
      @audit_arguments = binds.map(&:value_for_database)
      ActiveRecord::Result.new(["result"], [[@audit_result]])
    end
  end

  class Pool < WriteBoundaryHarness::Pool
    def with_connection
      yield(@connection)
    end
  end

  class Controller < V2::Admin::OrganizationRoleAuditController
    protected

    def read_sessions = request.get_header("adm803.sessions")
    def read_config = request.get_header("adm803.config")
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @audit = { "id" => EVENT, "actor_user_id" => USER, "target_user_id" => TARGET,
      "old_role" => "associate", "new_role" => "auditor", "revision" => 4,
      "operation" => "replace_organization_grant", "occurred_at" => "2026-10-14T00:00:00.000001Z" }
    @connection.audit_result = { "status" => "ok", "items" => [@audit], "next_id" => nil }
  end

  def test_redacted_audit_success_and_cursor_page
    @connection.audit_result["next_id"] = EVENT
    status, headers, body = dispatch(query: "limit=1")
    assert_equal 200, status
    assert_equal "no-store", headers.fetch("cache-control")
    assert_equal "security_auditor", body.fetch("items").first.fetch("new_role")
    refute_includes JSON.generate(body), "private@example.invalid"
    assert_equal [@service.crypto.digest(@cookie), nil, "1"], @connection.audit_arguments
    @connection.audit_result = { "status" => "ok", "items" => [], "next_id" => nil }
    status, _headers, later = dispatch(query: "limit=1&cursor=#{body.fetch("next_cursor")}")
    assert_equal 200, status
    assert_equal [], later.fetch("items")
    assert_equal EVENT, @connection.audit_arguments[1]
  end

  def test_foreign_org_and_forged_cursor_are_denied
    status, _headers, body = dispatch(organization: FOREIGN)
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    assert_nil @connection.audit_arguments
    status, _headers, body = dispatch(query: "cursor=forged")
    assert_equal 400, status
    assert_equal "cursor_invalid", body.fetch("code")
  end

  def test_revoked_and_contentful_sql_rows_fail_closed
    @connection.audit_result = { "status" => "not_found" }
    status, _headers, body = dispatch
    assert_equal 404, status
    assert_equal "not_available", body.fetch("code")
    @connection.audit_result = { "status" => "ok", "items" => [@audit.merge("body_text" => "private")], "next_id" => nil }
    status, _headers, body = dispatch
    assert_equal 500, status
    assert_equal "internal_error", body.fetch("code")
  end

  private

  def dispatch(organization: ORG, query: "")
    env = Rack::MockRequest.env_for("https://app.test/v2/organizations/#{organization}/role-audit", method: "GET", input: "")
    configuration = config
    configuration.cursor_signing_key = "disposable-admin-audit-cursor-key-001"
    env.merge!("QUERY_STRING" => query, "HTTP_COOKIE" => "elevateo_session=#{@cookie}",
      "HTTP_X_SESSION_CONTEXT" => CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "action_dispatch.request_id" => "adm803-audit-http",
      "action_dispatch.request.path_parameters" => { organization_id: organization },
      "adm803.sessions" => @service, "adm803.config" => configuration)
    status, headers, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      Controller.action("index").call(env)
    end
    response = +""
    rack_body.each { |part| response << part }
    [status, headers.transform_keys(&:downcase), JSON.parse(response)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end
end
