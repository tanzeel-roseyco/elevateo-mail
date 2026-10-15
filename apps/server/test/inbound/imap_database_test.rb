# frozen_string_literal: true

require_relative "../be_02/draft_database_test_helper"
require "digest"

class ImapDatabaseTest < DraftDatabaseTestCase
  ADDRESS = JSON.generate("display_name" => nil, "address" => "sender@example.invalid")
  RECIPIENTS = JSON.generate([{ "display_name" => nil, "address" => "inbox@example.invalid" }])

  def setup
    super
    @account = SecureRandom.uuid
    @admin.exec_params(<<~SQL, [@account, @org, @box])
      INSERT INTO app.inbound_imap_accounts(id,organization_id,mailbox_id,credential_ref,credential_version,active)
      VALUES($1,$2,$3,'test:synthetic-only',1,true)
    SQL
  end

  def teardown
    if @admin && @account
      @admin.exec_params("DELETE FROM app.inbound_imap_receipts WHERE account_id=$1", [@account])
      @admin.exec_params("DELETE FROM app.inbound_imap_accounts WHERE id=$1", [@account])
    end
    super
  end

  def ingest(uid: 1, validity: 42, body: "hello", version: 1)
    values = [@account, version, validity, uid, Digest::SHA256.hexdigest(body), ADDRESS, RECIPIENTS, "Subject", body]
    JSON.parse(@worker.exec_params(<<~SQL, values).getvalue(0, 0))
      SELECT app.ingest_imap_mail($1::uuid,$2::integer,$3::bigint,$4::bigint,$5::text,
        $6::jsonb,$7::jsonb,$8::text,$9::text)
    SQL
  end

  def test_import_replay_and_cursor_are_atomic
    first = ingest
    assert_equal "created", first.fetch("result")
    assert_equal "duplicate", ingest.fetch("result")
    assert_equal "1", @admin.exec_params("SELECT last_uid FROM app.inbound_imap_accounts WHERE id=$1", [@account]).getvalue(0, 0)
    assert_equal "hello", @admin.exec_params("SELECT body_text FROM app.messages WHERE id=$1", [first.fetch("message_id")]).getvalue(0, 0)
    assert_raises(PG::CheckViolation) { ingest(body: "mismatch") }
    assert_equal 1, @admin.exec_params("SELECT count(*) FROM app.inbound_imap_receipts WHERE account_id=$1", [@account]).getvalue(0, 0).to_i
  end

  def test_rollback_retry_and_uidvalidity_reset
    @worker.exec("BEGIN")
    assert_equal "created", ingest.fetch("result")
    @worker.exec("ROLLBACK")
    assert_equal "created", ingest.fetch("result")
    assert_equal "uidvalidity_changed", ingest(validity: 43).fetch("result")
    assert_equal "t", @worker.exec_params("SELECT app.reset_imap_uidvalidity($1::uuid,1,42,43)", [@account]).getvalue(0, 0)
    assert_equal "created", ingest(validity: 43).fetch("result")
    assert_equal 2, @admin.exec_params("SELECT count(*) FROM app.inbound_imap_receipts WHERE account_id=$1", [@account]).getvalue(0, 0).to_i
  ensure
    @worker.exec("ROLLBACK") if @worker.transaction_status != PG::PQTRANS_IDLE
  end

  def test_revoked_version_and_api_role_are_denied
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=false WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { ingest }
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=true,credential_version=2 WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { ingest }
    assert_raises(PG::InsufficientPrivilege) { @api.exec("SELECT app.ingest_imap_mail(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)") }
  end

  def claim(version: 1, connection: @worker)
    JSON.parse(connection.exec_params("SELECT app.claim_imap_account($1::uuid,$2::integer)", [@account, version]).getvalue(0, 0))
  end

  def test_claim_binds_tenant_and_version_and_cannot_be_called_by_api
    assert_equal({ "account_id" => @account, "organization_id" => @org, "mailbox_id" => @box,
      "credential_ref" => "test:synthetic-only", "credential_version" => 1, "uidvalidity" => nil, "last_uid" => 0 }, claim)
    assert_raises(PG::InsufficientPrivilege) { claim(connection: @api) }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec("SELECT * FROM app.inbound_imap_accounts") }
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET credential_version=2 WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { claim }
    assert_equal 2, claim(version: 2).fetch("credential_version")
  end

  def test_revocation_lock_wins_over_import_from_previous_claim
    assert_equal 1, claim.fetch("credential_version")
    @admin.exec("BEGIN")
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET credential_version=2 WHERE id=$1", [@account])
    # AIDEV-NOTE: Prove the real ingest is waiting on revocation, rather than assuming thread scheduling proves a race.
    task = Thread.new do
      ingest
    rescue PG::Error => error
      error
    end
    task.report_on_exception = false
    wait_for_lock(@worker, seconds: 3)
    @admin.exec("COMMIT")
    assert task.join(12), "worker import did not finish"
    assert_instance_of PG::InsufficientPrivilege, task.value
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app.inbound_imap_receipts WHERE account_id=$1", [@account]).getvalue(0, 0)
    assert_equal [nil, "0"], @admin.exec_params("SELECT uidvalidity,last_uid FROM app.inbound_imap_accounts WHERE id=$1", [@account]).values.first
    assert_equal "created", ingest(version: 2).fetch("result")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    if task && !task.join(12)
      @worker.cancel
      raise "import cleanup timed out" unless task.join(2)
    end
  end
end
