# frozen_string_literal: true

require_relative "mailbox_membership_database_helper"

class MailSearchDatabaseTest < MailboxMembershipDatabaseCase
  def test_literal_wildcards_case_insensitivity_and_all_message_address_fields
    literal = "100%_\\Done"
    message(body: literal)
    decoy = conversation
    message(thread: decoy, body: "100anythingXDone")
    assert_equal [@thread], search("q" => "100%_\\done").fetch("items").map { |item| item.fetch("id") }
    assert_equal [@thread], search("q" => "%").fetch("items").map { |item| item.fetch("id") }
    assert_equal [@thread], search("q" => "_").fetch("items").map { |item| item.fetch("id") }
    assert_equal [@thread], search("q" => "\\").fetch("items").map { |item| item.fetch("id") }
    cases = [
      { sender: { "display_name" => "SenderName", "address" => nil } },
      { sender: { "display_name" => nil, "address" => "sender@example.invalid" } },
      { recipients: [{ "display_name" => "RecipientName", "address" => nil }] },
      { recipients: [{ "display_name" => nil, "address" => "recipient@example.invalid" }] }
    ]
    cases.zip(%w[SenderName sender@example.invalid RecipientName recipient@example.invalid]).each do |attributes, query|
      id = conversation
      message(thread: id, **attributes)
      assert_equal [id], search("q" => query).fetch("items").map { |item| item.fetch("id") }
    end
  end

  def test_older_message_hits_return_one_thread_and_canonical_latest_preview
    message(body: "needle older", sent: "2026-10-12T00:00:00Z")
    message(body: "needle second", sent: "2026-10-12T00:00:01Z")
    message(body: "canonical latest preview", sent: "2026-10-12T00:00:02Z")
    page = search
    assert_equal 1, page.fetch("items").length
    item = page.fetch("items").first
    assert_equal [@thread, "canonical latest preview", 3], item.values_at("id", "preview_text", "message_count")
    assert_equal "2026-10-12T00:00:02Z", item.fetch("last_message_at")
    refute item.key?("match_excerpt")
  end

  def test_nullable_sources_empty_threads_and_search_excludes_notes_and_drafts
    message
    assert_empty search.fetch("items")
    @admin.exec_params("UPDATE app.threads SET subject = 'needle subject' WHERE id = $1", [@thread])
    assert_equal [@thread], search.fetch("items").map { |item| item.fetch("id") }
    @admin.exec_params("UPDATE app.threads SET subject = NULL WHERE id = $1", [@thread])
    note(SecureRandom.uuid, body: "needle in internal note")
    @admin.exec_params(<<~SQL, [SecureRandom.uuid, @org, @box, @user, @thread])
      INSERT INTO app.drafts(id, organization_id, mailbox_id, actor_id, subject, recipients, body_text,
        reply_to_thread_id, version, state) VALUES ($1,$2,$3,$4,'needle draft','[]','needle body',$5,1,'editable')
    SQL
    assert_empty search.fetch("items")
  end

  def test_foreign_private_explicit_filter_and_revocation_follow_current_scope
    message(body: "needle visible")
    private_box = mailbox(visibility: "private")
    private_thread = conversation(box: private_box)
    message(thread: private_thread, box: private_box, body: "needle private")
    foreign_org = SecureRandom.uuid
    @foreign_orgs << foreign_org
    @admin.exec_params("INSERT INTO app.organizations(id,name) VALUES ($1,'foreign search fixture')", [foreign_org])
    foreign_box = mailbox(org: foreign_org)
    foreign_thread = conversation(box: foreign_box, org: foreign_org)
    message(thread: foreign_thread, box: foreign_box, org: foreign_org, body: "needle foreign")
    assert_equal [@thread], search.fetch("items").map { |item| item.fetch("id") }
    [private_box, foreign_box, SecureRandom.uuid].each do |box|
      error = assert_raises(Elevateo::CollaborationError) { search("mailbox_id" => box) }
      assert_equal [404, "This item is unavailable."], [error.status, error.message]
    end
    explicit_member(@identity, box: private_box)
    scope(write: false) do |connection|
      instance = reader(Elevateo::MailSearch, connection)
      query = { "q" => "needle", "mailbox_id" => private_box }
      assert_equal [private_thread], JSON.parse(instance.search(query: query)).fetch("items").map { |item| item.fetch("id") }
      member_change(@user) { |c| c.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [private_box, @user]) }
      assert_equal [private_thread], JSON.parse(instance.search(query: query)).fetch("items").map { |item| item.fetch("id") }
    end
    assert_equal "not_available", assert_raises(Elevateo::CollaborationError) { search("mailbox_id" => private_box) }.code
    assert_equal [@thread], search.fetch("items").map { |item| item.fetch("id") }
    membership(present: false)
    assert_empty search.fetch("items")
  end

  def test_keyset_orders_activity_then_uuid_with_nulls_last
    nulls = [@thread, conversation].sort.reverse
    dated = Array.new(2) { conversation }.sort.reverse
    (nulls + dated).each { |id| @admin.exec_params("UPDATE app.threads SET subject = 'needle' WHERE id = $1", [id]) }
    dated.each { |id| message(thread: id, sent: "2026-10-12T00:00:00Z") }
    newest = conversation
    message(thread: newest, body: "needle", sent: "2026-10-12T00:00:01Z")
    ids, cursor = [], nil
    5.times do
      query = { "limit" => "1" }
      query["cursor"] = cursor if cursor
      page = search(query)
      ids.concat(page.fetch("items").map { |item| item.fetch("id") })
      cursor = page.fetch("next_cursor")
    end
    assert_equal [newest] + dated + nulls, ids
    assert_nil cursor
  end
end
