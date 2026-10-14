# frozen_string_literal: true

require_relative "collaboration_controller_helper"

class CollaborationControllerTest < Minitest::Test
  include AuthFixtures
  include CollaborationControllerHarness

  def setup
    @service, @store, @client, @cookie = harness
    @connection = CollaborationControllerHarness::Connection.new(metadata)
  end

  def teardown
    refute @connection.transaction_open?
    assert_nil Thread.current[Elevateo::Tenancy::STACK_KEY]
  end

  def test_read_state_initial_false_and_closed_response
    @connection.rows = [[{ "id" => THREAD }], []]
    result = dispatch_collaboration(ReadStateController, "update", payload: { "mailbox_id" => BOX, "read" => false })
    assert_equal 200, result[0]
    assert_equal %w[authorization_version context_id mailbox_id read read_state_version thread_id updated_at], result[2].keys.sort
    assert_equal [false, 0, nil], result[2].values_at("read", "read_state_version", "updated_at")
    assert_equal "{}", @connection.guard_arguments.last
    assert_equal "no-store", result[1].fetch("cache-control")
    assert_equal "Cookie", result[1].fetch("vary")
    assert_equal "nosniff", result[1].fetch("x-content-type-options")
    refute @connection.sql.any? { |sql| sql.include?("INSERT INTO app.thread_read_states") }
  end

  def test_raw_malformed_duplicate_unknown_and_forged_actor_inputs_fail_before_auth
    ["{", '{"mailbox_id":"' + BOX + '","read":true,"read":false}',
      JSON.generate("mailbox_id" => BOX, "read" => true, "user_id" => TARGET),
      JSON.generate("mailbox_id" => BOX, "read" => 1)].each do |body|
      result = dispatch_collaboration(ReadStateController, "update", body: body)
      assert_equal [400, "request_invalid"], [result[0], result[2].fetch("code")]
      assert_empty @connection.events
      assert_empty @client.calls
    end
  end

  def test_actual_request_bytes_override_forged_content_length_for_each_write_budget
    budget_cases.each do |controller, action, cap, payload, rows, status|
      prefix = JSON.generate(payload)
      # AIDEV-NOTE: A complete valid prefix makes trusting Content-Length fail this oracle instead of JSON parsing.
      [cap.to_s, prefix.bytesize.to_s, nil].each do |length|
        @service, @store, @client, @cookie = harness
        @connection = CollaborationControllerHarness::Connection.new(metadata)
        @connection.rows = rows.dup
        at_cap = prefix + " " * (cap - prefix.bytesize)
        assert_equal cap, at_cap.bytesize
        result = dispatch_collaboration(controller, action, body: at_cap, headers: { "CONTENT_LENGTH" => length })
        assert_equal status, result[0]
        assert_equal :commit, @connection.events.last
        @service, @store, @client, @cookie = harness
        @connection = CollaborationControllerHarness::Connection.new(metadata)
        @connection.rows = rows.dup
        result = dispatch_collaboration(controller, action, body: at_cap + " ",
          headers: { "CONTENT_LENGTH" => length == cap.to_s ? (cap + 1).to_s : length })
        assert_equal [400, "request_invalid"], [result[0], result[2].fetch("code")]
        assert_empty @connection.events
        assert_empty @connection.sql
        assert_empty @client.calls
        assert_empty @collaboration_pool.timeouts
      end
    end
  end

  def test_assignment_supplies_target_guard_and_checks_eligibility_before_cas
    @connection.rows = [[{ "id" => THREAD }], [{ "eligible" => true }], [],
      [{ "assignee_id" => nil, "assignment_version" => 0, "updated_at" => nil }],
      [{ "assignee_id" => TARGET, "assignment_version" => 1, "updated_at" => TIME }]]
    result = dispatch_collaboration(AssignmentController, "update",
      payload: { "mailbox_id" => BOX, "assignee_id" => TARGET, "expected_assignment_version" => 0 })
    assert_equal 200, result[0]
    assert_equal TARGET, result[2].fetch("assignee_id")
    assert_equal "{#{TARGET}}", @connection.guard_arguments.last
    assert_operator @connection.sql.index { |sql| sql.include?("collaboration_reader") }, :<,
      @connection.sql.index { |sql| sql.include?("FOR UPDATE") }
  end

  def test_hidden_assignment_uses_generic_cd_error_and_rolls_back
    @connection.rows = [[]]
    result = dispatch_collaboration(AssignmentController, "update",
      payload: { "mailbox_id" => BOX, "assignee_id" => nil, "expected_assignment_version" => 0 })
    assert_equal 404, result[0]
    assert_equal({ "code" => "not_available", "message" => "This item is unavailable.", "request_id" => "collaboration-test" }, result[2])
    assert_includes @connection.events, :rollback
    assert_includes @connection.events, :disconnect
    assert_operator @connection.events.index(:rollback), :<, @connection.events.index(:disconnect)
  end

  def test_notes_post_preserves_maximum_escaped_text_with_larger_request_and_response_budget
    body = "\u0001" * 4096
    @connection.rows = [[{ "id" => THREAD }], [note_row(body)]]
    payload = { "mailbox_id" => BOX, "note_id" => NOTE, "body_text" => body }
    assert_operator JSON.generate(payload).bytesize, :>, 8192
    result = dispatch_collaboration(NotesController, "create", payload: payload)
    assert_equal 201, result[0]
    assert_equal body, result[2].fetch("note").fetch("body_text")
    assert_operator result[3].bytesize, :<=, 65_536
    assert_equal :commit, @connection.events.last
  end

  def test_assignment_and_notes_get_use_read_only_snapshots_without_business_writes
    [[AssignmentController, "show"], [NotesController, "index"]].each do |controller, action|
      @connection = CollaborationControllerHarness::Connection.new(metadata)
      @connection.rows = [[{ "id" => THREAD }], []]
      result = dispatch_collaboration(controller, action, query: "mailbox_id=#{BOX}")
      assert_equal 200, result[0]
      assert_includes @connection.sql, "SET TRANSACTION READ ONLY"
      refute_includes @connection.events, :guard
      refute @connection.sql.any? { |sql| sql.match?(/INSERT|UPDATE|DELETE/) }
    end
  end
end
