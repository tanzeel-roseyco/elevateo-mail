# frozen_string_literal: true

require_relative "approval_database_helper"
require_relative "../support/smtp_account"
require_relative "../../lib/elevateo/send_worker/database_store"

# AIDEV-NOTE: Actual worker login selects account authority; admin mutations model controlled credential rotation.
class SendSmtpBindingDatabaseTest < SendDatabaseTestCase
  include SmtpAccountFixture

  def setup
    super
    create_smtp_account
  end

  def submission
    @send_id = approve.fetch("send_id")
    @store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: @send_id, profile: "mox-smtp-test-v1")
    @claim = @store.claim(epoch: @epoch)
    @authorization = @store.authorize_submission(claim: @claim, epoch: @epoch)
  end

  def final_allowed
    @store.final_check(claim: @claim, attempt_id: @authorization.attempt_id, epoch: @epoch)
  end

  def assert_no_attempt
    assert_nil submission
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.attempts WHERE send_id=$1", [@send_id]).getvalue(0, 0)
  end

  def test_missing_account_cannot_authorize
    @admin.exec_params("DELETE FROM app_send_private.smtp_accounts WHERE id=$1", [@smtp_account])
    assert_no_attempt
  end

  def test_inactive_account_cannot_authorize
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET active=false,credential_version=2 WHERE id=$1", [@smtp_account])
    assert_no_attempt
  end

  def test_wrong_sender_cannot_authorize
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET sender='wrong@example.invalid',credential_version=2 WHERE id=$1", [@smtp_account])
    assert_no_attempt
  end

  def test_complete_tuple_is_immutable_and_rotation_fails_final_check
    submission
    assert_equal smtp_binding.key(protocol: "smtp"), @authorization.credential_binding.key(protocol: "smtp")
    assert final_allowed
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET credential_version=2,credential_ref='test:rotated' WHERE id=$1", [@smtp_account])
    refute final_allowed
    row = @admin.exec_params(<<~SQL, [@authorization.attempt_id]).first
      SELECT smtp_account_id,smtp_credential_version,smtp_credential_ref,smtp_sender
        FROM app_send_private.attempts WHERE attempt_id=$1
    SQL
    assert_equal({ "smtp_account_id" => @smtp_account, "smtp_credential_version" => "1",
      "smtp_credential_ref" => "test:synthetic", "smtp_sender" => "#{@box}@example.invalid" }, row)
    assert_raises(PG::ObjectNotInPrerequisiteState) do
      @admin.exec_params("UPDATE app_send_private.attempts SET smtp_credential_version=2 WHERE attempt_id=$1", [@authorization.attempt_id])
    end
  end

  def test_disable_then_reenable_never_restores_old_attempt
    submission
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET active=false,credential_version=2 WHERE id=$1", [@smtp_account])
    refute final_allowed
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET active=true,credential_version=3 WHERE id=$1", [@smtp_account])
    refute final_allowed
  end

  def test_account_identity_and_version_cannot_be_reused
    ["id=gen_random_uuid(),credential_version=2", "organization_id=gen_random_uuid(),credential_version=2",
     "mailbox_id=gen_random_uuid(),credential_version=2",
     "credential_ref='test:other'", "sender='other@example.invalid'", "active=false"].each do |assignment|
      assert_raises(PG::ObjectNotInPrerequisiteState) do
        @admin.exec_params("UPDATE app_send_private.smtp_accounts SET #{assignment} WHERE id=$1", [@smtp_account])
      end
    end
    @admin.exec_params("UPDATE app_send_private.smtp_accounts SET credential_version=2147483647 WHERE id=$1", [@smtp_account])
    assert_raises(PG::NumericValueOutOfRange) do
      @admin.exec_params("UPDATE app_send_private.smtp_accounts SET credential_version=credential_version+1 WHERE id=$1", [@smtp_account])
    end
    assert_raises(PG::ObjectNotInPrerequisiteState) do
      @admin.exec_params("UPDATE app_send_private.smtp_accounts SET credential_version=1 WHERE id=$1", [@smtp_account])
    end
  end

  def test_runtime_roles_cannot_read_or_mutate_account_routing
    [@worker, @api].each do |connection|
      assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM app_send_private.smtp_accounts") }
      assert_raises(PG::InsufficientPrivilege) { connection.exec("UPDATE app_send_private.smtp_accounts SET active=false") }
    end
  end

  def test_legacy_unbound_attempt_is_denied_but_reconcilable
    submission
    # AIDEV-NOTE: Administrative fixture only models a pre-migration row; production history remains immutable.
    @admin.exec("BEGIN; SET LOCAL session_replication_role=replica")
    @admin.exec_params(<<~SQL, [@authorization.attempt_id])
      UPDATE app_send_private.attempts SET smtp_account_id=NULL,smtp_credential_version=NULL,
        smtp_credential_ref=NULL,smtp_sender=NULL WHERE attempt_id=$1
    SQL
    @admin.exec("COMMIT")
    refute final_allowed
    result = @store.mark_unknown(claim: @claim, attempt_id: @authorization.attempt_id, reason: "local_paused")
    assert_equal "unknown", result.fetch("state")
    assert_equal 1, status(@send_id).fetch("attempts")
  end

  def test_populated_downgrade_refuses_account_and_history
    root = File.expand_path("../../db/be03_send", __dir__)
    @admin.exec("BEGIN")
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec(File.read(File.join(root, "smtp_account_binding_down.sql"))) }
    @admin.exec("ROLLBACK")
    submission
    # AIDEV-NOTE: Corrupt fixture isolates the history guard from the account guard; runtime roles cannot do this.
    @admin.exec("BEGIN; SET LOCAL session_replication_role=replica")
    @admin.exec_params("DELETE FROM app_send_private.smtp_accounts WHERE id=$1", [@smtp_account])
    @admin.exec("COMMIT")
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.smtp_accounts").getvalue(0, 0)
    @admin.exec("BEGIN")
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec(File.read(File.join(root, "smtp_account_binding_down.sql"))) }
    @admin.exec("ROLLBACK")
    assert_equal @smtp_account, @admin.exec_params("SELECT smtp_account_id FROM app_send_private.attempts WHERE attempt_id=$1", [@authorization.attempt_id]).getvalue(0, 0)
    refute final_allowed
  end
end
