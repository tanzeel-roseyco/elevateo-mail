# frozen_string_literal: true

require_relative "write_boundary_test_helper"
require_relative "../../app/controllers/v1/thread_read_states_controller"
require_relative "../../app/controllers/v1/thread_assignments_controller"
require_relative "../../app/controllers/v1/thread_notes_controller"

# AIDEV-NOTE: Real controllers and services consume canned SQL rows; separate database tests prove those SQL queries.
module CollaborationControllerHarness
  BOX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  THREAD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  NOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  TARGET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  TIME = "2026-10-12T00:00:00.000001Z"

  module Sessions
    protected

    def read_sessions = request.get_header("be02.sessions")
    def read_config = request.get_header("be02.config")
  end

  class ReadStateController < V1::ThreadReadStatesController
    include Sessions
  end
  class AssignmentController < V1::ThreadAssignmentsController
    include Sessions
  end
  class NotesController < V1::ThreadNotesController
    include Sessions
  end

  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :rows
    def initialize(metadata)
      super
      @rows = []
    end
    def exec_query(query, label, binds)
      return super if query.include?("begin_protected_write") || query.include?("set_config")
      @sql << query
      @business << :query
      raise "missing collaboration query fixture" if @rows.empty?
      @rows.shift
    end
  end

  # AIDEV-NOTE: Collaboration GET uses protected_read's pool lease; the shared write fixture only needs checkout.
  class Pool < WriteBoundaryHarness::Pool
    def with_connection = yield @connection
  end

  def dispatch_collaboration(controller, action, payload: nil, body: nil, query: "", headers: {}, thread: THREAD)
    method = %w[index show].include?(action) ? "GET" : action == "create" ? "POST" : "PUT"
    wire = body || (payload ? JSON.generate(payload) : "")
    env = Rack::MockRequest.env_for("https://app.test/v1/threads/#{thread}", method: method, input: wire)
    configuration = config
    configuration.cursor_signing_key = "disposable-collaboration-key-0001"
    env.merge!("QUERY_STRING" => query, "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"), "action_dispatch.request_id" => "collaboration-test",
      "action_dispatch.request.path_parameters" => { thread_id: thread },
      "be02.sessions" => @service, "be02.config" => configuration)
    env.merge!(headers)
    headers.each { |key, value| env.delete(key) if value.nil? }
    @collaboration_pool = Pool.new(@connection)
    status, response_headers, rack_body = ActiveRecord::Base.stub(:connection_pool, @collaboration_pool) do
      controller.action(action).call(env)
    end
    serialized = +""
    rack_body.each { |part| serialized << part }
    [status, response_headers.transform_keys(&:downcase), JSON.parse(serialized), serialized]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def note_row(body)
    { "id" => NOTE, "organization_id" => AuthFixtures::ORG, "mailbox_id" => BOX, "thread_id" => THREAD,
      "author_id" => AuthFixtures::USER, "body_text" => body, "version" => 1, "created_at" => TIME }
  end

  def budget_cases
    resource = [{ "id" => THREAD }]
    initial = [{ "assignee_id" => nil, "assignment_version" => 0, "updated_at" => nil }]
    [[ReadStateController, "update", 8192, { "mailbox_id" => BOX, "read" => false }, [resource, []], 200],
     [AssignmentController, "update", 8192,
      { "mailbox_id" => BOX, "assignee_id" => nil, "expected_assignment_version" => 0 }, [resource, [], initial], 200],
     [NotesController, "create", 65_536, { "mailbox_id" => BOX, "note_id" => NOTE, "body_text" => "valid" },
      [resource, [note_row("valid")]], 201]]
  end
end
