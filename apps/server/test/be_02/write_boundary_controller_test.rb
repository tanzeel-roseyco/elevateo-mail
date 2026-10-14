# frozen_string_literal: true

require_relative "write_boundary_test_helper"

class WriteBoundaryControllerTest < Minitest::Test
  include AuthFixtures
  include WriteBoundaryHarness

  def setup
    @service, @store, @client, @cookie = harness
    @connection = WriteBoundaryHarness::Connection.new(metadata)
    @operation = lambda do |**inputs|
      assert @connection.transaction_open?
      @seen = inputs
      @connection.events << :business
      @connection.business << :saved
      Elevateo::WriteResponse.new(json: '{"saved":true}', status: 200)
    end
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def test_auth_http_precedes_transaction_and_business_follows_guard
    original = @client.method(:user)
    @client.define_singleton_method(:user) do |*args, **kwargs|
      raise "Auth HTTP under SQL locks" if ActiveRecord::Base.connection_pool.connection.transaction_open?
      original.call(*args, **kwargs)
    end
    result = dispatch
    assert_equal 200, result[0]
    assert_equal({ "saved" => true }, result[2])
    assert_equal %i[begin guard business commit], @connection.events
    assert_equal [:saved], @connection.business
    assert_equal({ "value" => true }, @seen.fetch(:input))
    assert_equal "no-store", result[1].fetch("cache-control")
    assert_equal "Cookie", result[1].fetch("vary")
    assert_equal "nosniff", result[1].fetch("x-content-type-options")
    refute(@store.calls.any? { |name, _| name == "touch_session" })
  end

  def test_keyword_target_callable_and_bodyless_delete
    target = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    guard = lambda do |input:, query:|
      assert_empty input
      [query.fetch("target")]
    end
    assert_equal 200, dispatch(method: "DELETE", body: "", query: "target=#{target}",
      options: { body: false, guard_users: guard })[0]
    assert_equal "{#{target}}", @connection.guard_arguments.last
  end

  def test_actual_bytes_override_missing_zero_and_understated_content_length
    wire = JSON.generate("value" => "é")
    [nil, "0", "1"].each do |claimed|
      @connection = WriteBoundaryHarness::Connection.new(metadata)
      result = dispatch(body: wire, headers: { "CONTENT_LENGTH" => claimed }, options: { max_bytes: wire.bytesize })
      assert_equal 200, result[0]
      assert_equal({ "value" => "é" }, @seen.fetch(:input))
      assert_equal [:saved], @connection.business
      assert_equal :commit, @connection.events.last
    end
  end

  def test_overflow_delete_body_and_encoding_fail_without_work
    wire = JSON.generate("value" => "é")
    cases = [nil, "0", "1"].map do |claimed|
      { body: wire, headers: { "CONTENT_LENGTH" => claimed }, options: { max_bytes: wire.bytesize - 1 } }
    end
    cases << { method: "DELETE", body: "x", options: { body: false } }
    cases << { headers: { "HTTP_CONTENT_ENCODING" => "gzip" } }
    cases.each do |arguments|
      assert_error(400, "request_invalid", dispatch(**arguments))
      assert_empty @client.calls
      assert_empty @store.calls
      assert_empty @connection.events
      assert_empty @connection.sql
      assert_empty @connection.business
      assert_nil @seen
    end
  end

  def test_transport_and_proofs_fail_before_auth
    [{ headers: { "HTTP_ORIGIN" => "https://evil.test" } }, { body: '{"value":1,"value":2}' },
      { body: "x", options: { body: false } }, { headers: { "HTTP_X_CSRF_TOKEN" => nil } },
      { headers: { "HTTP_X_SESSION_CONTEXT" => "bad" } },
      { body: '{"value":true}extra', headers: { "CONTENT_LENGTH" => "1" }, options: { max_bytes: 14 } }].each do |options|
      assert_error(400, "request_invalid", dispatch(**options))
      assert_empty @connection.events
      assert_empty @client.calls
    end
  end

  def test_current_invalid_session_precedes_stale_context
    @connection.metadata = { "status" => "unauthorized" }
    assert_error(401, "unauthenticated", dispatch(headers: { "HTTP_X_SESSION_CONTEXT" => "x" * 36 }))
    assert_equal %i[begin guard rollback disconnect], @connection.events
    assert_empty @connection.business
  end

  def test_fractional_versions_reach_field_validation_without_rounding
    @operation = lambda do |input:, **_inputs|
      Elevateo::WriteInput.integer(input.fetch("value"), minimum: 0, maximum: 2_147_483_647)
      @connection.business << :saved
      Elevateo::WriteResponse.new(json: '{"saved":true}', status: 200)
    end
    %w[0.99999999999999999 1e-400 -1e-400 2147483647.0000001].each do |token|
      @connection = WriteBoundaryHarness::Connection.new(metadata)
      assert_error(400, "request_invalid", dispatch(body: '{"value":' + token + '}'))
      assert_equal %i[begin guard rollback disconnect], @connection.events
      assert_empty @connection.business
    end
    @connection = WriteBoundaryHarness::Connection.new(metadata)
    assert_equal 200, dispatch(body: '{"value":10e-1}')[0]
    assert_equal [:saved], @connection.business
    assert_equal :commit, @connection.events.last
  end

  def test_context_generation_and_csrf_are_rechecked_under_guards
    ["context_id", "authorization_generation", "csrf_token"].each do |key|
      @connection = WriteBoundaryHarness::Connection.new(metadata)
      @connection.before_guard = -> { @connection.metadata[key] = key == "authorization_generation" ? 2 : "y" * 43 }
      assert_error(key == "csrf_token" ? 400 : 409, key == "csrf_token" ? "request_invalid" : "context_changed", dispatch)
      assert_equal %i[begin guard rollback disconnect], @connection.events
      assert_empty @connection.business
    end
  end

  def test_current_authority_denial_uses_cd_message
    @connection.metadata = { "status" => "not_found" }
    result = dispatch
    assert_error(404, "not_available", result)
    assert_equal "This item is unavailable.", result[2].fetch("message")
  end

  def test_direct_helper_cannot_opt_into_proof_free_lifecycle_behavior
    identity = @service.authenticate(cookie: @cookie, deadline: deadline)
    error = ActiveRecord::Base.stub(:connection_pool, WriteBoundaryHarness::Pool.new(@connection)) do
      assert_raises(Elevateo::CollaborationError) do
        Elevateo::SessionWrites.new(sessions: @service).transaction(identity, context: nil, version: nil,
          csrf: metadata.fetch("csrf_token"), guard_users: [], budget: 4096, deadline: deadline, &@operation)
      end
    end
    assert_equal "request_invalid", error.code
    assert_equal %i[begin guard rollback disconnect], @connection.events
    assert_empty @connection.business
  end

  def test_validation_exception_rolls_back_business
    @operation = lambda do |**_inputs|
      @connection.business << :saved
      raise Elevateo::CollaborationError.new("not_available")
    end
    assert_error(404, "not_available", dispatch)
    assert_empty @connection.business
    assert_equal %i[rollback disconnect], @connection.events.last(2)
  end

  def test_malformed_serialization_rolls_back_before_commit
    ["x", '{"secret":"\u0000"}', "null"].each do |wire|
      @operation = lambda do |**_inputs|
        @connection.business << :saved
        Elevateo::WriteResponse.new(json: wire, status: 200)
      end
      assert_error(500, "internal_error", dispatch)
      assert_empty @connection.business
      assert_equal %i[rollback disconnect], @connection.events.last(2)
    end
  end

  def test_valid_serialized_objects_enforce_exact_response_byte_budget
    # AIDEV-NOTE: Valid objects isolate byte-budget enforcement from malformed JSON and Unicode rejection.
    ["plain", "é\"\\"].each do |prefix|
      [4096, 4097].each do |size|
        @connection = WriteBoundaryHarness::Connection.new(metadata)
        padding = size - JSON.generate("value" => prefix).bytesize
        wire = JSON.generate("value" => prefix + "x" * padding)
        assert_equal size, wire.bytesize
        expected = JSON.parse(wire)
        assert_kind_of Hash, expected
        @operation = lambda do |**_inputs|
          @connection.business << :saved
          Elevateo::WriteResponse.new(json: wire, status: 200)
        end
        result = dispatch
        if size == 4096
          assert_equal 200, result[0]
          assert_equal expected, result[2]
          assert_equal [:saved], @connection.business
          assert_equal :commit, @connection.events.last
        else
          assert_error(500, "internal_error", result)
          assert_empty @connection.business
          assert_equal %i[rollback disconnect], @connection.events.last(2)
        end
      end
    end
  end

  def test_explicit_rollback_is_never_success
    @operation = ->(**_inputs) { @connection.business << :saved; raise ActiveRecord::Rollback }
    assert_error(500, "internal_error", dispatch)
    assert_empty @connection.business
  end

  def test_terminal_conflict_commits_its_ledger
    @operation = lambda do |**_inputs|
      @connection.business << :terminal_ledger
      error = Elevateo::CollaborationError.new("draft_conflict")
      Elevateo::WriteResponse.new(json: JSON.generate(error.body("be02-write-test")), status: error.status)
    end
    assert_error(409, "draft_conflict", dispatch)
    assert_equal [:terminal_ledger], @connection.business
    assert_equal :commit, @connection.events.last
  end

  def test_expiry_after_boundary_return_suppresses_protected_payload
    writer = Elevateo::SessionWrites.new(sessions: @service)
    original = writer.method(:transaction)
    writer.define_singleton_method(:transaction) do |*args, **keywords, &operation|
      result = original.call(*args, **keywords, &operation)
      keywords.fetch(:deadline).define_singleton_method(:check!) { raise Elevateo::AuthError.new }
      result
    end
    result = Elevateo::SessionWrites.stub(:new, writer) { dispatch }
    assert_error(503, "temporarily_unavailable", result)
    refute result[2].key?("saved")
    assert_equal [:saved], @connection.business, "expiry is not proof that COMMIT failed"
  end

  private

  def assert_error(status, code, result)
    assert_equal status, result[0]
    assert_equal code, result[2].fetch("code")
    assert_equal Elevateo::CollaborationError.new(code).message, result[2].fetch("message")
    assert_equal "be02-write-test", result[2].fetch("request_id")
    assert_equal %w[code message request_id], result[2].keys.sort
  end
end
