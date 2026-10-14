# frozen_string_literal: true

require "active_record"
require_relative "database_test_helper"
require_relative "../../lib/elevateo/mailbox_reads"
require_relative "../../lib/elevateo/tenancy"

class MailboxReadsTest < Minitest::Test
  Identity = Struct.new(:user_id, :org_id, keyword_init: true)
  FIXTURES = File.expand_path("../../../../contracts/v1/fixtures.json", __dir__)

  # AIDEV-NOTE: This fake tests projection/bindings only; the separate actual-login suite below proves RLS.
  class Connection
    attr_reader :calls

    def initialize(rows)
      @rows = rows
      @calls = []
    end

    def exec_query(sql, name, binds)
      values = binds.map(&:value_for_database)
      @calls << [sql, name, values]
      after = values.fetch(2)
      @rows.sort_by { |row| row.fetch("id") }
           .select { |row| after.nil? || row.fetch("id") > after }.first(values.fetch(3).to_i)
    end
  end

  def setup
    @examples = JSON.parse(File.read(FIXTURES)).fetch("examples")
    @session = @examples.fetch("session_a").fetch("body")
    @identity = Identity.new(user_id: @session.fetch("actor").fetch("id"),
                             org_id: @session.fetch("organization").fetch("id"))
    @cursor = Elevateo::Cursors.new(secret: "disposable-mailbox-test-key-00001")
    @reader = Elevateo::MailboxReads.new(cursor: @cursor)
  end

  def test_canonical_fixture_and_bound_read_only_projection
    expected = @examples.fetch("mailboxes").fetch("body")
    connection = Connection.new(expected.fetch("items").map { |item| row_for(item) })
    assert_equal expected, read(connection)
    assert_equal 1, connection.calls.length
    sql, _, values = connection.calls.first
    assert_equal [@identity.user_id, @identity.org_id, nil, "51"], values
    assert_match(/ORDER BY mailbox.id ASC/, sql)
    refute_match(/COUNT\(|\b(?:INSERT|UPDATE|DELETE)\b/i, sql)
    refute_includes sql, @identity.user_id
  end

  def test_empty_fixture_and_nullable_or_non_email_display_address
    assert_equal @examples.fetch("mailboxes_empty").fetch("body"), read(Connection.new([]))
    [nil, "", "Display-only text <not-an-email>", "💌\n\"\\" * 32].each do |address|
      row = base_row.merge("display_name" => "", "display_address" => address)
      actual = read(Connection.new([row])).fetch("items").first
      assert_equal "", actual.fetch("display_name")
      address.nil? ? assert_nil(actual.fetch("display_address")) : assert_equal(address, actual.fetch("display_address"))
    end
  end

  def test_explicit_capabilities_and_invalid_stored_data
    row = base_row.merge("compose" => true, "approve_send" => true, "manage_members" => false)
    assert_equal({ "read" => true, "compose" => true, "approve_send" => true, "manage_members" => false },
                 read(Connection.new([row])).fetch("items").first.fetch("capabilities"))
    [{ "display_name" => nil }, { "display_name" => "x" * 257 }, { "display_address" => "x" * 257 },
     { "compose" => "false" }, { "id" => "not-an-id" }, { "display_name" => "\xFF".dup.force_encoding("UTF-8") }].each do |change|
      assert_raises(Elevateo::ReadResponse::Invalid) { read(Connection.new([base_row.merge(change)])) }
    end
  end

  def test_seek_cursor_returns_each_uuid_once_and_binds_limit
    rows = (1..5).map { |id| base_row.merge("id" => uuid(id)) }
    connection = Connection.new(rows.reverse)
    first = read(connection, "limit" => "2")
    second = read(connection, "limit" => "2", "cursor" => first.fetch("next_cursor"))
    third = read(connection, "limit" => "2", "cursor" => second.fetch("next_cursor"))
    assert_equal rows.map { |row| row.fetch("id") }, [first, second, third].flat_map { |page| page.fetch("items").map { |item| item.fetch("id") } }
    assert_nil third.fetch("next_cursor")
    assert_equal uuid(2), connection.calls.fetch(1).fetch(2).fetch(2)
    assert_raises(Elevateo::Cursors::Invalid) { read(connection, "limit" => "3", "cursor" => first.fetch("next_cursor")) }
  end

  def test_byte_truncation_cursor_uses_last_included_uuid
    rows = (1..51).map { |id| base_row.merge("id" => uuid(id), "display_name" => "\u0001" * 256, "display_address" => "\u0001" * 256) }
    connection = Connection.new(rows)
    body = @reader.call(connection: connection, identity: @identity, session: @session, query: {})
    first = JSON.parse(body)
    assert_operator body.bytesize, :<=, 131_072
    assert_operator first.fetch("items").length, :<, 50
    refute_empty first.fetch("items")
    second = read(connection, "cursor" => first.fetch("next_cursor"))
    assert_equal first.fetch("items").last.fetch("id"), connection.calls.last.fetch(2).fetch(2)
    assert_equal rows.map { |row| row.fetch("id") }, (first.fetch("items") + second.fetch("items")).map { |item| item.fetch("id") }
    assert_nil second.fetch("next_cursor")
  end

  def test_default_page_includes_fifty_rows_and_one_authorized_lookahead
    rows = (1..51).map { |id| base_row.merge("id" => uuid(id)) }
    connection = Connection.new(rows)
    first = read(connection)
    assert_equal 50, first.fetch("items").length
    second = read(connection, "cursor" => first.fetch("next_cursor"))
    assert_equal [uuid(51)], second.fetch("items").map { |item| item.fetch("id") }
    assert_nil second.fetch("next_cursor")
  end

  def test_bad_query_and_cursor_never_reach_sql
    connection = Connection.new([])
    [{ "limit" => "0" }, { "limit" => "51" }, { "limit" => "NaN" }, { "limit" => "1.5" },
     { "limit" => "1;SELECT 1" }, { "cursor" => "" }, { "cursor" => "x" * 2049 }, { "actor_id" => @identity.user_id }].each do |query|
      assert_raises(Elevateo::MailboxReads::InvalidQuery) { read(connection, query) }
    end
    assert_raises(Elevateo::Cursors::Invalid) { read(connection, "cursor" => "tampered.cursor") }
    assert_empty connection.calls
  end

  private

  def row_for(item)
    item.reject { |key, _| key == "capabilities" }.merge(item.fetch("capabilities").reject { |key, _| key == "read" })
  end

  def base_row
    row_for(@examples.fetch("mailboxes").fetch("body").fetch("items").first)
  end

  def uuid(number) = format("00000000-0000-4000-8000-%012d", number)

  def read(connection, query = {})
    JSON.parse(@reader.call(connection: connection, identity: @identity, session: @session, query: query))
  end
end

class MailboxReadsApiRecord < ActiveRecord::Base
  self.abstract_class = true
end

# AIDEV-NOTE: Exercise the production reader and Tenancy using the actual elevateo_api login, never SET ROLE.
class MailboxReadsRlsTest < SessionDatabaseTestCase
  def setup
    super
    MailboxReadsApiRecord.establish_connection(ENV.fetch("BE02_API_DATABASE_URL"))
    assert_equal "elevateo_api", MailboxReadsApiRecord.connection.select_value("SELECT session_user")
    @foreign_orgs = []
    @reader = Elevateo::MailboxReads.new(cursor: Elevateo::Cursors.new(secret: "disposable-mailbox-test-key-00001"))
    @identity = MailboxReadsTest::Identity.new(user_id: @user, org_id: @org)
    @session = { "context_id" => "context_A_0123456789", "authorization_version" => "authz_A_0123456789" }
  end

  def teardown
    MailboxReadsApiRecord.remove_connection
    (@foreign_orgs || []).each { |org| @admin.exec_params("DELETE FROM app.organizations WHERE id = $1", [org]) }
    super
  end

  def test_actual_rls_hides_foreign_and_private_rows_and_defaults_all_capabilities_false
    visible = add_mailbox
    add_mailbox(visibility: "private")
    foreign = SecureRandom.uuid
    @foreign_orgs << foreign
    @admin.exec_params("INSERT INTO app.organizations(id, name) VALUES ($1, 'Foreign fixture')", [foreign])
    add_mailbox(org: foreign)
    page = read
    assert_equal [visible], page.fetch("items").map { |item| item.fetch("id") }
    assert_nil page.fetch("next_cursor")
    assert_equal({ "read" => true, "compose" => false, "approve_send" => false, "manage_members" => false },
                 page.fetch("items").first.fetch("capabilities"))
  end

  def test_current_private_membership_flags_and_revocation
    id = add_mailbox(visibility: "private", name: "Private inbox", address: nil)
    fixture_change do
      @admin.exec_params("INSERT INTO app.mailbox_memberships(organization_id, mailbox_id, user_id, compose) VALUES ($1, $2, $3, true)", [@org, id, @user])
    end
    item = read.fetch("items").first
    assert_equal id, item.fetch("id")
    assert_equal "Private inbox", item.fetch("display_name")
    assert_nil item.fetch("display_address")
    assert_equal true, item.fetch("capabilities").fetch("compose")
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET compose = false, approve_send = true WHERE mailbox_id = $1 AND user_id = $2", [id, @user])
    end
    assert_equal({ "read" => true, "compose" => false, "approve_send" => true, "manage_members" => false },
                 read.fetch("items").first.fetch("capabilities"))
    fixture_change do
      @admin.exec_params("DELETE FROM app.mailbox_memberships WHERE mailbox_id = $1 AND user_id = $2", [id, @user])
    end
    assert_empty read.fetch("items")
    assert_nil read.fetch("next_cursor")
  end

  def test_revoked_organization_cannot_recover_visible_rows
    add_mailbox
    membership(present: false)
    assert_empty read.fetch("items")
    # The shared wrapper separately denies the revoked session; direct reader RLS still exposes no data.
  end

  def test_actual_uuid_seek_and_read_only_snapshot_leave_business_rows_unchanged
    ids = Array.new(4) { add_mailbox(name: "Quoted \"💌\"", address: "display text") }.sort
    before = business_snapshot
    first = read("limit" => "2")
    second = read("limit" => "2", "cursor" => first.fetch("next_cursor"))
    assert_equal ids, (first.fetch("items") + second.fetch("items")).map { |item| item.fetch("id") }
    assert_nil second.fetch("next_cursor")
    assert_equal before, business_snapshot
  end

  def test_actual_database_preserves_empty_null_and_maximum_display_text
    empty = add_mailbox
    maximum = add_mailbox(name: "\u0001" * 256, address: "💌" * 256)
    items = read.fetch("items").to_h { |item| [item.fetch("id"), item] }
    assert_equal "", items.fetch(empty).fetch("display_name")
    assert_nil items.fetch(empty).fetch("display_address")
    assert_equal "\u0001" * 256, items.fetch(maximum).fetch("display_name")
    assert_equal "💌" * 256, items.fetch(maximum).fetch("display_address")
  end

  private

  def add_mailbox(org: @org, visibility: "shared", name: "", address: nil)
    id = SecureRandom.uuid
    fixture_change(org) do
      @admin.exec_params(<<~SQL, [id, org, "#{id}@example.invalid", visibility, name, address])
        INSERT INTO app.mailboxes(id, organization_id, address, visibility, display_name, display_address)
        VALUES ($1, $2, $3, $4, $5, $6)
      SQL
    end
    id
  end

  # AIDEV-NOTE: Fixture mutations retain session-before-generation locking required by the database writer protocol.
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

  def business_snapshot
    @admin.exec_params(<<~SQL, [@org]).getvalue(0, 0)
      SELECT jsonb_build_object(
        'mailboxes', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM app.mailboxes m WHERE organization_id = $1),
        'memberships', (SELECT jsonb_agg(to_jsonb(mm) ORDER BY mm.mailbox_id, mm.user_id)
                         FROM app.mailbox_memberships mm WHERE organization_id = $1))::text
    SQL
  end

  def read(query = {})
    MailboxReadsApiRecord.connection_pool.with_connection do |connection|
      principal = Elevateo::Tenancy::Principal.new(user_id: @user, org_id: @org)
      Elevateo::Tenancy.with_context(principal, connection: connection, read_only: true) do |snapshot|
        assert_equal "repeatable read", snapshot.select_value("SHOW transaction_isolation")
        assert_equal "on", snapshot.select_value("SHOW transaction_read_only")
        JSON.parse(@reader.call(connection: snapshot, identity: @identity, session: @session, query: query))
      end
    end
  end
end
