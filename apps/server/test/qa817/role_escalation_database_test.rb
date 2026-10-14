# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"

# AIDEV-NOTE: Runtime API role cannot turn a subordinate into an owner or bypass immutable owner history.
class QA817RoleEscalationDatabaseTest < MailboxMembershipDatabaseCase
  # AIDEV-NOTE: These role-specific cases seed their own grants; inherited cleanup owns final-owner removal.
  def sec802_default_fixture?
    false
  end

  def setup
    super
    @admin_actor = add_actor
    @target = add_actor
    [[@identity, "owner"], [@admin_actor, "admin"], [@target, "associate"]].each do |actor, role|
      @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,$3)",
        [@org, actor.user_id, role])
    end
  end

  def test_owner_changes_subordinate_with_revision_guard
    result = change_role(@identity, @target, 0, "sales")
    assert_equal "ok", result.fetch("status")
    assert_equal 1, result.fetch("revision")
    assert_equal "role_conflict", change_role(@identity, @target, 0, "associate").fetch("status")
  end

  def test_admin_cannot_promote_self_to_owner_even_via_direct_sql
    assert_raises(ActiveRecord::StatementInvalid) do
      change_role(@admin_actor, @admin_actor, 0, "owner")
    end
    assert_equal "admin", current_role(@admin_actor)
  end

  def test_owner_demotion_is_blocked_at_database_trigger
    assert_raises(PG::CheckViolation) do
      @admin.exec_params("UPDATE app.organization_access SET role='admin' WHERE organization_id=$1 AND user_id=$2",
        [@org, @user])
    end
    assert_equal "owner", current_role(@identity)
  end

  private

  def current_role(actor)
    @admin.exec_params("SELECT role FROM app.organization_access WHERE organization_id=$1 AND user_id=$2",
      [@org, actor.user_id]).getvalue(0, 0)
  end

  def change_role(actor, target, expected, role)
    result = nil
    scope(identity: actor, targets: [target.user_id]) do |connection|
      values = [actor.digest, target.user_id, expected.to_s, role]
      binds = values.map do |value|
        ActiveRecord::Relation::QueryAttribute.new("fixture", value, ActiveRecord::Type::String.new)
      end
      raw = connection.exec_query("SELECT app.change_organization_role($1,$2,$3,$4) AS result",
        "QA817 role mutation", binds).first.fetch("result")
      result = raw.is_a?(String) ? JSON.parse(raw) : raw
      raise ActiveRecord::Rollback unless result.fetch("status") == "ok"
    end
    result
  end
end
