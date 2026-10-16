# frozen_string_literal: true

require_relative "imap_polling_database_helper"

# AIDEV-NOTE: Run identical recovery/denial cases through both leased entry points against real PostgreSQL.
class ImapReceiptReplayDatabaseTest < ImapPollingDatabaseTestCase
  def attachments? = false

  def replay_ingest(token, uid: 1, validity: 42, digest: Digest::SHA256.hexdigest("raw"), body: "body")
    values = [@account, 1, validity, uid, digest,
      JSON.generate(display_name: nil, address: "sender@example.invalid"),
      JSON.generate([{ display_name: nil, address: "inbox@example.invalid" }]), "Replay", body]
    types = %w[uuid integer bigint bigint text jsonb jsonb text text]
    name = "app.leased_ingest_imap_mail"
    if attachments?
      values << JSON.generate([{ ordinal: 0, storage_key: "quarantine/imap/#{@account}/#{validity}/#{uid}/0",
        filename: "proof.txt", content_type: "text/plain", byte_size: 4, sha256: Digest::SHA256.hexdigest("data") }])
      types << "jsonb"
      name += "_with_attachments"
    end
    values << token
    types << "uuid"
    arguments = types.each_with_index.map { |type, i| "$#{i + 1}::#{type}" }.join(",")
    JSON.parse(@worker.exec_params("SELECT #{name}(#{arguments})", values).getvalue(0, 0))
  end

  def rewind_cursor
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET last_uid=0 WHERE id=$1", [@account])
  end

  def immutable_rows
    [@admin.exec_params("SELECT * FROM app.inbound_imap_receipts WHERE account_id=$1 ORDER BY uidvalidity,uid", [@account]).to_a,
      @admin.exec_params("SELECT * FROM app.inbox_attachments WHERE source_account_id=$1 ORDER BY id", [@account]).to_a]
  end

  def test_rewind_restores_cursor_without_replacing_receipts_or_scans
    token = lease.fetch("lease_token")
    first = replay_ingest(token)
    replay_ingest(token, uid: 2)
    before = immutable_rows
    rewind_cursor
    replay = replay_ingest(token)
    assert_equal "duplicate", replay.fetch("result")
    assert_equal first.values_at("message_id", "thread_id"), replay.values_at("message_id", "thread_id")
    assert_equal 1, replay.fetch("last_uid")
    assert_equal "duplicate", replay_ingest(token, uid: 2).fetch("result")
    assert_equal "2", account_row.fetch("last_uid")
    assert_equal before, immutable_rows
    assert_equal "duplicate", replay_ingest(token).fetch("result")
    assert_equal "2", account_row.fetch("last_uid")
  end

  def test_replay_mismatch_and_invalid_input_do_not_advance_cursor
    token = lease.fetch("lease_token")
    replay_ingest(token)
    before = immutable_rows
    rewind_cursor
    assert_raises(PG::CheckViolation) { replay_ingest(token, digest: Digest::SHA256.hexdigest("changed")) }
    assert_raises(PG::InvalidParameterValue) { replay_ingest(token, body: nil) }
    assert_equal "0", account_row.fetch("last_uid")
    assert_equal before, immutable_rows
    assert_equal "duplicate", replay_ingest(token).fetch("result")
  end

  def test_expired_lease_and_revoked_version_cannot_restore_cursor
    token = lease.fetch("lease_token")
    replay_ingest(token)
    rewind_cursor
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET poll_lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { replay_ingest(token) }
    assert_equal "0", account_row.fetch("last_uid")
    @admin.exec_params("UPDATE app.inbound_imap_accounts SET credential_version=2, poll_lease_until=clock_timestamp()+interval '120 seconds' WHERE id=$1", [@account])
    assert_raises(PG::InsufficientPrivilege) { replay_ingest(token) }
    assert_equal "0", account_row.fetch("last_uid")
  end

  def test_returning_to_confirmed_epoch_reuses_prior_receipt
    token = lease.fetch("lease_token")
    first = replay_ingest(token)
    reset = "SELECT app.leased_reset_imap_uidvalidity($1::uuid,1,$2::bigint,$3::bigint,$4::uuid)"
    assert_equal "t", @worker.exec_params(reset, [@account, 42, 43, token]).getvalue(0, 0)
    assert_equal "created", replay_ingest(token, validity: 43).fetch("result")
    assert_equal "t", @worker.exec_params(reset, [@account, 43, 42, token]).getvalue(0, 0)
    before = immutable_rows
    replay = replay_ingest(token)
    assert_equal "duplicate", replay.fetch("result")
    assert_equal first.fetch("message_id"), replay.fetch("message_id")
    assert_equal ["42", "1"], account_row.values_at("uidvalidity", "last_uid")
    assert_equal before, immutable_rows
  end

  def test_missing_receipt_behind_cursor_is_not_recreated
    token = lease.fetch("lease_token")
    replay_ingest(token, uid: 2)
    assert_raises(PG::CheckViolation) { replay_ingest(token, uid: 1) }
    assert_equal "2", account_row.fetch("last_uid")
    assert_equal 1, immutable_rows.first.length
  end

  def test_rejection_receipt_prevents_conflicting_import_after_rewind
    token = lease.fetch("lease_token")
    @worker.exec_params("SELECT app.leased_reject_imap_mail($1::uuid,1,42,1,$2::text,'unsupported_mime',$3::uuid)",
      [@account, Digest::SHA256.hexdigest("raw"), token])
    rewind_cursor
    assert_raises(PG::CheckViolation) { replay_ingest(token) }
    assert_equal "0", account_row.fetch("last_uid")
    assert_empty immutable_rows.first
  ensure
    @admin.exec_params("DELETE FROM app.inbound_imap_rejections WHERE account_id=$1", [@account])
  end
end

class ImapAttachmentReceiptReplayDatabaseTest < ImapReceiptReplayDatabaseTest
  def attachments? = true
end
