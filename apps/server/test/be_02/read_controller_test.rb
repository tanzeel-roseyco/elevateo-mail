# frozen_string_literal: true

require "active_record"
require "action_controller"
require "action_controller/api"
require "rack/mock"
require "minitest/mock"
require_relative "auth_test_helper"
require_relative "../../app/controllers/application_controller"
require_relative "../../app/controllers/v1/api_controller"
require_relative "../../app/controllers/v1/read_controller"

class ReadControllerTest < Minitest::Test
  include AuthFixtures

  # AIDEV-NOTE: Exercise real controller, session and tenancy code; this adapter does not prove PostgreSQL or RLS.
  class Connection
    Transaction = Struct.new(:open) { def open? = open }
    attr_reader :current_transaction, :options, :statements, :claims

    def initialize(events) = (@events, @statements = events, [])
    def transaction_open? = @current_transaction&.open? || false
    def clear_query_cache = (@events << :clear_cache)
    def uncached(dirties: true) = yield
    def disconnect! = (@events << :disconnect)
    def execute(sql) = (@statements << sql)
    def exec_query(sql, _label, bindings)
      @statements << sql
      @claims = bindings.map(&:value_for_database)
      @events << :claims
      []
    end

    def transaction(**options)
      @options, @current_transaction = options, Transaction.new(true)
      @events << :begin
      result = yield
      @events << :commit
      result
    rescue ActiveRecord::Rollback
      # AIDEV-NOTE: ActiveRecord swallows this exception; the controller must reject the absent result before touch.
      @events << :rollback
      nil
    rescue StandardError
      @events << :rollback
      raise
    ensure
      @current_transaction.open = false
    end
  end

  Pool = Struct.new(:connection) { def with_connection = yield(connection) }

  class ObservedSessions
    attr_accessor :after_authenticate, :before_authorize, :before_touch
    attr_reader :authorization_connection

    def initialize(service, events) = (@service, @events = service, events)
    def authenticate(**inputs)
      @events << :authenticate
      identity = @service.authenticate(**inputs)
      @after_authenticate&.call
      identity
    end
    def authorize(identity, **inputs)
      @events << :authorize
      @authorization_connection = inputs.fetch(:connection)
      @before_authorize&.call
      @service.authorize(identity, **inputs)
    end
    def touch(identity, **inputs)
      @events << :touch
      @before_touch&.call
      @service.touch(identity, **inputs)
    end
  end

  class ProbeController < V1::ReadController
    def show
      protected_read(**request.get_header("be02.options")) do |**inputs|
        request.get_header("be02.projection").call(**inputs)
      end
    end

    protected

    def read_sessions = request.get_header("be02.sessions")
  end

  def setup
    @service, @store, @client, @cookie = harness
    @events = []
    @connection = Connection.new(@events)
    @sessions = ObservedSessions.new(@service, @events)
    @wire = "{\n  \"items\": [], \"next_cursor\": null\n}\n"
    @projection = lambda do |**inputs|
      @events << :business_read
      @seen = inputs
      @wire
    end
  end

  def teardown
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
    refute @connection.transaction_open?
  end

  def test_exact_serialization_headers_and_one_read_only_authorization_snapshot
    @sessions.after_authenticate = -> { refute @connection.transaction_open? }
    @sessions.before_touch = -> { refute @connection.transaction_open? }
    original = @projection
    @projection = lambda do |**inputs|
      frame = Thread.current[Elevateo::Tenancy::STACK_KEY]
      assert frame.read_only
      assert_same @connection, frame.connection
      assert_same @connection.current_transaction, frame.transaction
      original.call(**inputs)
    end
    status, headers, body = dispatch(query: "limit=2")
    assert_equal 200, status
    assert_equal @wire, body
    assert_security_headers(headers)
    assert_equal({ isolation: :repeatable_read }, @connection.options)
    assert_equal "SET TRANSACTION READ ONLY", @connection.statements.first
    assert_equal [USER, ORG], @connection.claims
    assert_same @connection, @sessions.authorization_connection
    assert_same @connection, @seen.fetch(:connection)
    assert_equal({ "limit" => "2" }, @seen.fetch(:query))
    assert_equal @service.presentation.session(@store.row, display_name: "Test"), @seen.fetch(:session)
    order = @events - [:clear_cache]
    assert_equal %i[authenticate begin claims authorize business_read commit touch], order
    assert_equal 1, @store.calls.count { |name, _| name == "touch_session" }
  end

  def test_no_organization_authentication_returns_generic_404_before_tenant_reads
    @store.row.merge!("status" => "not_found", "organization_id" => nil, "organization_name" => nil)
    assert_response_error(404, "not_available", dispatch(context_required: false))
    assert_equal [:authenticate], @events
    assert_empty @connection.statements
    assert_empty @client.calls
  end

  def test_bootstrap_without_context_headers_retains_the_authenticated_organization
    status, headers, body = dispatch(context_required: false)
    assert_equal 200, status
    assert_equal @wire, body
    assert_security_headers(headers)
    assert_equal ORG, @seen.fetch(:session).fetch("organization").fetch("id")
    assert_equal [USER, ORG], @connection.claims
  end

  def test_duplicate_unknown_and_oversized_query_are_rejected_before_authentication
    ["limit=1&limit=2", "limit=1&%6cimit=2", "unknown=1", "limit=%XX", "limit=#{'x' * 8192}"].each do |query|
      assert_response_error(400, "request_invalid", dispatch(query: query))
    end
    assert_empty @events
    assert_empty @store.calls
    assert_empty @client.calls
  end

  def test_get_body_is_rejected_before_authentication
    ["{}", " ", "\x00"].each do |body|
      assert_response_error(400, "request_invalid", dispatch(body: body))
    end
    assert_empty @events
    assert_empty @store.calls
  end

  def test_missing_context_is_rejected_before_authentication
    assert_response_error(400, "request_invalid", dispatch(context: nil))
    assert_empty @events
    assert_empty @store.calls
  end

  def test_transient_auth_never_opens_a_tenant_snapshot_or_deletes_the_cookie
    @client.failure = Elevateo::AuthError.new
    assert_response_error(503, "temporarily_unavailable", dispatch)
    assert_equal [:authenticate], @events
    assert_empty @connection.statements
    refute @store.state[:revoked]
  end

  def test_post_auth_organization_switch_fails_bootstrap_before_any_business_read
    @sessions.after_authenticate = lambda do
      @store.row.merge!("organization_id" => "55555555-5555-4555-8555-555555555555",
        "context_id" => "66666666-6666-4666-8666-666666666666", "organization_name" => "Other org")
    end
    assert_response_error(409, "context_changed", dispatch(context_required: false))
    assert_equal [USER, ORG], @connection.claims
    assert_rolled_back_snapshot
  end

  def test_revocation_during_auth_precedes_stale_context_and_business_read
    @sessions.after_authenticate = -> { @store.state[:revoked] = true }
    assert_response_error(401, "unauthenticated", dispatch(context: "stale-context-0001"))
    assert_rolled_back_snapshot
  end

  def test_revoked_touch_does_not_release_the_already_rendered_business_payload
    @sessions.before_touch = -> { @store.state[:revoked] = true }
    assert_response_error(401, "unauthenticated", dispatch)
    assert_operator @events.index(:commit), :<, @events.index(:touch)
    assert_includes @events, :business_read
  end

  def test_expired_touch_returns_401_without_releasing_the_read_result
    # AIDEV-NOTE: Model the database expiry verdict; real clock/idle enforcement belongs to SQL integration tests.
    @sessions.before_touch = -> { @store.row["status"] = "unauthorized" }
    assert_response_error(401, "unauthenticated", dispatch)
    assert_equal 1, @store.calls.count { |name, _| name == "touch_session" }
  end

  def test_database_failure_rolls_back_without_touching_or_releasing_rows
    @projection = lambda do |**_inputs|
      @events << :business_read
      raise ActiveRecord::StatementInvalid, "synthetic SQL failure"
    end
    assert_response_error(503, "temporarily_unavailable", dispatch)
    assert_rolled_back_snapshot(business_read: true)
  end

  def test_authorizer_rollback_discards_the_result_before_business_read_or_touch
    @sessions.before_authorize = -> { raise ActiveRecord::Rollback }
    assert_response_error(500, "internal_error", dispatch)
    assert_rolled_back_snapshot
  end

  def test_renderer_rollback_discards_the_result_before_touch
    @projection = lambda do |**_inputs|
      @events << :business_read
      raise ActiveRecord::Rollback
    end
    assert_response_error(500, "internal_error", dispatch)
    assert_rolled_back_snapshot(business_read: true)
  end

  def test_invalid_serialization_rolls_back_before_touch
    [nil, "x" * 16_385, "\xFF".dup.force_encoding("UTF-8")].each do |invalid|
      @projection = ->(**_inputs) { @events << :business_read; invalid }
      assert_response_error(500, "internal_error", dispatch)
      assert_rolled_back_snapshot(business_read: true)
    end
  end

  private

  def dispatch(query: "", body: "", context_required: true, context: CONTEXT)
    env = Rack::MockRequest.env_for("https://app.test/v1/session", method: "GET", input: body)
    env.merge!("QUERY_STRING" => query, "HTTP_COOKIE" => "elevateo_session=#{@cookie}",
      "HTTP_X_SESSION_CONTEXT" => context_required ? context : nil,
      "HTTP_X_AUTHORIZATION_VERSION" => context_required ? @service.presentation.version(metadata) : nil,
      "action_dispatch.request_id" => "be02-read-test", "be02.sessions" => @sessions,
      "be02.options" => { allowed_query: %w[limit cursor], context_required: context_required, budget: 16_384 },
      "be02.projection" => @projection)
    status, headers, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      ProbeController.action("show").call(env)
    end
    serialized = +""
    rack_body.each { |part| serialized << part }
    [status, headers.transform_keys(&:downcase), serialized]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def assert_security_headers(headers)
    assert_equal "no-store", headers.fetch("cache-control")
    assert_equal "Cookie", headers.fetch("vary")
    assert_equal "nosniff", headers.fetch("x-content-type-options")
    assert_equal "application/json", headers.fetch("content-type").split(";").first
    refute headers.key?("set-cookie")
  end

  def assert_response_error(status, code, result)
    actual_status, headers, body = result
    assert_equal status, actual_status
    assert_security_headers(headers)
    assert_equal({ "code" => code, "message" => Elevateo::AuthError::MESSAGES.fetch(code),
      "request_id" => "be02-read-test" }, JSON.parse(body))
    refute_equal @wire, body
  end

  def assert_rolled_back_snapshot(business_read: false)
    assert_includes @events, :authorize
    assert_includes @events, :rollback
    refute_includes @events, :commit
    assert_equal business_read, @events.include?(:business_read)
    refute_includes @events, :touch
    refute @store.calls.any? { |name, _| name == "touch_session" }
  end
end
