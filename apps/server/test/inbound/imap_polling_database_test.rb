# frozen_string_literal: true

require_relative "imap_polling_database_helper"

class ImapPollingDatabaseTest < ImapPollingDatabaseTestCase
  def test_lease_fences_every_write_and_finish_releases_with_backoff
    first = lease
    token = first.fetch("lease_token")
    assert_equal @account, first.fetch("account_id")
    assert_equal 1, first.fetch("credential_version")
    assert_nil lease
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()+interval '10 seconds' WHERE id=$1", [@account])
    assert_equal @box, claim(token).fetch("mailbox_id")
    assert_equal "t", @admin.exec_params("SELECT poll_lease_until>clock_timestamp()+interval '100 seconds' FROM app.inbound_imap_accounts WHERE id=$1", [@account]).getvalue(0, 0)
    assert_equal "created", ingest(token).fetch("result")
    assert_equal "duplicate", ingest(token).fetch("result")
    assert_equal "created", ingest(token, attachments: true, uid: 2).fetch("result")
    assert_equal "t", @worker.exec_params("SELECT app.leased_reset_imap_uidvalidity($1::uuid,1,42,43,$2::uuid)", [@account, token]).getvalue(0, 0)
    assert_equal "t", finish(token)
    row = account_row
    assert_nil row.fetch("poll_lease_token")
    assert_nil row.fetch("poll_lease_until")
    assert_nil row.fetch("poll_lease_version")
    assert_equal "0", row.fetch("poll_failures")
    assert_equal "t", @admin.exec_params("SELECT poll_next_at>clock_timestamp()+interval '50 seconds' FROM app.inbound_imap_accounts WHERE id=$1", [@account]).getvalue(0, 0)
    assert_nil lease
    assert_raises(PG::InsufficientPrivilege) { claim(token) }
  end

  def test_unleased_entrypoints_cannot_bypass_enabled_polling
    lease
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.claim_imap_account($1::uuid,1)", [@account]) }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.reset_imap_uidvalidity($1::uuid,1,NULL,42)", [@account]) }
    %w[ingest_imap_mail ingest_imap_mail_with_attachments].each do |name|
      extra = name.end_with?("attachments") ? ",NULL" : ""
      assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.#{name}($1::uuid,1,42,1,NULL,NULL,NULL,NULL,NULL#{extra})", [@account]) }
    end
    assert_equal "0", account_row.fetch("last_uid")
  end

  def test_expired_lease_recovery_rejects_all_old_operations
    old = lease.fetch("lease_token")
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [@account])
    token = lease.fetch("lease_token")
    refute_equal old, token
    before = account_row
    assert_raises(PG::InsufficientPrivilege) { claim(old) }
    assert_raises(PG::InsufficientPrivilege) { ingest(old) }
    assert_raises(PG::InsufficientPrivilege) { ingest(old, attachments: true) }
    assert_raises(PG::InsufficientPrivilege) { @worker.exec_params("SELECT app.leased_reset_imap_uidvalidity($1::uuid,1,NULL,43,$2::uuid)", [@account, old]) }
    assert_raises(PG::InsufficientPrivilege) { finish(old, "failure") }
    assert_equal before, account_row
    assert_equal "created", ingest(token).fetch("result")
  end

  def test_rotation_disable_and_binding_changes_invalidate_ownership
    ["credential_version=2", "credential_ref='test:rotated'", "active=false", "poll_enabled=false"].each do |change|
      @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=true,poll_enabled=true,credential_version=1,credential_ref='test:polling' WHERE id=$1", [@account])
      token = lease.fetch("lease_token")
      @admin.exec_params("UPDATE app.inbound_imap_accounts SET #{change} WHERE id=$1", [@account])
      row = account_row
      assert_nil row.fetch("poll_lease_token")
      assert_raises(PG::InsufficientPrivilege) { claim(token) }
      assert_raises(PG::InsufficientPrivilege) { ingest(token) }
      assert_raises(PG::InsufficientPrivilege) { finish(token) }
      assert_equal row, account_row
    end
  end

  def test_backoff_is_bounded_and_success_resets_failures
    9.times do |index|
      make_due
      assert_equal "t", finish(lease.fetch("lease_token"), "failure")
      assert_equal [index + 1, 8].min.to_s, account_row.fetch("poll_failures")
      delay = @admin.exec_params("SELECT extract(epoch FROM poll_next_at-clock_timestamp()) FROM app.inbound_imap_accounts WHERE id=$1", [@account]).getvalue(0, 0).to_f
      assert_operator delay, :>, [15 * 2**[index + 1, 8].min, 900].min - 5
      assert_operator delay, :<=, 900
      assert_nil lease
    end
    make_due
    token = lease.fetch("lease_token")
    before = account_row
    assert_raises(PG::InvalidParameterValue) { finish(token, "other") }
    assert_equal before, account_row
    assert_equal "t", finish(token, "full")
    assert_equal "0", account_row.fetch("poll_failures")
    delay = @admin.exec_params("SELECT extract(epoch FROM poll_next_at-clock_timestamp()) FROM app.inbound_imap_accounts WHERE id=$1", [@account]).getvalue(0, 0).to_f
    assert_operator delay, :>, 0
    assert_operator delay, :<=, 1
  end

  def test_competing_selectors_skip_locked_account_and_do_not_duplicate_ownership
    other = add_account
    connection = PG.connect(ENV.fetch("BE02_WORKER_DATABASE_URL"))
    @worker.exec("BEGIN")
    first = lease
    second = lease(connection: connection)
    assert_equal [@account, other].sort, [first.fetch("account_id"), second.fetch("account_id")].sort
    refute_equal first.fetch("lease_token"), second.fetch("lease_token")
    assert_nil lease(connection: connection)
    @worker.exec("COMMIT")
    assert_nil lease(connection: connection)
  ensure
    @worker.exec("ROLLBACK") unless @worker.transaction_status == PG::PQTRANS_IDLE
    connection&.close
  end

  def test_expiry_is_rechecked_after_lock_wait
    token = lease.fetch("lease_token")
    @worker.exec("SET lock_timeout='4s'; SET statement_timeout='6s'")
    @admin.exec("BEGIN")
    expires = @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING poll_lease_until", [@account]).getvalue(0, 0)
    task = Thread.new do
      claim(token)
    rescue PG::Error => error
      error
    end
    task.report_on_exception = false
    wait_for_lock(@worker, seconds: 3)
    # AIDEV-NOTE: Prove statement time predates expiry, then cross expiry under lock; stale now() must fail this test.
    assert_equal "t", @admin.exec_params("SELECT xact_start<$1::timestamptz FROM pg_stat_activity WHERE pid=$2", [expires, @worker.backend_pid]).getvalue(0, 0)
    @admin.exec_params("SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp()))+0.05)", [expires])
    @admin.exec("COMMIT")
    assert task.join(12), "claim did not finish"
    assert_instance_of PG::InsufficientPrivilege, task.value
    assert_equal "0", account_row.fetch("last_uid")
  ensure
    @admin.exec("ROLLBACK") unless @admin.transaction_status == PG::PQTRANS_IDLE
    if task && !task.join(12)
      @worker.cancel
      raise "claim cleanup timed out" unless task.join(2)
    end
  end
end
