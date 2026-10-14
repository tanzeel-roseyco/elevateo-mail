# frozen_string_literal: true

require_relative "approval_database_helper"

class SendWorkerBridgeDatabaseTest < SendDatabaseTestCase
  def claim(send, lease)
    JSON.parse(@worker.exec_params(
      "SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)",
      [send, lease, @epoch]).getvalue(0, 0))
  end

  def authorize(send, lease, generation, attempt)
    JSON.parse(@worker.exec_params(<<~SQL, [send, lease, generation, attempt, @epoch]).getvalue(0, 0))
      SELECT app_send_private.authorize_and_read($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,'none',10)
    SQL
  end

  def final_check(send, lease, generation, attempt)
    @worker.exec_params(<<~SQL, [send, lease, generation, attempt, @epoch]).getvalue(0, 0) == "t"
      SELECT app_send_private.final_submission_check($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid)
    SQL
  end

  def test_authorized_worker_reads_exact_snapshot_only_after_claim
    send = approve.fetch("send_id")
    assert_equal send, @worker.exec_params("SELECT app_send_private.next_due_send($1::uuid)", [@epoch]).getvalue(0, 0)
    lease = SecureRandom.uuid
    generation = claim(send, lease).fetch("generation")
    attempt = SecureRandom.uuid
    result = authorize(send, lease, generation, attempt)
    assert_equal @bytes, [result.fetch("snapshot_hex")].pack("H*")
    assert_equal attempt, result.fetch("attempt_id")
    assert final_check(send, lease, generation, attempt)
  end

  def test_revoked_capability_after_claim_blocks_attempt
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    generation = claim(send, lease).fetch("generation")
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET approve_send=false WHERE mailbox_id=$1 AND user_id=$2", [@box, @user])
    end
    assert_equal "dispatch_held", authorize(send, lease, generation, SecureRandom.uuid).fetch("code")
    assert_equal 0, status(send).fetch("attempts")
  end

  def test_cancellation_after_authorization_blocks_final_call_but_keeps_unknown
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    generation = claim(send, lease).fetch("generation")
    attempt = SecureRandom.uuid
    assert_equal attempt, authorize(send, lease, generation, attempt).fetch("attempt_id")
    begin_write
    result = JSON.parse(@api.exec_params("SELECT app.cancel_send($1::text,$2::uuid,$3::uuid,$4::uuid)",
      [@digest, @box, send, @epoch]).getvalue(0, 0))
    @api.exec("COMMIT")
    assert_equal "dispatching", result.fetch("state")
    assert_equal true, result.fetch("cancel_requested")
    refute final_check(send, lease, generation, attempt)
    assert_equal 1, status(send).fetch("attempts")
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end
end
