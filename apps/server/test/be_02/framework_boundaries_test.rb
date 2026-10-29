# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "active_record"
require "action_controller"
require "action_controller/api"
require_relative "../../app/controllers/application_controller"
require_relative "../../app/controllers/health_controller"
require_relative "../../app/controllers/v1/api_controller"
require_relative "../../app/controllers/v1/read_controller"
require_relative "../../app/controllers/v1/threads_controller"
require_relative "../../lib/elevateo/thread_reads"
require_relative "../../lib/elevateo/config"

class FrameworkBoundariesTest < Minitest::Test
  def test_health_check_rejects_non_http_and_hostless_uris_without_transport
    controller = HealthController.new
    Net::HTTP.stub(:start, ->(*) { flunk "invalid URI started transport" }) do
      ["/relative", "ftp://auth:9999", "http:/missing-host"].each do |url|
        refute controller.send(:http_ok?, url)
      end
    end
  end

  def test_health_check_preserves_host_port_path_and_timeout
    calls = []
    http = Object.new
    http.define_singleton_method(:request) do |request, &block|
      calls << request.path
      block.call(Struct.new(:code).new("200"))
      flunk "health probe continued to consume response body"
    end
    transport = ->(host, port, proxy, **options, &block) do
      calls << [host, port, proxy, options]
      block.call(http)
    end
    Net::HTTP.stub(:start, transport) do
      assert HealthController.new.send(:http_ok?, "http://auth:9999/health")
    end
    assert_equal [["auth", 9999, nil, { use_ssl: false, open_timeout: 2, read_timeout: 2, write_timeout: 2, max_retries: 0 }], "/health"], calls
  end

  def readiness(mode:, failed: nil)
    cfg = Struct.new(:outbound_mode, :auth_url, :storage_url, :mailpit_url, :outbound_hold).new(
      mode, "http://auth:9999", "http://storage:5000", "http://mailpit:8025", true)
    controller, calls, rendered = HealthController.new, [], []
    controller.define_singleton_method(:http_ok?) { |url| calls << url; url != failed }
    controller.define_singleton_method(:render) { |**value| rendered << value }
    database = Object.new
    database.define_singleton_method(:select_value) { |_| failed != "database" ? 1 : 0 }
    Elevateo::Config.stub(:current, cfg) do
      ActiveRecord::Base.stub(:connection, database) { controller.ready }
    end
    [calls, rendered.fetch(0)]
  end

  def test_readiness_does_not_require_unused_catcher
    %w[held resend].each do |mode|
      calls, result = readiness(mode: mode)
      assert_equal ["http://auth:9999/health", "http://storage:5000/status"], calls
      assert_equal :ok, result.fetch(:status)
      assert result.fetch(:json).fetch(:checks).fetch(:mail_catcher)
    end
  end

  def test_readiness_fails_when_catcher_is_selected_but_unavailable
    calls, result = readiness(mode: "mailpit", failed: "http://mailpit:8025/livez")
    assert_includes calls, "http://mailpit:8025/livez"
    assert_equal :service_unavailable, result.fetch(:status)
    refute result.fetch(:json).fetch(:checks).fetch(:mail_catcher)
  end

  def test_readiness_fails_for_required_database_auth_or_storage
    ["database", "http://auth:9999/health", "http://storage:5000/status"].each do |failed|
      _, result = readiness(mode: "held", failed: failed)
      assert_equal :service_unavailable, result.fetch(:status)
    end
    refute HealthController.new.send(:check) { raise IOError, "dependency unavailable" }
  end

  def test_thread_actions_reject_non_string_paths_as_invalid_before_reader_calls
    [:index, :show].each do |action|
      [nil, [], {}, true, 123].each do |value|
        controller, calls = thread_controller(action, value)
        error = assert_raises(Elevateo::AuthError) { controller.public_send(action) }
        assert_equal 400, error.status
        assert_empty calls
      end
    end
  end

  def test_thread_actions_pass_string_paths_to_domain_validation_unchanged
    id = "11111111-1111-4111-8111-111111111111"
    { index: :mailbox_id, show: :thread_id }.each do |action, key|
      controller, calls = thread_controller(action, id)
      assert_equal "{}", controller.public_send(action)
      assert_equal [{ key => id, query: {} }], calls
    end
  end

  private

  def thread_controller(action, value)
    key, operation = action == :index ? [:mailbox_id, :list] : [:thread_id, :detail]
    parameters = ActionController::Parameters.new(key => value)
    controller, reader, calls = V1::ThreadsController.new, Object.new, []
    controller.define_singleton_method(:params) { parameters }
    # AIDEV-NOTE: This isolates Rails parameter narrowing; ReadController tests own auth/snapshot/touch behavior.
    controller.define_singleton_method(:protected_read) do |**_, &block|
      block.call(connection: nil, identity: nil, session: {}, query: {})
    end
    reader.define_singleton_method(operation) { |**inputs| calls << inputs; "{}" }
    controller.define_singleton_method(:reader) { |*| reader }
    [controller, calls]
  end
end
