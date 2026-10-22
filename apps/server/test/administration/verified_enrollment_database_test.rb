# frozen_string_literal: true

require_relative "../be_02/mailbox_membership_database_helper"

# AIDEV-NOTE: A real migrator login exercises SECURITY DEFINER plus forced RLS, without admin fixture bypass.
class VerifiedEnrollmentDatabaseTest < MailboxMembershipDatabaseCase
  def sec802_default_fixture? = false

  def test_migrator_enrolls_verified_owner_and_records_receipt
    migrator do |connection|
      assert_equal "elevateo_migrator", connection.exec("SELECT session_user").getvalue(0, 0)
      connection.exec_params("SELECT app.enroll_verified_organization_grant($1,$2,'owner',$3)",
        [@org, @user, "TRANSPORT-ENROLLMENT-VERIFIED"])
    end
    row = @admin.exec_params("SELECT role,receipt_ref FROM app.organization_enrollment_receipts WHERE organization_id=$1 AND user_id=$2",
      [@org, @user]).first
    assert_equal "owner", row.fetch("role")
    assert_equal "TRANSPORT-ENROLLMENT-VERIFIED", row.fetch("receipt_ref")
  end

  def test_migrator_rejects_unverified_membership_without_receipt
    migrator do |connection|
      assert_raises(PG::ForeignKeyViolation) do
        connection.exec_params("SELECT app.enroll_verified_organization_grant($1,$2,'owner',$3)",
          [@org, SecureRandom.uuid, "TRANSPORT-ENROLLMENT-VERIFIED"])
      end
    end
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.organization_enrollment_receipts WHERE organization_id=$1", [@org]).getvalue(0, 0)
  end

  def test_runtime_cannot_enroll_even_with_forged_org_context
    @api.exec_params("SELECT set_config('app.org_id',$1,false)", [@org])
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params("SELECT app.enroll_verified_organization_grant($1,$2,'owner',$3)",
        [@org, @user, "TRANSPORT-ENROLLMENT-VERIFIED"])
    end
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.organization_access WHERE organization_id=$1", [@org]).getvalue(0, 0)
  end

  private

  def migrator
    url = ENV.fetch("BE02_MIGRATOR_DATABASE_URL")
    connection = PG.connect(url)
    yield connection
  ensure
    connection&.close
  end
end
