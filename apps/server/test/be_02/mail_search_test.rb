# frozen_string_literal: true

require_relative "mailbox_membership_test_helper"

class MailSearchTest < MailboxMembershipUnitCase
  def test_preserves_exact_query_and_escapes_literal_wildcards_in_bound_value
    term = "  %_\\ Needle 💌  "
    connection = Connection.new([summary_row])
    body = JSON.parse(search(connection, "q" => term))
    assert_equal term, body.fetch("q")
    assert_nil body.fetch("mailbox_id")
    assert_equal [summary_row], body.fetch("items")
    assert_equal "%  \\%\\_\\\\ Needle 💌  %", connection.calls.first.last.fetch(3)
    refute_includes connection.calls.first.first, term
    assert_nil body.fetch("next_cursor")
  end

  def test_unicode_scalar_and_query_bounds_reject_only_whitespace_only_searches
    invalid = [nil, "", "\u0000", "\xff".b.force_encoding(Encoding::UTF_8), "💌" * 257,
               "\t\n\r \u0085\u00a0\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000"]
    invalid.each { |term| assert_code("request_invalid") { search(Connection.new, "q" => term) } }
    ["💌" * 256, "\u200b", "\u0001", " a "].each do |term|
      assert_equal term, JSON.parse(search(Connection.new([]), "q" => term)).fetch("q")
    end
    [{ "limit" => "0" }, { "limit" => "51" }, { "limit" => "01" },
     { "mailbox_id" => "bad" }, { "filter" => "unread" }].each do |query|
      assert_code("request_invalid") { search(Connection.new, query) }
    end
  end

  def test_unavailable_explicit_mailbox_precedes_cursor_validation
    # AIDEV-NOTE: Every invalid cursor form must remain subordinate to current mailbox visibility.
    ["invalid", "", "x" * 2049].each do |cursor|
      connection = Connection.new([])
      error = assert_raises(Error) { search(connection, "mailbox_id" => @box, "cursor" => cursor) }
      assert_equal [404, "not_available", "This item is unavailable."], [error.status, error.code, error.message]
      assert_equal 1, connection.calls.length
    end
    connection = Connection.new([{}], [])
    assert_empty JSON.parse(search(connection, "mailbox_id" => @box)).fetch("items")
    assert_equal @box, connection.calls.last.last.fetch(1)
  end

  def test_invalid_cursor_forms_use_cursor_error_after_visible_mailbox_check
    ["invalid", "", "x" * 2049].each do |cursor|
      [nil, @box].each do |mailbox|
        connection = mailbox ? Connection.new([{}]) : Connection.new
        query = { "cursor" => cursor }
        query["mailbox_id"] = mailbox if mailbox
        error = assert_raises(Error) { search(connection, query) }
        assert_equal [400, "cursor_invalid"], [error.status, error.code]
        assert_equal(mailbox ? 1 : 0, connection.calls.length)
      end
    end
  end

  def test_cursor_binds_exact_query_mailbox_limit_and_current_authority
    token = JSON.parse(search(Connection.new([summary_row, summary_row]), "limit" => "1")).fetch("next_cursor")
    [{ "q" => "Needle" }, { "q" => "needle " }, { "limit" => "2" }].each do |change|
      assert_code("cursor_invalid") { search(Connection.new, { "limit" => "1", "cursor" => token }.merge(change)) }
    end
    assert_code("cursor_invalid") do
      search(Connection.new([{}]), "limit" => "1", "cursor" => token, "mailbox_id" => @box)
    end
    %w[context_id authorization_version].each do |field|
      old = @session[field]
      @session[field] = "changed_authority_0123456789"
      assert_code("cursor_invalid") { search(Connection.new, "limit" => "1", "cursor" => token) }
      @session[field] = old
    end
  end

  def test_null_activity_cursor_and_serialized_byte_budget_use_last_included_row
    address = { "display_name" => "\u0001" * 256, "address" => "\u0001" * 256 }
    rows = (1..51).map do |number|
      summary_row.merge("id" => format("00000000-0000-4000-8000-%012d", 100 - number),
        "last_message_at" => nil, "subject" => "\u0001" * 256, "sender" => address, "preview_text" => "\u0001" * 256)
    end
    json = search(Connection.new(rows))
    page = JSON.parse(json)
    assert_operator json.bytesize, :<=, 262_144
    assert_operator page.fetch("items").length, :<, 50
    refute_empty page.fetch("items")
    connection = Connection.new([])
    search(connection, "cursor" => page.fetch("next_cursor"))
    assert_equal [page.fetch("items").last.fetch("id"), nil], connection.calls.last.last.slice(4, 2)
  end
end
