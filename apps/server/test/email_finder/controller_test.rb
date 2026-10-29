# frozen_string_literal: true
require_relative "../be_02/collaboration_controller_helper"
require_relative "../../app/controllers/v2/email_finder_controller"

# AIDEV-NOTE: Exercise the real session/CSRF transaction boundary; database tests separately verify finder RLS.
class EmailFinderControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  class Repository
    attr_reader :calls
    attr_accessor :visible
    def initialize
      @calls = []
      @visible = true
    end
    def enqueue(org, user, kind, rows)
      @calls << [org, user, kind, rows]
      { "id" => CollaborationControllerHarness::THREAD, "kind" => kind, "status" => "queued", "total" => rows.length, "completed" => 0, "items" => [] }
    end
    def job(org, user, id)
      @calls << [org, user, id]
      raise Elevateo::CollaborationError.new("not_available") unless @visible
      { "id" => id, "status" => "queued", "items" => [] }
    end
  end

  class Controller < V2::EmailFinderController
    include CollaborationControllerHarness::Sessions
    class << self
      attr_accessor :repository
    end
    protected
    def finder_repository(_connection, identity:, write:)
      raise "missing identity" unless identity
      raise "invalid write mode" unless [true, false].include?(write)
      self.class.repository
    end
  end

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
    Controller.repository = Repository.new
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def dispatch(action, input: nil, headers: {})
    method = action == "create" ? "POST" : "GET"
    env = Rack::MockRequest.env_for("https://app.test/v2/email-finder/jobs", method: method,
      input: input ? JSON.generate(input) : "")
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "finder-test",
      "action_dispatch.request.path_parameters" => { job_id: THREAD },
      "be02.sessions" => @service, "be02.config" => config)
    env.merge!(headers)
    headers.each { |key, value| env.delete(key) if value.nil? }
    pool = CollaborationControllerHarness::Pool.new(@connection)
    status, _, body = ActiveRecord::Base.stub(:connection_pool, pool) { Controller.action(action).call(env) }
    serialized = +""
    body.each { |part| serialized << part }
    [status, JSON.parse(serialized)]
  ensure
    body.close if body.respond_to?(:close)
  end

  def test_all_four_features_enqueue_only_current_owner_and_tenant
    { "person" => { "name" => "Jane Doe", "domain" => "example.com" },
      "verify" => { "email" => "jane@example.com" }, "company" => { "domain" => "example.com" },
      "decision_maker" => { "company" => "Example", "role" => "CEO" } }.each do |kind, row|
      status, result = dispatch("create", input: { "kind" => kind, "rows" => [row], "csv" => nil })
      assert_equal 202, status
      assert_equal "queued", result.fetch("status")
      assert_equal [AuthFixtures::ORG, AuthFixtures::USER, kind], Controller.repository.calls.last.first(3)
    end
  end

  def test_every_feature_rejects_missing_fields_and_unknown_fields
    %w[person verify company decision_maker].each do |kind|
      [{}, { "unexpected" => "value" }].each do |row|
        status, result = dispatch("create", input: { "kind" => kind, "rows" => [row], "csv" => nil })
        assert_equal [400, "request_invalid"], [status, result.fetch("code")]
      end
    end
    assert_empty Controller.repository.calls
  end

  def test_missing_session_or_csrf_never_enqueues
    input = { "kind" => "verify", "rows" => [{ "email" => "jane@example.com" }], "csv" => nil }
    status, = dispatch("create", input: input, headers: { "HTTP_COOKIE" => nil })
    assert_operator status, :>=, 400
    status, = dispatch("create", input: input, headers: { "HTTP_X_CSRF_TOKEN" => nil })
    assert_operator status, :>=, 400
    assert_empty Controller.repository.calls
  end

  def test_hidden_owner_job_has_existing_not_available_envelope
    Controller.repository.visible = false
    status, result = dispatch("show")
    assert_equal [404, "not_available"], [status, result.fetch("code")]
    assert_equal [AuthFixtures::ORG, AuthFixtures::USER, THREAD], Controller.repository.calls.last
  end
end
