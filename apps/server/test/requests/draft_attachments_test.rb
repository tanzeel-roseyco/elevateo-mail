# frozen_string_literal: true
require_relative "../be_02/write_boundary_test_helper"
require_relative "../../app/controllers/v1/draft_attachments_controller"

class DraftAttachmentsRequestTest < Minitest::Test
  include AuthFixtures
  ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  BOX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  class Controller < V1::DraftAttachmentsController
    protected
    def read_sessions = request.get_header("be02.sessions")
    def read_config = request.get_header("be02.config")
  end
  class Connection < WriteBoundaryHarness::Connection
    attr_accessor :denied
    def exec_query(query, label, binds)
      if query.include?("app.reserve_draft_attachment")
        @events << :reserve
        result = @denied ? {"code" => "not_available"} : {"reservation_token" => ID, "stage_state" => "reserved"}
      elsif query.include?("app.finalize_draft_attachment")
        @events << :finalize
        result = {"stage_state" => "committed"}
      elsif query.include?("app.list_draft_attachments")
        result = {"items" => [{"id" => ID, "filename" => "note.txt", "content_type" => "text/plain",
          "byte_size" => 5, "status" => "pending_scan"}]}
      else
        return super
      end
      [{"result" => JSON.generate(result)}]
    end
  end
  class Gateway
    attr_accessor :fail_upload
    def initialize(connection)
      @connection = connection
    end
    def stage(fields:)
      raise "SQL lease held over upload" if @connection.transaction_open? || @connection.owner
      raise "missing bytes" unless fields.fetch("content_base64") == Base64.strict_encode64("hello")
      @connection.events << :upload
      raise Elevateo::CollaborationError.new("temporarily_unavailable") if @fail_upload
    end
  end
  def setup
    @service, @store, @client, @cookie = harness
    @connection = Connection.new(metadata)
    @gateway = Gateway.new(@connection)
  end
  def dispatch(body: nil, csrf: metadata.fetch("csrf_token"))
    input = {"operation_id" => ID, "mailbox_id" => BOX, "filename" => "note.txt",
      "content_type" => "text/plain", "content_base64" => Base64.strict_encode64("hello")}
    env = Rack::MockRequest.env_for("https://app.test/v1/drafts/#{ID}/attachments", method: "POST", input: body || JSON.generate(input))
    env.merge!("CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://app.test",
      "HTTP_COOKIE" => "elevateo_session=#{@cookie}", "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata), "HTTP_X_CSRF_TOKEN" => csrf,
      "action_dispatch.request_id" => "draft-upload-test", "action_dispatch.request.path_parameters" => {"draft_id" => ID},
      "be02.sessions" => @service, "be02.config" => config)
    response = ActiveRecord::Base.stub(:connection_pool, WriteBoundaryHarness::Pool.new(@connection)) do
      Elevateo::DraftAttachmentGateway.stub(:new, @gateway) { Controller.action("create").call(env) }
    end
    wire = +""
    response[2].each { |part| wire << part }
    [response[0], JSON.parse(wire)]
  ensure
    response[2].close if response && response[2].respond_to?(:close)
  end
  def test_upload_commits_reservation_before_network_then_fresh_guard_and_finalize
    status, body = dispatch
    assert_equal 200, status
    assert_equal "pending_scan", body.fetch("status")
    assert_equal %i[begin guard reserve commit upload begin guard finalize commit], @connection.events
    refute body.key?("reservation_token")
  end
  def test_storage_failure_leaves_reservation_without_finalization
    @gateway.fail_upload = true
    assert_equal 503, dispatch[0]
    assert_equal %i[begin guard reserve commit upload], @connection.events
  end
  def test_invalid_csrf_or_hidden_scope_never_uploads
    # AIDEV-NOTE: AuthFixtures uses x * 43; a valid-shaped different token must fail before storage upload.
    invalid_csrf = "y" * 43
    refute_equal metadata.fetch("csrf_token"), invalid_csrf
    assert_equal 400, dispatch(csrf: invalid_csrf)[0]
    refute_includes @connection.events, :upload
    @connection = Connection.new(metadata)
    @connection.denied = true
    @gateway = Gateway.new(@connection)
    assert_equal 404, dispatch[0]
    refute_includes @connection.events, :upload
  end
end
