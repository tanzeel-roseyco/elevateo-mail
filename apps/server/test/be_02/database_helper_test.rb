# frozen_string_literal: true

require_relative "database_test_helper"
require "minitest/mock"

# AIDEV-NOTE: Inject failures around real PG handles so cleanup assertions cannot pass against mock connections.
class DatabaseHelperTest < SessionDatabaseTestCase
  def test_extra_connections_close_after_success
    capture_connections do |opened|
      with_api_connections(2) { |connections| assert_equal 2, connections.length }
      assert_equal 2, opened.length
      assert opened.all?(&:finished?)
    end
  end

  def test_wrong_login_closes_the_new_connection
    capture_connections do |opened|
      error = assert_raises(RuntimeError) { connect("BE02_API_DATABASE_URL", "not_the_api_role") }
      assert_equal "wrong fixture/runtime login", error.message
      assert_equal 1, opened.length
      assert opened.fetch(0).finished?
    end
  end

  def test_timeout_initialization_failure_closes_the_new_connection
    connection = PG.connect(ENV.fetch("BE02_API_DATABASE_URL"))
    original_exec = connection.method(:exec)
    failure = RuntimeError.new("timeout setup failed")
    execute = lambda do |sql|
      raise failure if sql.start_with?("SET ")
      original_exec.call(sql)
    end
    connection.stub(:exec, execute) do
      PG.stub(:connect, connection) do
        assert_same failure, assert_raises(RuntimeError) { connect("BE02_API_DATABASE_URL", "elevateo_api") }
      end
    end
    assert connection.finished?
  ensure
    close_connections([connection])
  end

  def test_second_connection_failure_closes_the_first_connection
    original_connect = method(:connect)
    attempts = 0
    failure = RuntimeError.new("second connection failed")
    connect_or_fail = lambda do |*arguments|
      attempts += 1
      raise failure if attempts == 2
      original_connect.call(*arguments)
    end
    capture_connections do |opened|
      stub(:connect, connect_or_fail) do
        assert_same failure, assert_raises(RuntimeError) { with_api_connections(2) { flunk "unexpected body" } }
      end
      assert_equal 1, opened.length
      assert opened.fetch(0).finished?
    end
  end

  def test_refresh_thread_assertion_joins_peers_and_closes_all_connections
    create
    completed = Queue.new
    failure = Minitest::Assertion.new("refresh thread failed")
    capture_connections do |opened|
      raised = assert_raises(Minitest::Assertion) do
        parallel_api_calls(2) do |connection, index|
          result = invoke("claim_refresh", @digest, SecureRandom.uuid, connection: connection)
          completed << result.fetch("status")
          raise failure if index.zero?
          result
        end
      end
      assert_same failure, raised
      assert_equal 2, completed.size, "both refresh threads must finish before propagating the assertion"
      assert_equal %w[ok temporarily_unavailable], 2.times.map { completed.pop }.sort
      assert_equal 2, opened.length
      assert opened.all?(&:finished?)
    end
  end

  def test_second_fixture_owner_is_rejected_without_disturbing_the_first
    contender = SessionDatabaseTestCase.new("isolated_fixture_contender")
    error = assert_raises(RuntimeError) { contender.setup }
    assert_equal "database fixture already owned", error.message
    contender.teardown
    contender = nil
    assert_equal "ok", create.fetch("status")
    assert_exclusive_queue!
  ensure
    contender&.teardown
  end

  def test_foreign_queue_input_is_rejected_before_any_claim_mutation
    create
    invoke("revoke_session", @digest, "local")
    intent_id = revocation_intent_id
    before = @admin.exec_params("SELECT * FROM app_auth.revocation_intents WHERE id = $1", [intent_id]).first
    # AIDEV-NOTE: Temporarily relabel our committed sentinel as foreign, then restore ownership for fixture cleanup.
    @admin.exec_params("UPDATE app_auth.sessions SET user_id = $1 WHERE cookie_digest = $2", [SecureRandom.uuid, @digest])
    error = assert_raises(RuntimeError) { invoke("claim_revocations", SecureRandom.uuid, 20, connection: @worker) }
    assert_equal "foreign database worker input", error.message
    assert_equal before, @admin.exec_params("SELECT * FROM app_auth.revocation_intents WHERE id = $1", [intent_id]).first
  ensure
    @admin.exec_params("UPDATE app_auth.sessions SET user_id = $1 WHERE cookie_digest = $2", [@user, @digest])
  end

  def test_claim_requires_the_fixture_lock
    @admin.exec_params("SELECT pg_advisory_unlock($1::bigint)", [FIXTURE_LOCK])
    error = assert_raises(RuntimeError) { invoke("claim_revocations", SecureRandom.uuid, 1, connection: @worker) }
    assert_equal "database fixture ownership lost", error.message
  ensure
    assert_equal "t", @admin.exec_params("SELECT pg_try_advisory_lock($1::bigint)", [FIXTURE_LOCK]).getvalue(0, 0)
  end

  private

  def capture_connections
    opened = []
    original_connect = PG.method(:connect)
    capture = ->(*arguments) { original_connect.call(*arguments).tap { |connection| opened << connection } }
    PG.stub(:connect, capture) { yield opened }
  ensure
    close_connections(opened)
  end
end
