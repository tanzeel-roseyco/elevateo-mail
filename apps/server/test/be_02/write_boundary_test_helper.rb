# frozen_string_literal: true

require "active_record"
require "action_controller"
require "action_controller/api"
require "rack/mock"
require "minitest/mock"
require "monitor"
require_relative "auth_test_helper"
require_relative "../../app/controllers/application_controller"
require_relative "../../app/controllers/v1/api_controller"
require_relative "../../app/controllers/v1/write_controller"

module WriteBoundaryHarness
  # AIDEV-NOTE: The adapter verifies orchestration and rollback; separate PG tests prove lock and privilege behavior.
  class Connection
    Transaction = Struct.new(:open) { def open? = open }
    attr_reader :current_transaction, :events, :sql, :guard_arguments, :deadline_arguments, :lock
    attr_accessor :metadata, :business, :before_guard, :owner

    def initialize(metadata)
      @metadata, @events, @sql, @business = metadata, [], [], []
      @lock = Monitor.new
    end
    def transaction_open? = @current_transaction&.open? || false
    def clear_query_cache = nil
    def uncached(dirties: true) = yield
    def disconnect! = (@events << :disconnect)
    def execute(query) = (@sql << query)
    def exec_query(query, _label, binds)
      @sql << query
      @deadline_arguments = binds.map(&:value_for_database) if query.include?("set_config('transaction_timeout', $1")
      return ActiveRecord::Result.new([], []) unless query.include?("begin_protected_write")
      @events << :guard
      @before_guard&.call
      @guard_arguments = binds.map(&:value_for_database)
      ActiveRecord::Result.new(["result"], [[@metadata.dup]])
    end

    def transaction(**_options)
      @current_transaction = Transaction.new(true)
      @events << :begin
      original = @business.dup
      result = yield
      @events << :commit
      result
    rescue ActiveRecord::Rollback
      @business = original
      @events << :rollback
      nil
    rescue StandardError
      @business = original
      @events << :rollback
      raise
    ensure
      @current_transaction.open = false
    end
  end

  class Pool
    attr_reader :connection, :timeouts, :checkins, :connections, :removed
    attr_accessor :before_checkout
    def initialize(connection)
      @connection, @timeouts, @checkins = connection, [], []
      @connections, @removed, @lock = [connection], [], Monitor.new
      # AIDEV-NOTE: Match the pinned read-only queue proof; the real-pool suite owns all concurrency evidence.
      @available = ActiveRecord::ConnectionAdapters::ConnectionPool::Queue.new(@lock)
    end
    def synchronize(&block) = @lock.synchronize(&block)
    def active_connection? = nil
    def checkout(timeout)
      @timeouts << timeout
      @before_checkout&.call
      @available.delete(@connection)
      @connection.owner = ActiveSupport::IsolatedExecutionState.context
      @connection
    end
    def checkin(connection)
      connection.owner = nil
      @checkins << connection
      @available.add(connection)
    end
    def remove(connection)
      @connections.delete(connection)
      @available.delete(connection)
      @removed << connection
    end
  end

  class ProbeController < V1::WriteController
    def create
      protected_write(**request.get_header("be02.options")) do |**inputs|
        request.get_header("be02.operation").call(**inputs)
      end
    end

    protected

    def read_sessions = request.get_header("be02.sessions")
    def read_config = request.get_header("be02.config")
  end

  def dispatch(body: '{"value":true}', query: "", headers: {}, options: {}, method: "POST")
    env = Rack::MockRequest.env_for("https://app.test/v1/probe", method: method, input: body)
    env.merge!("QUERY_STRING" => query, "CONTENT_TYPE" => "application/json",
      "HTTP_ORIGIN" => "https://app.test", "HTTP_COOKIE" => "elevateo_session=#{@cookie}",
      "HTTP_X_SESSION_CONTEXT" => AuthFixtures::CONTEXT,
      "HTTP_X_AUTHORIZATION_VERSION" => @service.presentation.version(metadata),
      "HTTP_X_CSRF_TOKEN" => metadata.fetch("csrf_token"),
      "action_dispatch.request_id" => "be02-write-test", "be02.sessions" => @service,
      "be02.config" => config, "be02.operation" => @operation,
      "be02.options" => { required: ["value"], allowed_query: ["target"], budget: 4096 }.merge(options))
    env.merge!(headers)
    # AIDEV-NOTE: An explicit nil models an absent Content-Length, independently of the actual Rack input bytes.
    env.delete("CONTENT_LENGTH") if headers.key?("CONTENT_LENGTH") && headers["CONTENT_LENGTH"].nil?
    status, response_headers, rack_body = ActiveRecord::Base.stub(:connection_pool, Pool.new(@connection)) do
      ProbeController.action("create").call(env)
    end
    wire = +""
    rack_body.each { |part| wire << part }
    [status, response_headers.transform_keys(&:downcase), JSON.parse(wire)]
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end
end
