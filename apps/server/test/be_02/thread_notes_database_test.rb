# frozen_string_literal: true

require_relative "collaboration_database_helper"

# AIDEV-NOTE: Exercise the real cursor/projection with PostgreSQL text, UUID ordering, and escaped byte budgets.
class ThreadNotesDatabaseTest < CollaborationDatabaseCase
  def test_plaintext_unicode_whitespace_and_control_characters_round_trip
    ["\u{1F600}" * 4096, "\u0001" * 4096, " \n\t\r"].each do |body|
      response = note(SecureRandom.uuid, body: body)
      assert_equal 201, response.status
      assert_operator response.json.bytesize, :<=, 65_536
      assert_equal body, JSON.parse(response.json).fetch("note").fetch("body_text")
    end
    ["", "a" * 4097, "\u0000"].each do |body|
      assert_equal "request_invalid", assert_raises(Elevateo::CollaborationError) { note(SecureRandom.uuid, body: body) }.code
    end
    assert_equal "3", @admin.exec("SELECT count(*) FROM app.thread_notes").getvalue(0, 0)
  end

  def test_notes_page_respects_whole_entries_ties_scope_and_serialized_budget
    ids = Array.new(51) { SecureRandom.uuid }.sort
    body = "\u0001" * 4096
    ids.each do |id|
      @admin.exec_params(<<~SQL, [@org, @box, @thread, id, @user, body])
        INSERT INTO app.thread_notes(organization_id,mailbox_id,thread_id,id,author_id,body_text,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'2026-01-01 00:00:00+00')
      SQL
    end
    query = { "mailbox_id" => @box, "limit" => "50" }
    seen, cursors, cursor = [], [], nil
    52.times do
      wire = scope(write: false) { |connection| service(Elevateo::ThreadNotes, connection).list(thread_id: @thread, query: query) }
      assert_operator wire.bytesize, :<=, 262_144
      page = JSON.parse(wire)
      refute_empty page.fetch("items")
      assert_operator page.fetch("items").length, :<, 50
      page.fetch("items").each do |item|
        assert_equal body, item.fetch("body_text")
        seen << item.fetch("id")
      end
      cursor = page.fetch("next_cursor")
      break unless cursor
      refute_includes cursors, cursor
      cursors << cursor
      query = query.merge("cursor" => cursor)
    end
    assert_nil cursor, "pagination must finish within the number of inserted notes plus one"
    assert_equal ids, seen
    refute_empty cursors
    other = conversation
    scope(write: false) do |connection|
      assert_raises(Elevateo::Cursors::Invalid) do
        service(Elevateo::ThreadNotes, connection).list(thread_id: other, query: query.merge("cursor" => cursors.first))
      end
    end
    membership(present: false)
    scope(write: false) do |connection|
      assert_equal "not_available", assert_raises(Elevateo::CollaborationError) do
        service(Elevateo::ThreadNotes, connection).list(thread_id: @thread, query: query.merge("cursor" => cursors.first))
      end.code
    end
  end

  def test_note_uuid_is_unique_per_organization_and_author_is_historical
    id = SecureRandom.uuid
    author = add_actor
    note(id, identity: author)
    foreign_org = SecureRandom.uuid
    @foreign_orgs << foreign_org
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'second fixture')", [foreign_org])
    foreign_box = mailbox(org: foreign_org)
    foreign_thread = conversation(org: foreign_org, box: foreign_box)
    @admin.exec_params(<<~SQL, [foreign_org, foreign_box, foreign_thread, id, author.user_id])
      INSERT INTO app.thread_notes(organization_id,mailbox_id,thread_id,id,author_id,body_text)
      VALUES ($1,$2,$3,$4,$5,'other organization')
    SQL
    member_change(author.user_id) { |c| c.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, author.user_id]) }
    page = scope(write: false) do |connection|
      JSON.parse(service(Elevateo::ThreadNotes, connection).list(thread_id: @thread, query: { "mailbox_id" => @box }))
    end
    assert_equal [id], page.fetch("items").map { |item| item.fetch("id") }
    assert_equal author.user_id, page.fetch("items").first.fetch("author_id")
    assert_equal "2", @admin.exec_params("SELECT count(*) FROM app.thread_notes WHERE id = $1", [id]).getvalue(0, 0)
  end
end
