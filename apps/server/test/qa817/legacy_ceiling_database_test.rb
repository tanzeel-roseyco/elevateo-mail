# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"

# AIDEV-NOTE: A legacy delete still requires current delegated manage authority, even with no proposed flags.
class QA817LegacyCeilingDatabaseTest < MailboxMembershipDatabaseCase
  # AIDEV-NOTE: These role-specific cases seed their own grants; inherited cleanup owns final-owner removal.
  def sec802_default_fixture?
    false
  end

  def setup
    super
    @target = add_actor
    explicit_member(@target)
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'owner')",
      [@org, @user])
    @admin.exec_params("INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ($1,$2,'associate')",
      [@org, @target.user_id])
    @admin.exec_params("INSERT INTO app.mailbox_security(organization_id,mailbox_id,classification) VALUES ($1,$2,'team')",
      [@org, @box])
    @admin.exec_params(<<~SQL, [@org, @box, @user])
      INSERT INTO app.mailbox_grant_ceilings(organization_id,mailbox_id,user_id,manage_members)
      VALUES ($1,$2,$3,true)
    SQL
  end

  def test_delegated_manager_can_remove_nonmanager
    assert_equal "ok", raw_change(@target.user_id, revision, flags: nil).fetch("status")
  end

  def test_ceiling_revocation_blocks_legacy_delete_without_partial_write
    @admin.exec_params("UPDATE app.mailbox_grant_ceilings SET manage_members=false WHERE mailbox_id=$1 AND user_id=$2",
      [@box, @user])
    before = revision
    assert_equal "not_found", raw_change(@target.user_id, before, flags: nil).fetch("status")
    assert_equal before, revision
    assert_equal "1", @admin.exec_params("SELECT count(*) FROM app.mailbox_memberships WHERE mailbox_id=$1 AND user_id=$2",
      [@box, @target.user_id]).getvalue(0, 0)
  end

  def test_unclassified_mailbox_blocks_legacy_delete
    @admin.exec_params("DELETE FROM app.mailbox_security WHERE mailbox_id=$1", [@box])
    before = revision
    assert_equal "not_found", raw_change(@target.user_id, before, flags: nil).fetch("status")
    assert_equal before, revision
  end
end
