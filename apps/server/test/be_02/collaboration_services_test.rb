# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/thread_read_state"
require_relative "../../lib/elevateo/thread_assignment"
require_relative "../../lib/elevateo/thread_notes"

class CollaborationServicesTest < Minitest::Test
  Identity = Struct.new(:user_id, :org_id, :digest, keyword_init: true)
  Error = Elevateo::CollaborationError
  # AIDEV-NOTE: Unit rows exercise public services and wire budgets; database tests separately prove locking and RLS.
  class Connection
    attr_reader :calls
    def initialize(*replies) = (@replies, @calls = replies, [])
    def exec_query(sql, name, binds)
      @calls << [sql, name, binds.map(&:value_for_database)]
      raise "unexpected SQL" if @replies.empty?
      @replies.shift
    end
  end

  def setup
    @user, @org, @box, @thread, @note, @target = (1..6).map { |i| format("abcdefab-cdef-4abc-8def-%012d", i) }
    @identity = Identity.new(user_id: @user, org_id: @org, digest: "a" * 64)
    @session = { "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789" }
    @time = "2026-10-12T00:00:00.000001Z"
    @cursors = Elevateo::Cursors.new(secret: "disposable-collaboration-key-0001")
  end

  def service(type, connection)
    args = { connection: connection, identity: @identity, session: @session }
    args[:cursors] = @cursors if type == Elevateo::ThreadNotes
    type.new(**args)
  end

  def note_row(body = " note ")
    { "id" => @note, "organization_id" => @org, "mailbox_id" => @box, "thread_id" => @thread,
      "author_id" => @user, "body_text" => body, "version" => 1, "created_at" => @time }
  end

  def assert_code(code)
    assert_equal code, assert_raises(Error) { yield }.code
  end

  def test_read_state_initial_noop_changed_and_max_noop
    state = { "is_read" => true, "read_state_version" => 1, "updated_at" => @time }
    empty = Connection.new([{}], [])
    body = JSON.parse(service(Elevateo::ThreadReadState, empty).put(thread_id: @thread, input: { "mailbox_id" => @box, "read" => false }).json)
    assert_equal([false, 0, nil], %w[read read_state_version updated_at].map { |key| body.fetch(key) })
    assert_equal 2, empty.calls.length
    changed = Connection.new([{}], [], [state])
    assert_equal 1, JSON.parse(service(Elevateo::ThreadReadState, changed).put(thread_id: @thread, input: { "mailbox_id" => @box, "read" => true }).json)["read_state_version"]
    unchanged = Connection.new([{}], [state])
    result = service(Elevateo::ThreadReadState, unchanged).put(thread_id: @thread, input: { "mailbox_id" => @box, "read" => true })
    assert_equal([true, 1, @time], %w[read read_state_version updated_at].map { |key| JSON.parse(result.json).fetch(key) })
    assert_equal 2, unchanged.calls.length
    maximum = state.merge("read_state_version" => 2_147_483_647)
    maximum_connection = Connection.new([{}], [maximum])
    result = service(Elevateo::ThreadReadState, maximum_connection).put(thread_id: @thread, input: { "mailbox_id" => @box, "read" => true })
    assert_equal 200, result.status
    assert_equal([true, 2_147_483_647, @time], %w[read read_state_version updated_at].map { |key| JSON.parse(result.json).fetch(key) })
    assert_equal 2, maximum_connection.calls.length
    changing = Connection.new([{}], [maximum])
    error = assert_raises(Error) do
      service(Elevateo::ThreadReadState, changing).put(thread_id: @thread, input: { "mailbox_id" => @box, "read" => false })
    end
    assert_equal [503, "temporarily_unavailable"], [error.status, error.code]
    assert_equal 2, changing.calls.length
  end

  def test_read_state_rejects_non_boolean_unknown_actor_and_unavailable_thread
    [{ "mailbox_id" => @box, "read" => "false" }, { "mailbox_id" => @box, "read" => false, "user_id" => @target }].each do |input|
      assert_code("request_invalid") { service(Elevateo::ThreadReadState, Connection.new).put(thread_id: @thread, input: input) }
    end
    assert_code("not_available") do
      service(Elevateo::ThreadReadState, Connection.new([])).put(thread_id: @thread, input: { "mailbox_id" => @box, "read" => true })
    end
  end

  def test_assignment_eligibility_precedes_cas_and_stale_noop_conflicts
    input = { "mailbox_id" => @box, "assignee_id" => @target, "expected_assignment_version" => 0 }
    hidden = Connection.new([{}], [{ "eligible" => false }])
    assert_code("not_available") { service(Elevateo::ThreadAssignment, hidden).put(thread_id: @thread, input: input) }
    assert_equal [@identity.digest, @box, @target], hidden.calls.last.last
    row = { "assignee_id" => @target, "assignment_version" => 1, "updated_at" => @time }
    assert_code("assignment_conflict") do
      service(Elevateo::ThreadAssignment, Connection.new([{}], [{ "eligible" => true }], [], [row])).put(thread_id: @thread, input: input)
    end
    matched = Connection.new([{}], [{ "eligible" => true }], [], [row])
    result = service(Elevateo::ThreadAssignment, matched).put(thread_id: @thread,
      input: input.merge("expected_assignment_version" => 1.0))
    assert_equal([@target, 1, @time], %w[assignee_id assignment_version updated_at].map { |key| JSON.parse(result.json).fetch(key) })
    assert_equal 4, matched.calls.length
  end

  def test_assignment_initial_read_and_invalid_versions
    body = JSON.parse(service(Elevateo::ThreadAssignment, Connection.new([{}], [])).get(thread_id: @thread, query: { "mailbox_id" => @box }))
    assert_equal [nil, 0, nil], body.values_at("assignee_id", "assignment_version", "updated_at")
    [-1, 1.1, "1", 2_147_483_648, nil].each do |version|
      assert_code("request_invalid") do
        service(Elevateo::ThreadAssignment, Connection.new).put(thread_id: @thread,
          input: { "mailbox_id" => @box, "assignee_id" => nil, "expected_assignment_version" => version })
      end
    end
  end

  def test_note_first_exact_retry_mismatch_other_author_and_hidden
    [@box, @thread, @note].each { |id| refute_equal id, id.upcase }
    input = { "mailbox_id" => @box.upcase, "note_id" => @note.upcase, "body_text" => " note " }
    [[201, [[{}], [note_row]]], [200, [[{}], [], [note_row]]]].each do |status, replies|
      connection = Connection.new(*replies)
      result = service(Elevateo::ThreadNotes, connection).post(thread_id: @thread.upcase, input: input)
      assert_equal status, result.status
      body = JSON.parse(result.json)
      assert_equal [@box, @thread, @note], [body.fetch("mailbox_id"), body.fetch("thread_id"), body.fetch("note").fetch("id")]
      insert = connection.calls.find { |sql, _name, _binds| sql.include?("INSERT INTO app.thread_notes") }
      assert_equal [@org, @box, @thread, @note, @user, " note "], insert.last
      assert_equal [@org, @note], connection.calls.last.last if status == 200
    end
    [note_row("different"), note_row.merge("thread_id" => @target)].each do |row|
      assert_code("operation_mismatch") { service(Elevateo::ThreadNotes, Connection.new([{}], [], [row])).post(thread_id: @thread, input: input) }
    end
    [[note_row.merge("author_id" => @target)], []].each do |rows|
      error = assert_raises(Error) { service(Elevateo::ThreadNotes, Connection.new([{}], [], rows)).post(thread_id: @thread, input: input) }
      assert_equal [404, "This item is unavailable."], [error.status, error.message]
    end
    assert_code("not_available") { service(Elevateo::ThreadNotes, Connection.new([])).post(thread_id: @thread, input: input) }
  end

  def test_note_exact_unicode_whitespace_control_limits_and_empty_failure
    [" \t\n", "\u{1F48C}" * 4096, "\u0001" * 4096].each do |text|
      result = service(Elevateo::ThreadNotes, Connection.new([{}], [note_row(text)])).post(thread_id: @thread,
        input: { "mailbox_id" => @box, "note_id" => @note, "body_text" => text })
      assert_equal text, JSON.parse(result.json).fetch("note").fetch("body_text")
      assert_operator result.json.bytesize, :<=, 65_536
    end
    ["", "x" * 4097, "\u0000", nil].each do |body|
      assert_code("request_invalid") do
        service(Elevateo::ThreadNotes, Connection.new).post(thread_id: @thread,
          input: { "mailbox_id" => @box, "note_id" => @note, "body_text" => body })
      end
    end
  end

  def test_note_list_budget_cursor_scope_and_empty_page
    rows = (1..51).map { |i| note_row("\u0001" * 4096).merge("id" => format("00000000-0000-4000-8000-%012d", i)) }
    json = service(Elevateo::ThreadNotes, Connection.new([{}], rows)).list(thread_id: @thread, query: { "mailbox_id" => @box })
    page = JSON.parse(json)
    assert_operator json.bytesize, :<=, 262_144
    assert_operator page["items"].length, :<, 50
    refute_empty page["items"]
    query = { "mailbox_id" => @box, "cursor" => page.fetch("next_cursor") }
    next_page = Connection.new([{}], [])
    assert_empty JSON.parse(service(Elevateo::ThreadNotes, next_page).list(thread_id: @thread, query: query))["items"]
    assert_equal [page["items"].last["id"], @time], next_page.calls.last.last.slice(3, 2)
    assert_raises(Elevateo::Cursors::Invalid) { service(Elevateo::ThreadNotes, Connection.new([{}])).list(thread_id: @target, query: query) }
    assert_code("not_available") do
      service(Elevateo::ThreadNotes, Connection.new([])).list(thread_id: @thread, query: query.merge("cursor" => "invalid"))
    end
    assert_code("request_invalid") { service(Elevateo::ThreadNotes, Connection.new).list(thread_id: @thread, query: { "mailbox_id" => @box, "limit" => "51" }) }
  end
end
