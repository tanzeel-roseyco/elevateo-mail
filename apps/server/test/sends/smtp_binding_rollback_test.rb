# frozen_string_literal: true

require_relative "approval_database_helper"
require_relative "../../lib/elevateo/send_worker/database_store"

# AIDEV-NOTE: Two real admin sessions interleave rollback/provisioning; the fixture lock isolates this destructive DDL.
class SendSmtpBindingRollbackTest < SendDatabaseTestCase
  def root = File.expand_path("../../db/be03_send", __dir__)

  def test_empty_down_up_preserves_function_acl_and_legacy_profile
    signature = "app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer)"
    before = @admin.exec_params("SELECT oid,proowner,proacl FROM pg_proc WHERE oid=$1::regprocedure", [signature]).first
    @admin.exec("BEGIN")
    @admin.exec(File.read(File.join(root, "budget_down.sql")))
    @admin.exec(File.read(File.join(root, "smtp_account_binding_down.sql")))
    assert_nil @admin.exec("SELECT to_regclass('app_send_private.smtp_accounts')").getvalue(0, 0)
    @admin.exec(File.read(File.join(root, "smtp_account_binding.sql")))
    %w[budget_schema budget_requirements budget_reservation budget_authority].each do |name|
      @admin.exec(File.read(File.join(root, "#{name}.sql")))
    end
    after = @admin.exec_params("SELECT oid,proowner,proacl FROM pg_proc WHERE oid=$1::regprocedure", [signature]).first
    assert_equal before, after
    @admin.exec("COMMIT")
    # AIDEV-NOTE: Commit the round trip so the separate worker session tests the restored functions.
    send_id = approve.fetch("send_id")
    store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id)
    claim = store.claim(epoch: @epoch)
    authorization = store.authorize_submission(claim: claim, epoch: @epoch)
    assert_nil authorization.credential_binding
    assert store.final_check(claim: claim, attempt_id: authorization.attempt_id, epoch: @epoch)
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_rollback_locks_account_provisioning_before_emptiness_check
    rollback = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    provision = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    rollback.exec("SET statement_timeout='5s'; BEGIN")
    provision.exec("SET lock_timeout='150ms'; SET statement_timeout='2s'")
    @admin.exec("BEGIN; LOCK TABLE app_send_private.attempts IN ACCESS SHARE MODE")
    rollback.send_query(File.read(File.join(root, "smtp_account_binding_down.sql")))
    wait_for_lock(rollback, blocker: @admin.backend_pid, lock_kind: "relation", seconds: 2)
    # AIDEV-NOTE: Old rollback waited on attempts only after checking emptiness, allowing this insert to succeed.
    assert_equal "t", @admin.exec_params(<<~SQL, [rollback.backend_pid]).getvalue(0, 0)
      SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND relation='app_send_private.smtp_accounts'::regclass
        AND mode='AccessExclusiveLock' AND granted)
    SQL
    assert_raises(PG::LockNotAvailable) do
      provision.exec_params(<<~SQL, [SecureRandom.uuid, @org, @box, "#{@box}@example.invalid"])
        INSERT INTO app_send_private.smtp_accounts
          (id,organization_id,mailbox_id,credential_version,credential_ref,sender,active)
          VALUES ($1,$2,$3,1,'test:synthetic',$4,true)
      SQL
    end
    @admin.exec("ROLLBACK")
    while (result = rollback.get_result)
      result.check
    end
    assert_nil rollback.exec("SELECT to_regclass('app_send_private.smtp_accounts')").getvalue(0, 0)
    rollback.exec("ROLLBACK")
    assert_equal "0", @admin.exec("SELECT count(*) FROM app_send_private.smtp_accounts").getvalue(0, 0)
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    # AIDEV-NOTE: Closing the isolated connection cancels a pending query and rolls back any uncommitted DDL.
    rollback&.close
    provision&.close
  end
end
