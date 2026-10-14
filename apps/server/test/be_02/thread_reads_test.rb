# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/thread_reads"

class ThreadReadsTest < Minitest::Test
  Identity = Struct.new(:user_id, :org_id, keyword_init: true)
  Invalid = Elevateo::ThreadReads::InvalidQuery
  FIXTURES = File.expand_path("../../../../contracts/v1/fixtures.json", __dir__)

  # AIDEV-NOTE: Canned bounded rows test orchestration and serialization; PostgreSQL tests prove SQL ordering/RLS.
  class Connection
    attr_reader :calls
    def initialize(*replies)
      @replies, @calls = replies, []
    end

    def exec_query(sql, name, binds)
      @calls << [sql, name, binds.map(&:value_for_database)]
      raise "unexpected query" if @replies.empty?

      @replies.shift
    end
  end

  def setup
    @examples = JSON.parse(File.read(FIXTURES)).fetch("examples")
    @session = @examples.fetch("session_a").fetch("body")
    @identity = Identity.new(user_id: @session.fetch("actor").fetch("id"), org_id: @session.fetch("organization").fetch("id"))
    @cursors = Elevateo::Cursors.new(secret: "disposable-thread-tests-key-000001")
    @mailbox = @examples.fetch("threads").fetch("body").fetch("mailbox_id")
    @thread = @examples.fetch("thread_hostile_plaintext").fetch("body").fetch("thread").fetch("id")
  end

  def reader(connection)
    Elevateo::ThreadReads.new(connection: connection, identity: @identity, session: @session, cursors: @cursors)
  end

  def summary_row
    @examples.fetch("threads").fetch("body").fetch("items").first
  end

  def test_canonical_list_empty_and_plaintext_detail_fixtures
    connection = Connection.new([{ "id" => @mailbox }], [summary_row])
    assert_equal @examples.fetch("threads").fetch("body"), JSON.parse(reader(connection).list(mailbox_id: @mailbox, query: {}))
    assert_equal [@identity.org_id, @mailbox, @identity.user_id, "all", nil, nil, "51"], connection.calls.last.last
    assert_equal @examples.fetch("threads_empty").fetch("body"), JSON.parse(reader(Connection.new([{}], [])).list(mailbox_id: @mailbox, query: {}))
    %w[thread_hostile_plaintext thread_empty].each do |key|
      expected = @examples.fetch(key).fetch("body")
      messages = expected.fetch("messages").map { |item| item.merge("recipients" => item.fetch("to")) }
      connection = Connection.new([expected.fetch("thread")], messages)
      actual = reader(connection).detail(thread_id: expected.fetch("thread").fetch("id"), query: { "mailbox_id" => @mailbox })
      assert_equal expected, JSON.parse(actual)
      assert_equal "21", connection.calls.last.last.last
      connection.calls.each do |sql, _, values|
        refute_match(/\b(?:INSERT|UPDATE|DELETE)\b/i, sql)
        values.compact.each { |value| refute_includes sql, value if value.length > 30 }
      end
    end
  end

  def test_cursor_uses_last_included_timestamp_and_id
    row = summary_row.merge("last_message_at" => "2026-10-12T00:00:00.123456Z")
    first = JSON.parse(reader(Connection.new([{}], [row, row])).list(mailbox_id: @mailbox, query: { "limit" => "1" }))
    connection = Connection.new([{}], [])
    reader(connection).list(mailbox_id: @mailbox, query: { "limit" => "1", "cursor" => first.fetch("next_cursor") })
    assert_equal [@thread, "2026-10-12T00:00:00.123456Z"], connection.calls.last.last.slice(4, 2)
    assert_nil JSON.parse(reader(Connection.new([{}], [row])).list(mailbox_id: @mailbox, query: {})).fetch("next_cursor")
  end

  def test_cursor_rejects_tampering_and_all_scope_changes_before_sql
    first = JSON.parse(reader(Connection.new([{}], [summary_row, summary_row])).list(mailbox_id: @mailbox, query: { "limit" => "1" }))
    token = first.fetch("next_cursor")
    attempts = [{ "limit" => "2", "cursor" => token }, { "limit" => "1", "filter" => "unread", "cursor" => token },
                { "limit" => "1", "cursor" => token.sub(".", ".X") }]
    attempts.each do |query|
      assert_raises(Elevateo::Cursors::Invalid) { reader(Connection.new).list(mailbox_id: @mailbox, query: query) }
    end
    %w[context_id authorization_version].each do |key|
      old = @session[key]
      @session[key] = "changed_scope_0123456789"
      assert_raises(Elevateo::Cursors::Invalid) { reader(Connection.new).list(mailbox_id: @mailbox, query: { "limit" => "1", "cursor" => token }) }
      @session[key] = old
    end
    %i[user_id org_id].each do |key|
      old = @identity[key]
      @identity[key] = "ffffffff-ffff-4fff-8fff-ffffffffffff"
      assert_raises(Elevateo::Cursors::Invalid) { reader(Connection.new).list(mailbox_id: @mailbox, query: { "limit" => "1", "cursor" => token }) }
      @identity[key] = old
    end
    assert_raises(Elevateo::Cursors::Invalid) { reader(Connection.new).list(mailbox_id: @thread, query: { "limit" => "1", "cursor" => token }) }
    assert_raises(Elevateo::Cursors::Invalid) { reader(Connection.new).detail(thread_id: @thread, query: { "mailbox_id" => @mailbox, "limit" => "1", "cursor" => token }) }
  end

  def test_list_byte_budget_keeps_whole_entries_and_included_cursor
    address = { "display_name" => "\u0001" * 256, "address" => "\u0001" * 256 }
    rows = (1..51).map do |number|
      summary_row.merge("id" => format("00000000-0000-4000-8000-%012d", 100 - number),
                        "subject" => "\u0001" * 256, "sender" => address, "preview_text" => "\u0001" * 256)
    end
    body = reader(Connection.new([{}], rows)).list(mailbox_id: @mailbox, query: {})
    page = JSON.parse(body)
    assert_operator body.bytesize, :<=, 262_144
    assert_operator page.fetch("items").length, :<, 50
    refute_empty page.fetch("items")
    connection = Connection.new([{}], [])
    reader(connection).list(mailbox_id: @mailbox, query: { "cursor" => page.fetch("next_cursor") })
    assert_equal page.fetch("items").last.fetch("id"), connection.calls.last.last.fetch(4)
  end

  def test_detail_cursor_cannot_cross_thread_and_authenticated_bad_positions_are_rejected
    source = @examples.fetch("thread_hostile_plaintext").fetch("body")
    row = source.fetch("messages").first.merge("recipients" => [])
    first = JSON.parse(reader(Connection.new([source.fetch("thread")], [row, row])).detail(
      thread_id: @thread, query: { "mailbox_id" => @mailbox, "limit" => "1" }))
    assert_raises(Elevateo::Cursors::Invalid) do
      reader(Connection.new).detail(thread_id: @mailbox, query: { "mailbox_id" => @mailbox, "limit" => "1", "cursor" => first.fetch("next_cursor") })
    end
    scope = @session.slice("context_id", "authorization_version").merge(
      "actor_id" => @identity.user_id, "organization_id" => @identity.org_id, "resource" => "threads",
      "filters" => { "mailbox_id" => @mailbox, "filter" => "all" },
      "order" => "last_message_at:desc:nulls_last,id:desc", "limit" => 1)
    [{ "id" => nil, "last_message_at" => nil }, { "id" => @thread },
     { "id" => @thread, "last_message_at" => "2026-02-30T00:00:00Z" }].each do |position|
      token = @cursors.encode(position: position, scope: scope)
      assert_raises(Elevateo::Cursors::Invalid) do
        reader(Connection.new).list(mailbox_id: @mailbox, query: { "limit" => "1", "cursor" => token })
      end
    end
  end

  def test_detail_byte_budget_uses_message_key_and_nullable_timestamp_cursor
    source = @examples.fetch("thread_hostile_plaintext").fetch("body")
    address = { "display_name" => "\u0001" * 256, "address" => "\u0001" * 256 }
    messages = (1..21).map do |number|
      { "id" => format("00000000-0000-4000-8000-%012d", number), "sender" => address,
        "recipients" => Array.new(100) { address }, "body_text" => "\u0001" * 16_385,
        "sent_at" => nil, "attachment_count" => 1000 }
    end
    body = reader(Connection.new([source.fetch("thread")], messages)).detail(thread_id: @thread, query: { "mailbox_id" => @mailbox })
    page = JSON.parse(body)
    assert_operator body.bytesize, :<=, 2_097_152
    assert_operator page.fetch("messages").length, :<, 20
    refute page.key?("items")
    connection = Connection.new([source.fetch("thread")], [])
    reader(connection).detail(thread_id: @thread, query: { "mailbox_id" => @mailbox, "cursor" => page.fetch("next_cursor") })
    assert_equal [page.fetch("messages").last.fetch("id"), nil], connection.calls.last.last.slice(3, 2)
    assert(page.fetch("messages").all? { |message| message.fetch("body_truncated") })
  end

  def test_invalid_query_and_missing_resources_have_deliberate_errors
    [{ "limit" => "0" }, { "limit" => "51" }, { "limit" => "1;SELECT 1" }, { "limit" => "01" },
     { "filter" => "private" }, { "cursor" => "" }, { "cursor" => "x" * 2049 }, { "organization_id" => @identity.org_id }].each do |query|
      assert_raises(Invalid) { reader(Connection.new).list(mailbox_id: @mailbox, query: query) }
    end
    assert_raises(Invalid) { reader(Connection.new).detail(thread_id: @thread, query: {}) }
    assert_raises(Invalid) { reader(Connection.new).detail(thread_id: @thread, query: { "mailbox_id" => @mailbox, "limit" => "21" }) }
    assert_raises(Invalid) { reader(Connection.new).list(mailbox_id: "not-a-uuid", query: {}) }
    assert_raises(Elevateo::ThreadReads::NotAvailable) { reader(Connection.new([])).list(mailbox_id: @mailbox, query: {}) }
    assert_raises(Elevateo::ThreadReads::NotAvailable) { reader(Connection.new([])).detail(thread_id: @thread, query: { "mailbox_id" => @mailbox }) }
  end
end
