# frozen_string_literal: true

require "active_record"
require_relative "database_test_helper"
require_relative "../../lib/elevateo/thread_reads"
require_relative "../../lib/elevateo/tenancy"

class ThreadReadsApiRecord < ActiveRecord::Base
  self.abstract_class = true
end

# AIDEV-NOTE: Fixture authority is isolated; all production reads use the actual elevateo_api login and tenant helper.
class ThreadDatabaseTest < SessionDatabaseTestCase
  Identity = Struct.new(:user_id, :org_id, keyword_init: true)
  NotAvailable = Elevateo::ThreadReads::NotAvailable
  PARTS = File.expand_path("../../db/be02_threads", __dir__)

  def setup
    super
    @foreign_orgs, @other_users = [], []
    ThreadReadsApiRecord.establish_connection(ENV.fetch("BE02_API_DATABASE_URL"))
    assert_equal "elevateo_api", ThreadReadsApiRecord.connection.select_value("SELECT session_user")
    @identity = Identity.new(user_id: @user, org_id: @org)
    @session = { "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789" }
    @cursors = Elevateo::Cursors.new(secret: "disposable-thread-tests-key-000001")
    @box = mailbox
    @thread = thread
  end

  def teardown
    ThreadReadsApiRecord.remove_connection
    if @admin
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      (@other_users || []).each do |user|
        fixture_change { @admin.exec_params("DELETE FROM app.organization_memberships WHERE organization_id = $1 AND user_id = $2", [@org, user]) }
        @admin.exec_params("DELETE FROM app_auth.authorization_generations WHERE user_id = $1", [user])
      end
      (@foreign_orgs || []).each do |org|
        fixture_change(org) { @admin.exec_params("DELETE FROM app.organizations WHERE id = $1", [org]) }
      end
    end
    super
  end

  def test_empty_conversation_null_values_and_source_text_limits
    empty = detail
    assert_empty empty.fetch("messages")
    assert_equal 0, empty.fetch("thread").fetch("message_count")
    assert empty.fetch("thread").fetch("unread")
    assert_nil empty.fetch("thread").fetch("subject")
    @admin.exec_params("UPDATE app.threads SET subject = $1 WHERE id = $2", ["\u{1F48C}" * 2000, @thread])
    message(body: "<script>plain</script>" + "\u{1F48C}" * 20_000)
    page = detail
    assert_equal 998, page.fetch("thread").fetch("subject").length
    assert page.fetch("thread").fetch("subject_truncated")
    item = page.fetch("messages").first
    assert_nil item.fetch("sender")
    assert_nil item.fetch("sent_at")
    assert_empty item.fetch("to")
    assert_equal 16_384, item.fetch("body_text").length
    assert item.fetch("body_truncated")
    assert item.fetch("body_text").start_with?("<script>plain</script>")
    summary = list.fetch("items").first
    assert_equal 256, summary.fetch("subject").length
    assert_equal 256, summary.fetch("preview_text").length
    assert_equal 1, summary.fetch("message_count")
  end

  def test_message_seek_orders_nulls_then_timestamp_then_uuid_without_skipping
    nulls, dated = Array.new(2) { SecureRandom.uuid }.sort, Array.new(2) { SecureRandom.uuid }.sort
    (nulls + dated).reverse_each { |id| message(id: id, sent_at: dated.include?(id) ? "2026-10-12T00:00:00.000001Z" : nil) }
    later = message(sent_at: "2026-10-12T00:00:00.000002Z")
    pages = walk { |cursor| detail(query: { "limit" => "1" }.merge(cursor ? { "cursor" => cursor } : {})) }
    assert_equal nulls + dated + [later], pages.flat_map { |page| page.fetch("messages").map { |row| row.fetch("id") } }
    assert_nil pages.last.fetch("next_cursor")
    assert pages.all? { |page| page.fetch("thread").fetch("message_count") == 5 }
  end

  def test_thread_seek_orders_derived_activity_then_uuid_with_nulls_last
    nulls = [@thread, thread].sort.reverse
    dated = Array.new(2) { thread }.sort.reverse
    dated.each { |id| message(thread_id: id, sent_at: "2026-10-12T00:00:00Z") }
    latest = thread
    message(thread_id: latest, sent_at: "2026-10-12T00:00:01Z", body: "latest visible preview")
    pages = walk { |cursor| list(query: { "limit" => "1" }.merge(cursor ? { "cursor" => cursor } : {})) }
    assert_equal [latest] + dated + nulls, pages.flat_map { |page| page.fetch("items").map { |row| row.fetch("id") } }
    assert_equal "latest visible preview", pages.first.fetch("items").first.fetch("preview_text")
    assert_nil pages.last.fetch("items").first.fetch("last_message_at")
  end

  def test_per_user_read_state_and_unread_filter_never_write_during_reads
    unread = thread
    other = SecureRandom.uuid
    @other_users << other
    fixture_change { @admin.exec_params("INSERT INTO app.organization_memberships(organization_id, user_id) VALUES ($1, $2)", [@org, other]) }
    read_state(@thread, @user, true)
    read_state(unread, other, true)
    before = business_snapshot
    assert_equal [unread], list(query: { "filter" => "unread" }).fetch("items").map { |row| row.fetch("id") }
    refute detail.fetch("thread").fetch("unread")
    assert detail(thread_id: unread).fetch("thread").fetch("unread")
    assert_equal before, business_snapshot
    api_context do
      assert_equal [@user], @api.exec("SELECT user_id FROM app.thread_read_states").column_values(0)
    end
  end

  def test_foreign_private_missing_and_mismatched_resources_are_indistinguishable
    private_box = mailbox(visibility: "private")
    private_thread = thread(box: private_box)
    foreign_org = SecureRandom.uuid
    @foreign_orgs << foreign_org
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'B foreign fixture')", [foreign_org])
    foreign_box = mailbox(org: foreign_org)
    foreign_thread = thread(org: foreign_org, box: foreign_box)
    message(org: foreign_org, box: foreign_box, thread_id: foreign_thread, body: "must remain invisible")
    missing = SecureRandom.uuid
    [private_box, foreign_box, missing].each do |box|
      assert_equal "not available", assert_raises(NotAvailable) { list(box: box) }.message
    end
    [[private_thread, private_box], [foreign_thread, foreign_box], [missing, @box], [@thread, private_box]].each do |id, box|
      assert_equal "not available", assert_raises(NotAvailable) { detail(thread_id: id, box: box) }.message
    end
    assert_equal [@thread], list.fetch("items").map { |row| row.fetch("id") }
    assert_equal 0, detail.fetch("thread").fetch("message_count")
  end

  def test_private_membership_revocation_and_snapshot_cut
    box = mailbox(visibility: "private")
    id = thread(box: box)
    fixture_change { @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id) VALUES ($1, $2, $3)", [@org, box, @user]) }
    snapshot do |reader|
      assert_equal id, JSON.parse(reader.detail(thread_id: id, query: { "mailbox_id" => box })).fetch("thread").fetch("id")
      fixture_change { @admin.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [box, @user]) }
      assert_equal id, JSON.parse(reader.detail(thread_id: id, query: { "mailbox_id" => box })).fetch("thread").fetch("id")
    end
    assert_raises(NotAvailable) { detail(thread_id: id, box: box) }
    membership(present: false)
    assert_raises(NotAvailable) { list }
    assert_raises(NotAvailable) { detail }
  end

  def test_forced_rls_and_narrow_grants_fail_closed_for_actual_runtime_logins
    %w[threads messages thread_read_states].each do |table|
      flags = @admin.exec_params("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass", ["app.#{table}"]).first
      assert_equal({ "relrowsecurity" => "t", "relforcerowsecurity" => "t" }, flags)
      assert_raises(PG::InsufficientPrivilege) { @api.exec("DELETE FROM app.#{table}") }
      assert_raises(PG::InsufficientPrivilege) { @worker.exec("SELECT count(*) FROM app.#{table}") }
    end
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT created_at FROM app.threads") }
    # AIDEV-NOTE: D exposes read-state metadata, while absent claims still hide every row through forced RLS.
    read_state(@thread, @user, true)
    before = business_snapshot
    assert_empty @api.exec("SELECT read_state_version, updated_at FROM app.thread_read_states").to_a
    assert_equal 0, @api.exec("UPDATE app.thread_read_states SET updated_at = now()").cmd_tuples
    assert_equal before, business_snapshot
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app.thread_read_states SET user_id = user_id") }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("UPDATE app.thread_read_states SET organization_id = organization_id") }
    assert_equal "0", @api.exec("SELECT count(id) FROM app.threads").getvalue(0, 0)
    assert_equal "0", @api.exec("SELECT count(id) FROM app.messages").getvalue(0, 0)
    api_context do
      assert_equal [@thread], @api.exec("SELECT id FROM app.threads").column_values(0)
      assert_raises(PG::InsufficientPrivilege) { @api.exec_params("UPDATE app.threads SET subject = 'forbidden' WHERE id = $1", [@thread]) }
    end
  end

  def test_composite_foreign_keys_and_canonical_json_constraints
    wrong_box = mailbox
    assert_raises(PG::ForeignKeyViolation) { message(box: wrong_box) }
    assert_raises(PG::ForeignKeyViolation) { thread(org: SecureRandom.uuid) }
    assert_raises(PG::ForeignKeyViolation) { read_state(@thread, SecureRandom.uuid, true) }
    ["{}", "null", '{"display_name":null,"address":null,"html":"x"}'].each do |sender|
      assert_raises(PG::CheckViolation) { message(sender: sender) }
    end
    ["[null]", "{}", JSON.generate(Array.new(101) { { "display_name" => nil, "address" => nil } })].each do |recipients|
      assert_raises(PG::CheckViolation) { message(recipients: recipients) }
    end
    assert_raises(PG::CheckViolation) { message(attachments: 1001) }
    assert_raises(PG::CheckViolation) { message(sent_at: "infinity") }
    maximum = JSON.generate("display_name" => "\u{1F48C}" * 256, "address" => nil)
    message(sender: maximum, recipients: "[#{maximum}]", attachments: 1000)
    assert_equal 256, detail.fetch("messages").first.fetch("sender").fetch("display_name").length
  end

  def test_scoped_down_and_reapply_are_transactionally_reversible
    before = business_snapshot
    @admin.exec("BEGIN")
    @admin.exec("SET LOCAL ROLE elevateo_owner")
    # AIDEV-NOTE: C/D reference B threads; membership revisions reference only mailboxes and remain installed.
    drafts = File.expand_path("../be02_drafts", PARTS)
    collaboration = File.expand_path("../be02_collaboration", PARTS)
    @admin.exec(File.read(File.join(collaboration, "down.sql")))
    @admin.exec(File.read(File.join(drafts, "down.sql")))
    @admin.exec(File.read(File.join(PARTS, "down.sql")))
    assert_nil @admin.exec("SELECT to_regclass('app.threads')").getvalue(0, 0)
    refute_nil @admin.exec("SELECT to_regclass('app.mailboxes')").getvalue(0, 0)
    refute_nil @admin.exec("SELECT to_regclass('app_auth.sessions')").getvalue(0, 0)
    refute_nil @admin.exec("SELECT to_regclass('app.mailbox_membership_revisions')").getvalue(0, 0)
    %w[validation tables policies].each { |part| @admin.exec(File.read(File.join(PARTS, "#{part}.sql"))) }
    %w[tables policies scope save operations grants].each { |part| @admin.exec(File.read(File.join(drafts, "#{part}.sql"))) }
    %w[tables policies target_reader].each { |part| @admin.exec(File.read(File.join(collaboration, "#{part}.sql"))) }
    refute_nil @admin.exec("SELECT to_regclass('app.messages')").getvalue(0, 0)
    @admin.exec("ROLLBACK")
    assert_equal before, business_snapshot
    assert_equal @thread, detail.fetch("thread").fetch("id")
  ensure
    @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
  end

  private

  def mailbox(org: @org, visibility: "shared")
    id = SecureRandom.uuid
    fixture_change(org) do
      @admin.exec_params("INSERT INTO app.mailboxes(id, organization_id, address, visibility) VALUES ($1, $2, $3, $4)", [id, org, "#{id}@example.invalid", visibility])
    end
    id
  end

  def thread(org: @org, box: @box)
    id = SecureRandom.uuid
    @admin.exec_params("INSERT INTO app.threads(id, organization_id, mailbox_id) VALUES ($1, $2, $3)", [id, org, box])
    id
  end

  def message(id: SecureRandom.uuid, org: @org, box: @box, thread_id: @thread, sent_at: nil, body: "", sender: nil, recipients: "[]", attachments: 0)
    @admin.exec_params(<<~SQL, [id, org, box, thread_id, sent_at, body, sender, recipients, attachments])
      INSERT INTO app.messages(id, organization_id, mailbox_id, thread_id, sent_at, body_text, sender, recipients, attachment_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
    SQL
    id
  end

  def read_state(thread_id, user, is_read)
    @admin.exec_params(<<~SQL, [@org, @box, thread_id, user, is_read])
      INSERT INTO app.thread_read_states(organization_id, mailbox_id, thread_id, user_id, is_read)
      VALUES ($1, $2, $3, $4, $5)
    SQL
  end

  # AIDEV-NOTE: Even fixtures observe session-before-generation guards for authorization-changing DML.
  def fixture_change(org = @org)
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE organization_id = $1 ORDER BY cookie_digest FOR UPDATE", [org])
    @admin.exec_params("SELECT app_auth.lock_authorization_generations($1, NULL)", [org])
    yield
    @admin.exec("COMMIT")
  rescue StandardError
    @admin.exec("ROLLBACK")
    raise
  end

  def snapshot
    ThreadReadsApiRecord.connection_pool.with_connection do |connection|
      principal = Elevateo::Tenancy::Principal.new(user_id: @user, org_id: @org)
      Elevateo::Tenancy.with_context(principal, connection: connection, read_only: true) do
        assert_equal "repeatable read", connection.select_value("SHOW transaction_isolation")
        assert_equal "on", connection.select_value("SHOW transaction_read_only")
        yield Elevateo::ThreadReads.new(connection: connection, identity: @identity, session: @session, cursors: @cursors)
      end
    end
  end

  def list(box: @box, query: {})
    snapshot { |reader| JSON.parse(reader.list(mailbox_id: box, query: query)) }
  end

  def detail(thread_id: @thread, box: @box, query: {})
    snapshot { |reader| JSON.parse(reader.detail(thread_id: thread_id, query: query.merge("mailbox_id" => box))) }
  end

  def walk
    pages, cursor = [], nil
    20.times do
      page = yield cursor
      pages << page
      cursor = page.fetch("next_cursor")
      return pages unless cursor
    end
    flunk "cursor did not make bounded progress"
  end

  def api_context
    # AIDEV-NOTE: Raw privilege probes use a writable transaction; production-reader snapshots above are read-only.
    @api.exec("BEGIN")
    @api.exec_params("SELECT set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [@org, @user])
    yield
  ensure
    @api.exec("ROLLBACK")
  end

  def business_snapshot
    @admin.exec_params(<<~SQL, [@org]).getvalue(0, 0)
      SELECT jsonb_build_object(
        'threads', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM app.threads t WHERE organization_id = $1),
        'messages', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM app.messages m WHERE organization_id = $1),
        'states', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.thread_id, s.user_id)
                    FROM app.thread_read_states s WHERE organization_id = $1))::text
    SQL
  end
end
