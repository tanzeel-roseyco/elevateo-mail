# frozen_string_literal: true

require_relative "mailbox_membership_database_helper"

class OrganizationAccessDatabaseTest < MailboxMembershipDatabaseCase
  def sec802_default_fixture?
    false
  end

  def grant(actor, role)
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,$3)",
      [@org, actor.user_id, role])
  end

  def change(actor, target, revision, role)
    result = nil
    scope(identity: actor, targets: [target.user_id]) do |connection|
      sql = "SELECT app.change_organization_role($1,$2,$3,$4) AS result"
      values = [actor.digest, target.user_id, revision.to_s, role]
      binds = values.map { |value| ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new) }
      raw = connection.exec_query(sql, "Role fixture", binds).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
      raise ActiveRecord::Rollback unless result.fetch("status") == "ok"
    end
    result
  end

  def audit_page(actor: @identity, after: nil, limit: 50)
    result = nil
    scope(identity: actor, write: false) do |connection|
      values = [actor.digest, after, limit.to_s]
      binds = values.map { |value| ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new) }
      raw = connection.exec_query("SELECT app.organization_role_audit_page($1,$2::uuid,$3::integer) AS result",
        "Audit fixture", binds).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
    end
    result
  end

  def test_owner_can_change_subordinate_and_stale_revision_rejects
    other = add_actor
    grant(@identity, "owner")
    grant(other, "sales")
    assert_equal "ok", change(@identity, other, 0, "sales_manager").fetch("status")
    assert_equal "role_conflict", change(@identity, other, 0, "associate").fetch("status")
    assert_equal "ok", change(@identity, other, 1, "sales_manager").fetch("status")
    audit = audit_page.fetch("items")
    assert_equal 1, audit.length
    assert_equal [@user, other.user_id, "sales", "sales_manager", 1, "replace_organization_grant"],
      audit.first.values_at("actor_user_id", "target_user_id", "old_role", "new_role", "revision", "operation")
    assert_equal "sales_manager", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [other.user_id]).getvalue(0, 0)
  end

  def test_audit_page_is_metadata_only_and_cursor_is_tenant_bound
    first, second = add_actor, add_actor
    grant(@identity, "owner")
    [first, second].each { |target| grant(target, "sales") }
    assert_equal "ok", change(@identity, first, 0, "associate").fetch("status")
    assert_equal "ok", change(@identity, second, 0, "associate").fetch("status")
    page1 = audit_page(limit: 1)
    assert_equal "ok", page1.fetch("status")
    assert_equal second.user_id, page1.fetch("items").first.fetch("target_user_id")
    assert_equal %w[actor_user_id id new_role occurred_at old_role operation revision target_user_id],
      page1.fetch("items").first.keys.sort
    assert_match(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\z/,
      page1.fetch("items").first.fetch("occurred_at"))
    page2 = audit_page(after: page1.fetch("next_id"), limit: 1)
    assert_equal first.user_id, page2.fetch("items").first.fetch("target_user_id")
    assert_nil page2.fetch("next_id")
    assert_equal "cursor_invalid", audit_page(after: SecureRandom.uuid).fetch("status")
  end

  def test_subordinate_cannot_promote_self_or_change_owner
    subordinate = add_actor
    grant(@identity, "owner")
    grant(subordinate, "associate")
    assert_equal "not_found", change(subordinate, subordinate, 0, "admin").fetch("status")
    assert_equal "not_found", change(subordinate, @identity, 0, "associate").fetch("status")
    assert_equal "associate", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [subordinate.user_id]).getvalue(0, 0)
    assert_equal "owner", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [@user]).getvalue(0, 0)
  end

  def test_admin_cannot_change_peer_or_owner
    admin, peer = add_actor, add_actor
    grant(@identity, "owner")
    grant(admin, "admin")
    grant(peer, "admin")
    assert_equal "not_found", change(admin, peer, 0, "associate").fetch("status")
    assert_equal "not_found", change(admin, @identity, 0, "associate").fetch("status")
    assert_equal %w[admin admin owner], ([admin.user_id, peer.user_id, @user].map { |id|
      @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [id]).getvalue(0, 0)
    })
  end

  def test_two_simultaneous_owner_removals_both_reject
    grant(@identity, "owner")
    connections = Array.new(2) { connect("BE02_ADMIN_DATABASE_URL", "supabase_admin") }
    start = Queue.new
    threads = connections.map do |connection|
      Thread.new do
        start.pop
        begin
          connection.exec_params("DELETE FROM app.organization_access WHERE organization_id=$1 AND user_id=$2", [@org, @user])
          :unexpected_success
        rescue PG::CheckViolation
          :denied
        end
      end.tap { |thread| thread.report_on_exception = false }
    end
    2.times { start << true }
    assert_equal %i[denied denied], threads.map(&:value)
    assert_equal "owner", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [@user]).getvalue(0, 0)
  ensure
    threads&.each(&:join)
    close_connections(connections || [])
  end

  def test_sole_owner_cannot_be_deleted_or_demoted_directly
    grant(@identity, "owner")
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("DELETE FROM app.organization_access WHERE organization_id=$1 AND user_id=$2", [@org, @user])
    end
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app.organization_access SET role='admin' WHERE organization_id=$1 AND user_id=$2", [@org, @user])
    end
    assert_equal "owner", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [@user]).getvalue(0, 0)
  end

  def test_second_owner_in_same_organization_is_rejected
    other = add_actor
    grant(@identity, "owner")
    assert_raises(PG::UniqueViolation) { grant(other, "owner") }
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.organization_access WHERE organization_id=$1 AND role='owner'", [@org]).getvalue(0, 0)
  end
end
