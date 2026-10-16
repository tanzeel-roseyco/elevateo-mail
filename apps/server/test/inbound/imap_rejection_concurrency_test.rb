# frozen_string_literal: true

require_relative "imap_rejection_database_helper"

class ImapRejectionConcurrencyTest < ImapRejectionDatabaseTestCase
  def accept_mail(token, connection:)
    connection.exec_params(<<~SQL, [@account, token, Digest::SHA256.hexdigest("body")])
      SELECT app.leased_ingest_imap_mail($1::uuid,1,42,1,$3,'{"address":"sender@example.invalid","display_name":null}'::jsonb,
        '[{"address":"inbox@example.invalid","display_name":null}]'::jsonb,'Poll','body',$2::uuid)
    SQL
  end

  def test_concurrent_accept_and_reject_have_exactly_one_terminal_outcome
    [true, false].each do |rejection_first|
      # AIDEV-NOTE: Separate account identities keep both lock orderings independent and observable.
      add_account unless rejection_first
      selected = lease
      @account, token = selected.fetch("account_id"), selected.fetch("lease_token")
      contender = PG.connect(ENV.fetch("BE02_WORKER_DATABASE_URL"))
      contender.exec("SET lock_timeout='4s'; SET statement_timeout='6s'")
      @worker.exec("BEGIN")
      rejection_first ? reject_mail(token) : accept_mail(token, connection: @worker)
      task = Thread.new do
        rejection_first ? accept_mail(token, connection: contender) : reject_mail(token, connection: contender)
      rescue PG::Error => error
        error
      end
      task.report_on_exception = false
      wait_for_lock(contender, blocker: @worker.backend_pid, seconds: 3)
      assert_equal "t", @admin.exec_params("SELECT $2::integer=ANY(pg_blocking_pids($1::integer))", [contender.backend_pid, @worker.backend_pid]).getvalue(0, 0)
      @worker.exec("COMMIT")
      assert task.join(8), "contender did not finish"
      assert_instance_of PG::CheckViolation, task.value
      assert_equal(rejection_first ? 1 : 0, rejections.length)
      count = @admin.exec_params("SELECT count(*) FROM app.inbound_imap_receipts WHERE account_id=$1", [@account]).getvalue(0, 0).to_i
      assert_equal(rejection_first ? 0 : 1, count)
      assert_equal "1", account_row.fetch("last_uid")
      finish(token)
    ensure
      @worker.exec("ROLLBACK") unless @worker.transaction_status == PG::PQTRANS_IDLE
      if task && !task.join(8)
        contender.cancel
        raise "contender cleanup timed out" unless task.join(2)
      end
      contender&.close
    end
  end

  def test_expiry_after_lock_wait_denies_rejection_and_progress
    token = lease.fetch("lease_token")
    @worker.exec("SET lock_timeout='4s'; SET statement_timeout='6s'")
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT id FROM app.inbound_imap_accounts WHERE id=$1 FOR UPDATE", [@account])
    task = Thread.new do
      reject_mail(token)
    rescue PG::Error => error
      error
    end
    task.report_on_exception = false
    wait_for_lock(@worker, seconds: 3)
    # AIDEV-NOTE: Set expiry after observing the waiter so scheduler delay cannot invalidate the race precondition.
    expires = @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING poll_lease_until", [@account]).getvalue(0, 0)
    assert_equal "t", @admin.exec_params("SELECT xact_start<$1::timestamptz FROM pg_stat_activity WHERE pid=$2", [expires, @worker.backend_pid]).getvalue(0, 0)
    @admin.exec_params("SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp()))+0.05)", [expires])
    @admin.exec("COMMIT")
    assert task.join(8), "rejection did not finish"
    assert_instance_of PG::InsufficientPrivilege, task.value
    assert_empty rejections
    assert_equal "0", account_row.fetch("last_uid")
  ensure
    @admin.exec("ROLLBACK") unless @admin.transaction_status == PG::PQTRANS_IDLE
    if task && !task.join(8)
      @worker.cancel
      raise "rejection cleanup timed out" unless task.join(2)
    end
  end

  def test_receipt_insert_failure_cannot_commit_cursor_or_epoch
    token = lease.fetch("lease_token")
    cleanup = "DROP TRIGGER IF EXISTS fixture_rejection_failure ON app.inbound_imap_rejections; DROP FUNCTION IF EXISTS app.fixture_rejection_failure()"
    @admin.exec(<<~SQL)
      CREATE FUNCTION app.fixture_rejection_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture insert failure' USING ERRCODE='23514'; END; $$;
      CREATE TRIGGER fixture_rejection_failure BEFORE INSERT ON app.inbound_imap_rejections
        FOR EACH ROW EXECUTE FUNCTION app.fixture_rejection_failure();
    SQL
    before = account_row
    assert_raises(PG::CheckViolation) { reject_mail(token) }
    assert_equal before, account_row
    assert_empty rejections
    @admin.exec(cleanup)
    assert_equal "rejected", reject_mail(token).fetch("result")
    assert_equal "1", account_row.fetch("last_uid")
  ensure
    @admin.exec(cleanup) if cleanup
  end
end
