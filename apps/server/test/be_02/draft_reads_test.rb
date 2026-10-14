# frozen_string_literal: true

require "active_record"
require "minitest/autorun"
require_relative "../../lib/elevateo/draft_operations"

class DraftReadsTest < Minitest::Test
  ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  BOX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  Identity = Struct.new(:user_id, :org_id, keyword_init: true)
  class Connection
    attr_reader :calls
    def initialize(*results) = (@results, @calls = results, [])
    def exec_query(sql, _name, binds)
      @calls << [sql, binds.map(&:value_for_database)]
      raise "unexpected query" if @results.empty?
      @results.shift
    end
  end

  def setup
    @identity = Identity.new(user_id: ID, org_id: BOX)
    @session = { "context_id" => "context_0123456789", "authorization_version" => "version_0123456789" }
    @cursors = Elevateo::Cursors.new(secret: "disposable-draft-key-00000000000001")
  end

  def row
    { "id" => ID, "mailbox_id" => BOX, "subject" => "", "recipients" => "[]", "body_text" => "",
      "reply_to_thread_id" => nil, "version" => 1, "state" => "editable",
      "created_at" => "2026-10-12T00:00:00Z", "updated_at" => "2026-10-12T00:00:00Z" }
  end

  def reader(connection)
    Elevateo::Drafts.new(connection: connection, identity: @identity, session: @session, cursors: @cursors)
  end

  def test_full_draft_is_untruncated_and_empty_values_survive
    item = row.merge("body_text" => "\u0001" * 65_536, "subject" => "\u{1F48C}" * 998,
      "recipients" => JSON.generate([{ "display_name" => nil, "address" => "" }]))
    connection = Connection.new([{ "allowed" => true }], [item])
    wire = reader(connection).detail(draft_id: ID, query: { "mailbox_id" => BOX })
    result = JSON.parse(wire).fetch("draft")
    assert_equal item.fetch("body_text"), result.fetch("body_text")
    assert_equal item.fetch("subject"), result.fetch("subject")
    assert_equal [{ "display_name" => nil, "address" => "" }], result.fetch("to")
    assert_operator wire.bytesize, :<=, 2_097_152
  end

  def test_summary_truncation_whole_entries_and_signed_seek
    # AIDEV-NOTE: Distinct lookahead tuples detect accidentally signing the excluded row as the next position.
    lookahead = row.merge("id" => BOX, "updated_at" => "2026-10-11T00:00:00Z")
    connection = Connection.new([{ "allowed" => true }], [row.merge("subject" => "\u{1F48C}" * 257), lookahead])
    page = JSON.parse(reader(connection).list(query: { "mailbox_id" => BOX, "limit" => "1" }))
    item = page.fetch("items").first
    assert_equal 256, item.fetch("subject").length
    assert item.fetch("subject_truncated")
    refute item.key?("to")
    refute item.key?("body_text")
    next_connection = Connection.new([{ "allowed" => true }], [lookahead])
    second = JSON.parse(reader(next_connection).list(query: { "mailbox_id" => BOX, "limit" => "1", "cursor" => page.fetch("next_cursor") }))
    assert_equal([ID, BOX], (page.fetch("items") + second.fetch("items")).map { |entry| entry.fetch("id") })
    assert_nil second.fetch("next_cursor")
    assert_equal [ID, row.fetch("updated_at"), "2"], next_connection.calls.last.last.last(3)
    assert_raises(Elevateo::Cursors::Invalid) do
      reader(Connection.new([{ "allowed" => true }])).list(query: { "mailbox_id" => BOX, "limit" => "2", "cursor" => page.fetch("next_cursor") })
    end
  end

  def test_scope_denial_precedes_cursor_and_absent_direct_get_is_unavailable
    connection = Connection.new([{ "allowed" => false }])
    error = assert_raises(Elevateo::CollaborationError) do
      reader(connection).list(query: { "mailbox_id" => BOX, "cursor" => "bad" })
    end
    assert_equal "not_available", error.code
    assert_equal 1, connection.calls.length
    absent = assert_raises(Elevateo::CollaborationError) do
      reader(Connection.new([{ "allowed" => true }], [])).detail(draft_id: ID, query: { "mailbox_id" => BOX })
    end
    assert_equal ["not_available", 404, "This item is unavailable."], [absent.code, absent.status, absent.message]
  end

  def test_recorded_conflict_metadata_is_a_successful_lookup_not_an_http_error
    operation = { "operation_id" => ID, "mailbox_id" => BOX, "draft_id" => ID, "outcome" => "conflict",
      "code" => "draft_conflict", "expected_version" => 7, "current_version" => 0, "state" => nil,
      "recorded_at" => "2026-10-12T00:00:00Z", "detail_expires_at" => "2026-10-19T00:00:00Z" }
    service = Elevateo::DraftOperations.new(connection: Connection.new([{ "result" => JSON.generate(operation) }]), session: @session)
    assert_equal operation, JSON.parse(service.lookup(operation_id: ID, query: { "mailbox_id" => BOX, "draft_id" => ID })).fetch("operation")
  end

  def test_terminal_save_conflict_is_serialized_with_the_current_request_id
    body = { "mailbox_id" => BOX, "operation_id" => ID, "expected_version" => 0,
      "subject" => "", "to" => [], "body_text" => "", "reply_to_thread_id" => nil }
    service = Elevateo::DraftOperations.new(connection: Connection.new([{ "result" => '{"code":"draft_conflict"}' }]), session: @session)
    response = service.save(Elevateo::Drafts::Payload.new(draft_id: ID, input: body),
      session_digest: "f" * 64, request_id: "current-request")
    assert_equal 409, response.status
    assert_equal "current-request", JSON.parse(response.json).fetch("request_id")
  end

  def test_nonterminal_failures_raise_instead_of_committing_write_responses
    body = { "mailbox_id" => BOX, "operation_id" => ID, "expected_version" => 0,
      "subject" => "", "to" => [], "body_text" => "", "reply_to_thread_id" => nil }
    payload = Elevateo::Drafts::Payload.new(draft_id: ID, input: body)
    %w[request_invalid unauthenticated not_available context_changed temporarily_unavailable].each do |code|
      connection = Connection.new([{ "result" => JSON.generate({ "code" => code }) }])
      service = Elevateo::DraftOperations.new(connection: connection, session: @session)
      error = assert_raises(Elevateo::CollaborationError) do
        service.save(payload, session_digest: "f" * 64, request_id: "current-request")
      end
      assert_equal code, error.code
    end
  end

  def test_empty_or_oversized_cursor_is_a_cursor_error_after_scope_check
    ["", "a" * 2049].each do |cursor|
      assert_raises(Elevateo::Cursors::Invalid) do
        reader(Connection.new([{ "allowed" => true }])).list(query: { "mailbox_id" => BOX, "cursor" => cursor })
      end
    end
  end
end
