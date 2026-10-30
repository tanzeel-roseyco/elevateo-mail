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
    http.define_singleton_method(:get) { |path| calls << path; Struct.new(:code).new("200") }
    transport = ->(host, port, **options, &block) do
      calls << [host, port, options]
      block.call(http)
    end
    Net::HTTP.stub(:start, transport) do
      assert HealthController.new.send(:http_ok?, "http://auth:9999/health")
    end
    assert_equal [["auth", 9999, { open_timeout: 2, read_timeout: 2 }], "/health"], calls
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
