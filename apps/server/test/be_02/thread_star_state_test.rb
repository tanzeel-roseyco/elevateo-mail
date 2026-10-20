# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/thread_star_state"

class ThreadStarStateTest < Minitest::Test
  Identity = Struct.new(:user_id, :org_id, keyword_init: true)
  class Connection
    attr_reader :calls
    def initialize(*replies) = (@replies, @calls = replies, [])
    def exec_query(sql, _name, binds)
      @calls << [sql, binds.map(&:value_for_database)]
      raise "unexpected SQL" if @replies.empty?
      @replies.shift
    end
  end

  def setup
    @user, @org, @box, @thread = (1..4).map { |i| format("abcdefab-cdef-4abc-8def-%012d", i) }
    @identity = Identity.new(user_id: @user, org_id: @org)
    @session = { "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789" }
    @time = "2026-10-20T00:00:00.000001Z"
  end

  def service(connection)
    Elevateo::ThreadStarState.new(connection: connection, identity: @identity, session: @session)
  end

  def test_missing_false_changed_and_repeat_noop
    initial = Connection.new([{}], [{}], [])
    body = JSON.parse(service(initial).put(thread_id: @thread,
      input: { "mailbox_id" => @box, "starred" => false }).json)
    assert_equal [false, 0, nil], body.values_at("starred", "star_version", "updated_at")
    saved = { "starred" => true, "star_version" => 1, "updated_at" => @time }
    changed = Connection.new([{}], [{}], [], [saved])
    assert_equal 1, JSON.parse(service(changed).put(thread_id: @thread,
      input: { "mailbox_id" => @box, "starred" => true }).json).fetch("star_version")
    repeat = Connection.new([{}], [{}], [saved])
    assert_equal 1, JSON.parse(service(repeat).put(thread_id: @thread,
      input: { "mailbox_id" => @box, "starred" => true }).json).fetch("star_version")
    assert_equal 3, repeat.calls.length
  end

  def test_invalid_body_and_foreign_mailbox_are_rejected
    [{ "mailbox_id" => @box, "starred" => "true" },
     { "mailbox_id" => @box, "starred" => true, "user_id" => @user }].each do |input|
      error = assert_raises(Elevateo::CollaborationError) do
        service(Connection.new).put(thread_id: @thread, input: input)
      end
      assert_equal "request_invalid", error.code
    end
    error = assert_raises(Elevateo::CollaborationError) do
      service(Connection.new([])).put(thread_id: @thread,
        input: { "mailbox_id" => @box, "starred" => true })
    end
    assert_equal "not_available", error.code
  end

  def test_maximum_version_allows_noop_and_rejects_change
    maximum = { "starred" => true, "star_version" => 2_147_483_647, "updated_at" => @time }
    unchanged = Connection.new([{}], [{}], [maximum])
    result = service(unchanged).put(thread_id: @thread,
      input: { "mailbox_id" => @box, "starred" => true })
    assert_equal 2_147_483_647, JSON.parse(result.json).fetch("star_version")
    assert_equal 3, unchanged.calls.length

    changing = Connection.new([{}], [{}], [maximum])
    error = assert_raises(Elevateo::CollaborationError) do
      service(changing).put(thread_id: @thread,
        input: { "mailbox_id" => @box, "starred" => false })
    end
    assert_equal [503, "temporarily_unavailable"], [error.status, error.code]
    assert_equal 3, changing.calls.length
  end

  def test_conflicting_unchanged_upsert_returns_existing_version_without_advancing
    stored = { "starred" => true, "star_version" => 9, "updated_at" => @time }
    connection = Connection.new([{}], [{}], [], [stored])
    body = JSON.parse(service(connection).put(thread_id: @thread,
      input: { "mailbox_id" => @box, "starred" => true }).json)
    assert_equal [true, 9], body.values_at("starred", "star_version")
    assert_includes connection.calls.last.first, "IS DISTINCT FROM"
  end

  def test_conflicting_changed_upsert_at_maximum_returns_domain_unavailable
    stored = { "starred" => false, "star_version" => 2_147_483_647, "updated_at" => @time }
    connection = Connection.new([{}], [{}], [], [stored])
    error = assert_raises(Elevateo::CollaborationError) do
      service(connection).put(thread_id: @thread,
        input: { "mailbox_id" => @box, "starred" => true })
    end
    assert_equal [503, "temporarily_unavailable"], [error.status, error.code]
    assert_includes connection.calls.last.first, "star_version < 2147483647"
  end
end
