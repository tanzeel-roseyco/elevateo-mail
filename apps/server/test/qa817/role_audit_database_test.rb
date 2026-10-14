# frozen_string_literal: true

require "time"
require_relative "../be_02/mailbox_membership_database_helper"

# AIDEV-NOTE: Audit history commits with a real role change, never with denied or no-op requests.
class QA817RoleAuditDatabaseTest < MailboxMembershipDatabaseCase
  def setup
    super
    @admin_actor, @auditor, @target = Array.new(3) { add_actor }
    [[@identity, "owner"], [@admin_actor, "admin"], [@auditor, "auditor"], [@target, "associate"]].each do |actor, role|
      @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,$3)",
        [@org, actor.user_id, role])
    end
  end

  def teardown
    if @admin && @org
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      @admin.exec("BEGIN")
      @admin.exec("ALTER TABLE app.organization_access DISABLE TRIGGER guard_owner_loss")
      @admin.exec_params("DELETE FROM app.organization_access WHERE organization_id=$1", [@org])
      @admin.exec("ALTER TABLE app.organization_access ENABLE TRIGGER guard_owner_loss")
      @admin.exec("COMMIT")
    end
    super
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_one_changed_role_writes_one_canonical_metadata_event
    assert_equal 0, audit_count
    assert_equal "ok", change_role(@identity, @target, 0, "sales").fetch("status")
    assert_equal 1, audit_count
    [@identity, @admin_actor, @auditor].each do |reader|
      page = audit_page(reader)
      assert_equal "ok", page.fetch("status")
      item = page.fetch("items").fetch(0)
      assert_equal [@user, @target.user_id, "associate", "sales", 1, "replace_organization_grant"],
        item.values_at("actor_user_id", "target_user_id", "old_role", "new_role", "revision", "operation")
      assert_match(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\z/, item.fetch("occurred_at"))
      assert_equal 0, Time.iso8601(item.fetch("occurred_at")).utc_offset
    end
  end

  def test_noop_stale_and_denied_role_changes_write_no_audit_row
    assert_equal "ok", change_role(@identity, @target, 0, "sales").fetch("status")
    assert_equal 1, audit_count
    assert_equal "ok", change_role(@identity, @target, 1, "sales").fetch("status")
    assert_equal "role_conflict", change_role(@identity, @target, 0, "associate").fetch("status")
    assert_equal "not_found", change_role(@auditor, @target, 1, "associate").fetch("status")
    assert_equal 1, audit_count
  end

  def test_forged_tenant_claim_cannot_read_audit_metadata
    change_role(@identity, @target, 0, "sales")
    result = nil
    scope(write: false) do |connection|
      connection.execute("SET LOCAL app.org_id = '#{SecureRandom.uuid}'")
      result = page_query(connection, @identity)
    end
    assert_equal "not_found", result.fetch("status")
  end

  def test_foreign_audit_cursor_cannot_seek_this_organization
    foreign_org, = foreign_witness
    cursor = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [cursor, foreign_org, @user, @target.user_id])
      INSERT INTO app.organization_role_audit(id,organization_id,actor_user_id,target_user_id,
        old_role,new_role,revision) VALUES ($1,$2,$3,$4,'associate','sales',1)
    SQL
    result = scope(write: false) { |connection| page_query(connection, @identity, after: cursor) }
    assert_equal "cursor_invalid", result.fetch("status")
  end

  def test_revoked_auditor_cannot_read_prior_role_history
    change_role(@identity, @target, 0, "sales")
    member_change(@auditor.user_id) do |connection|
      connection.exec_params("DELETE FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2",
        [@org, @auditor.user_id])
    end
    result = audit_page(@auditor)
    refute_equal "ok", result.fetch("status")
    refute result.key?("items")
  end

  private

  def audit_count
    @admin.exec_params("SELECT count(*) FROM app.organization_role_audit WHERE organization_id=$1", [@org]).getvalue(0, 0).to_i
  end

  def change_role(actor, target, expected, role)
    result = nil
    scope(identity: actor, targets: [target.user_id]) do |connection|
      raw = query_json(connection, "SELECT app.change_organization_role($1::text,$2::uuid,$3::integer,$4::text) AS result",
        [actor.digest, target.user_id, expected, role])
      result = raw
      raise ActiveRecord::Rollback unless result.fetch("status") == "ok"
    end
    result
  end

  def audit_page(actor)
    scope(identity: actor, write: false) { |connection| page_query(connection, actor) }
  end

  def page_query(connection, actor, after: nil)
    query_json(connection, "SELECT app.organization_role_audit_page($1::text,$2::uuid,$3::integer) AS result",
      [actor.digest, after, 50])
  end

  def query_json(connection, sql, values)
    binds = values.map do |value|
      ActiveRecord::Relation::QueryAttribute.new("qa817 audit", value&.to_s, ActiveRecord::Type::String.new)
    end
    raw = connection.exec_query(sql, "QA817 role audit", binds).first.fetch("result")
    raw.is_a?(String) ? JSON.parse(raw) : raw
  end
end
