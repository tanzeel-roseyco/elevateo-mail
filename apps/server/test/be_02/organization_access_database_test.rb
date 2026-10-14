# frozen_string_literal: true

require_relative "mailbox_membership_database_helper"

class OrganizationAccessDatabaseTest < MailboxMembershipDatabaseCase
  def teardown
    if @admin && @org
      # AIDEV-NOTE: Disposable fixture cleanup alone may bypass the immutable-owner trigger as superuser.
      @admin.exec("ROLLBACK") if @admin.transaction_status != PG::PQTRANS_IDLE
      @admin.exec("BEGIN")
      @admin.exec("ALTER TABLE app.organization_access DISABLE TRIGGER guard_owner_loss")
      @admin.exec_params("DELETE FROM app.organization_enrollment_receipts WHERE organization_id=$1", [@org])
      @admin.exec_params("DELETE FROM app.organization_access WHERE organization_id=$1", [@org])
      @admin.exec("ALTER TABLE app.organization_access ENABLE TRIGGER guard_owner_loss")
      @admin.exec("COMMIT")
    end
    super
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
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

  def test_owner_can_change_subordinate_and_stale_revision_rejects
    other = add_actor
    grant(@identity, "owner")
    grant(other, "sales")
    assert_equal "ok", change(@identity, other, 0, "sales_manager").fetch("status")
    assert_equal "role_conflict", change(@identity, other, 0, "associate").fetch("status")
    assert_equal "sales_manager", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [other.user_id]).getvalue(0, 0)
  end

  def test_admin_cannot_promote_self_or_change_owner
    admin = add_actor
    grant(@identity, "owner")
    grant(admin, "admin")
    assert_equal "not_found", change(admin, admin, 0, "admin").fetch("status")
    assert_equal "not_found", change(admin, @identity, 0, "associate").fetch("status")
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
    assert_equal "owner", @admin.exec_params("SELECT role FROM app.organization_access WHERE user_id=$1", [@user]).getvalue(0, 0)
  end
end
