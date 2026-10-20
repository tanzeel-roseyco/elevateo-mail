# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/thread_folder_state"
require_relative "database_test_helper"

class ThreadFolderStateTest < Minitest::Test
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
    Elevateo::ThreadFolderState.new(connection: connection, identity: @identity, session: @session)
  end
  def row(folder: "inbox", snooze: nil, version: 0, updated: nil)
    { "folder" => folder, "snoozed_until" => snooze, "folder_version" => version, "updated_at" => updated }
  end

  def test_folder_move_and_repeat_noop
    changed = Connection.new([{}], [row], [row(folder: "archive", version: 1, updated: @time)])
    body = JSON.parse(service(changed).put_folder(thread_id: @thread,
      input: { "mailbox_id" => @box, "folder" => "archive" }).json)
    assert_equal ["archive", nil, 1], body.values_at("folder", "snoozed_until", "folder_version")
    repeat = Connection.new([{}], [row(folder: "archive", version: 1, updated: @time)])
    assert_equal 1, JSON.parse(service(repeat).put_folder(thread_id: @thread,
      input: { "mailbox_id" => @box, "folder" => "archive" }).json).fetch("folder_version")
    assert_equal 2, repeat.calls.length
  end

  def test_snooze_set_forces_inbox_clear_preserves_folder_and_repeat_is_noop
    future = (Time.now.utc + 120).iso8601
    set = Connection.new([{}], [row(folder: "archive")], [{ "valid" => true }],
      [row(snooze: future, version: 1, updated: @time)])
    body = JSON.parse(service(set).put_snooze(thread_id: @thread,
      input: { "mailbox_id" => @box, "snoozed_until" => future }).json)
    assert_equal ["inbox", future, 1], body.values_at("folder", "snoozed_until", "folder_version")
    clear = Connection.new([{}], [row(folder: "archive", snooze: future, version: 1, updated: @time)],
      [row(folder: "archive", version: 2, updated: @time)])
    assert_equal "archive", JSON.parse(service(clear).put_snooze(thread_id: @thread,
      input: { "mailbox_id" => @box, "snoozed_until" => nil }).json).fetch("folder")
    repeat = Connection.new([{}], [row(folder: "archive", version: 2, updated: @time)])
    assert_equal 2, JSON.parse(service(repeat).put_snooze(thread_id: @thread,
      input: { "mailbox_id" => @box, "snoozed_until" => nil }).json).fetch("folder_version")
    assert_equal 2, repeat.calls.length
  end

  def test_invalid_snooze_and_foreign_mailbox_are_rejected
    %w[2026-10-20T00:00:00+01:00 not-a-time].each do |value|
      error = assert_raises(Elevateo::CollaborationError) do
        service(Connection.new).put_snooze(thread_id: @thread,
          input: { "mailbox_id" => @box, "snoozed_until" => value })
      end
      assert_equal "request_invalid", error.code
    end
    connection = Connection.new([{}], [row], [{ "valid" => false }])
    error = assert_raises(Elevateo::CollaborationError) do
      service(connection).put_snooze(thread_id: @thread,
        input: { "mailbox_id" => @box, "snoozed_until" => "2026-10-20T00:01:00Z" })
    end
    assert_equal "request_invalid", error.code
    assert_includes connection.calls.fetch(1).first, "FOR UPDATE"
    assert_includes connection.calls.fetch(2).first, "current_clock"
    error = assert_raises(Elevateo::CollaborationError) do
      service(Connection.new([])).put_folder(thread_id: @thread,
        input: { "mailbox_id" => @box, "folder" => "trash" })
    end
    assert_equal "not_available", error.code
  end

  def test_maximum_folder_version_allows_noop_and_rejects_change
    maximum = row(folder: "archive", version: 2_147_483_647, updated: @time)
    unchanged = Connection.new([{}], [maximum])
    body = JSON.parse(service(unchanged).put_folder(thread_id: @thread,
      input: { "mailbox_id" => @box, "folder" => "archive" }).json)
    assert_equal 2_147_483_647, body.fetch("folder_version")

    changing = Connection.new([{}], [maximum])
    error = assert_raises(Elevateo::CollaborationError) do
      service(changing).put_folder(thread_id: @thread,
        input: { "mailbox_id" => @box, "folder" => "trash" })
    end
    assert_equal [503, "temporarily_unavailable"], [error.status, error.code]
    assert_equal 2, changing.calls.length
  end
end

# AIDEV-NOTE: One server-clock sample makes exact snooze endpoints deterministic instead of Ruby-clock dependent.
class ThreadFolderSnoozeBoundaryDatabaseTest < SessionDatabaseTestCase
  def test_database_clock_snooze_window_includes_exact_endpoints_only
    predicate = Elevateo::ThreadFolderState::VALID_SNOOZE_SQL
    assert_includes predicate, "value + interval '60 seconds'"
    assert_includes predicate, "value + interval '366 days'"
    rows = @admin.exec(<<~SQL).to_a
      WITH current_clock AS (SELECT clock_timestamp() AS value), cases(delta_seconds, expected) AS (
        VALUES (interval '60 seconds', true), (interval '59 seconds', false),
               (interval '366 days', true), (interval '366 days 1 second', false)
      )
      SELECT delta_seconds::text AS delta_seconds, expected,
             value + delta_seconds BETWEEN value + interval '60 seconds'
               AND value + interval '366 days' AS valid
        FROM current_clock CROSS JOIN cases ORDER BY delta_seconds
    SQL
    assert_equal 4, rows.length
    rows.each { |item| assert_equal item.fetch("expected"), item.fetch("valid"), item.fetch("delta_seconds") }
  end
end
