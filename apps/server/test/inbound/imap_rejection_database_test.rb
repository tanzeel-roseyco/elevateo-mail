# frozen_string_literal: true

require_relative "imap_rejection_database_helper"

class ImapRejectionDatabaseTest < ImapRejectionDatabaseTestCase
  def test_rejection_is_scoped_atomic_and_idempotent_with_valid_tail
    token = lease.fetch("lease_token")
    assert_equal "rejected", reject_mail(token).fetch("result")
    receipt = rejections.fetch(0)
    assert_equal [@account, @org, @box, "42", "1", "a" * 64, "unsupported_mime"],
      receipt.values_at("account_id", "organization_id", "mailbox_id", "uidvalidity", "uid", "content_sha256", "reason")
    assert_equal "1", account_row.fetch("last_uid")
    assert_equal "duplicate_rejection", reject_mail(token).fetch("result")
    assert_equal [receipt], rejections
    assert_equal "created", ingest(token, uid: 2).fetch("result")
    assert_equal "duplicate_rejection", reject_mail(token).fetch("result")
    assert_equal "2", account_row.fetch("last_uid")
    assert_equal "t", finish(token)
    make_due
    token = lease.fetch("lease_token")
    assert_equal 2, claim(token).fetch("last_uid")
  end

  def test_replay_mismatch_and_terminal_outcome_conflicts_never_replace_receipt
    token = lease.fetch("lease_token")
    reject_mail(token)
    before = rejections
    assert_raises(PG::CheckViolation) { reject_mail(token, digest: "b" * 64) }
    assert_raises(PG::CheckViolation) { reject_mail(token, reason: "invalid_text") }
    assert_raises(PG::CheckViolation) { ingest(token) }
    assert_equal "created", ingest(token, uid: 2).fetch("result")
    assert_raises(PG::CheckViolation) { reject_mail(token, uid: 2) }
    # AIDEV-NOTE: Re-entering an old epoch cannot bypass the cross-outcome guard through its now-lower cursor.
    @worker.exec_params("SELECT app.leased_reset_imap_uidvalidity($1::uuid,1,42,43,$2::uuid)", [@account, token])
    @worker.exec_params("SELECT app.leased_reset_imap_uidvalidity($1::uuid,1,43,42,$2::uuid)", [@account, token])
    assert_raises(PG::CheckViolation) { ingest(token) }
    assert_equal "0", account_row.fetch("last_uid")
    assert_equal "duplicate_rejection", reject_mail(token).fetch("result")
    assert_equal "1", account_row.fetch("last_uid")
    assert_equal before, rejections
  end

  def test_transaction_rollback_removes_both_receipt_and_progress
    token = lease.fetch("lease_token")
    @worker.exec("BEGIN")
    reject_mail(token)
    @worker.exec("ROLLBACK")
    assert_empty rejections
    assert_equal "0", account_row.fetch("last_uid")
    assert_nil account_row.fetch("uidvalidity")
    assert_equal "rejected", reject_mail(token).fetch("result")
  ensure
    @worker.exec("ROLLBACK") unless @worker.transaction_status == PG::PQTRANS_IDLE
  end

  def test_invalid_boundaries_and_unknown_reason_do_not_change_state
    token = lease.fetch("lease_token")
    [{ uid: nil }, { uid: 0 }, { uid: 2**32 }, { validity: nil }, { validity: 0 }, { validity: 2**32 },
      { digest: nil }, { digest: "" }, { digest: "a" * 63 }, { digest: "a" * 65 },
      { digest: "G" * 64 }, { reason: nil }, { reason: "" }, { reason: "store_unavailable" }].each do |options|
      before = account_row
      assert_raises(PG::InvalidParameterValue) { reject_mail(token, **options) }
      assert_equal before, account_row
      assert_empty rejections
    end
    assert_equal "rejected", reject_mail(token, uid: 2**32 - 1, validity: 2**32 - 1).fetch("result")
  end

  def test_stale_tokens_versions_disabled_accounts_and_foreign_tokens_are_denied
    token = lease.fetch("lease_token")
    [nil, SecureRandom.uuid].each { |bad| assert_raises(PG::InsufficientPrivilege) { reject_mail(bad) } }
    assert_raises(PG::InsufficientPrivilege) { reject_mail(token, version: 2) }
    other = add_account
    foreign = lease.fetch("lease_token")
    assert_raises(PG::InsufficientPrivilege) { reject_mail(foreign) }
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { reject_mail(token) }
    token = lease.fetch("lease_token")
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=false WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { reject_mail(token) }
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET active=true,poll_enabled=false WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { reject_mail(token) }
    assert_equal "0", account_row.fetch("last_uid")
    assert_empty rejections
    refute_equal @account, other
  end

  def test_changed_epoch_returns_explicit_outcome_without_new_evidence
    token = lease.fetch("lease_token")
    reject_mail(token)
    assert_equal "uidvalidity_changed", reject_mail(token, validity: 43).fetch("result")
    assert_equal "42", account_row.fetch("uidvalidity")
    assert_equal 1, rejections.length
    ingest(token, uid: 3)
    assert_raises(PG::CheckViolation) { reject_mail(token, uid: 2) }
    assert_equal "3", account_row.fetch("last_uid")
  end

  def test_direct_table_access_and_unprivileged_function_calls_are_denied
    token = lease.fetch("lease_token")
    [@api, @worker].each do |connection|
      assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM app.inbound_imap_rejections") }
      assert_raises(PG::InsufficientPrivilege) { connection.exec("DELETE FROM app.inbound_imap_rejections") }
    end
    assert_raises(PG::InsufficientPrivilege) { reject_mail(token, connection: @api) }
    assert_raises(PG::InsufficientPrivilege) { reject_mail(token, connection: @admin) }
    assert_equal "t", @admin.exec("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='app.inbound_imap_rejections'::regclass").getvalue(0, 0)
  end
end
