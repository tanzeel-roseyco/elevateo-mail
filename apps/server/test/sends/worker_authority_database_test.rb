# frozen_string_literal: true

require_relative "approval_database_helper"

# AIDEV-NOTE: Fleet Docker exercises real worker-role SQL and exact row-lock races.
class SendWorkerAuthorityDatabaseTest < SendDatabaseTestCase
  def worker_json(sql, values)
    JSON.parse(@worker.exec_params(sql, values).getvalue(0, 0))
  end

  def claim(send, lease = SecureRandom.uuid, epoch: @epoch)
    worker_json("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)", [send, lease, epoch])
  end

  def authorize(send, lease, generation: 1, attempt: SecureRandom.uuid)
    worker_json(<<~SQL, [send, lease, generation, attempt, @epoch])
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,
        sha256(convert_to('local:synthetic-v1','UTF8')),'synthetic-v1',10)
    SQL
  end

  def observe(send, lease, generation, attempt, kind:, receipt: nil)
    worker_json(<<~SQL, [send, lease, generation, SecureRandom.uuid, attempt, kind, receipt])
      SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,$6::text,$7::text,
        sha256(convert_to('fixture:' || $4::text,'UTF8')))
    SQL
  end

  def test_claim_is_fenced_and_cancel_before_possible_submission_is_durable
    send = approve.fetch("send_id")
    first = claim(send)
    assert_equal "submit", first.fetch("action")
    assert_equal "lease_busy", claim(send).fetch("code")
    @admin.exec("BEGIN; SET LOCAL ROLE elevateo_send_owner")
    cancelled = JSON.parse(@admin.exec_params("SELECT app_send_private.cancel_job($1::uuid,$2::uuid,$3::uuid)",
      [send, @epoch, @user]).getvalue(0, 0))
    @admin.exec("COMMIT")
    assert_equal "cancelled", cancelled.fetch("state")
    assert_equal "dispatch_held", claim(send).fetch("code")
    assert_equal "cancelled", status(send).fetch("state")
  end

  def test_wrong_epoch_and_stale_lease_cannot_authorize
    send = approve.fetch("send_id")
    assert_equal "dispatch_held", claim(send, SecureRandom.uuid, epoch: SecureRandom.uuid).fetch("code")
    claim(send)
    assert_equal "dispatch_held", authorize(send, SecureRandom.uuid).fetch("code")
    assert_equal 0, status(send).fetch("attempts")
  end

  def test_authorized_attempt_then_ambiguous_reconcile_never_resubmits
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    assert_equal "submit", claim(send, lease).fetch("action")
    authorized = authorize(send, lease)
    attempt = authorized.fetch("attempt_id")
    assert_equal 1, authorized.fetch("attempt_no")
    assert_equal true, worker_json(<<~SQL, [send, lease, attempt, @epoch]).fetch("allowed")
      SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,1,$3::uuid,$4::uuid)
    SQL
    assert_equal "unknown", observe(send, lease, 1, attempt, kind: "unknown").fetch("state")
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp(),cancel_requested_at=clock_timestamp() WHERE send_id=$1", [send])
    next_lease = SecureRandom.uuid
    assert_equal "reconcile", claim(send, next_lease).fetch("action")
    binding = worker_json("SELECT app_send_private.worker_binding($1::uuid,$2::uuid,2,$3::uuid)", [send, next_lease, @epoch])
    assert_equal attempt, binding.fetch("attempt_id")
    assert_nil binding.fetch("snapshot_hex")
    assert_equal "dispatch_held", authorize(send, next_lease, generation: 2).fetch("code")
    assert_equal "accepted", observe(send, next_lease, 2, attempt, kind: "accepted", receipt: "local:#{'a' * 64}").fetch("state")
    assert_equal 1, status(send).fetch("attempts")
  end

  def test_no_evidence_reconciliation_is_bounded_and_preserves_unknown
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send, lease)
    attempt = authorize(send, lease).fetch("attempt_id")
    assert_equal "unknown", observe(send, lease, 1, attempt, kind: "unknown").fetch("state")
    (2..5).each do |generation|
      @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send])
      next_lease = SecureRandom.uuid
      assert_equal "reconcile", claim(send, next_lease).fetch("action")
      outcome = worker_json("SELECT app_send_private.reconcile_no_evidence($1::uuid,$2::uuid,$3::bigint,$4::uuid)",
        [send, next_lease, generation, attempt])
      assert_equal generation == 5 ? "needs_review" : "unknown", outcome.fetch("state")
    end
    assert_equal "dispatch_held", claim(send).fetch("code")
    assert_equal 1, status(send).fetch("attempts")
  end

  def test_suppression_change_invalidates_approved_policy_before_attempt
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send, lease)
    @admin.exec_params("INSERT INTO app_send_private.recipient_suppressions VALUES ($1,'Recipient@example.invalid',clock_timestamp())", [@org])
    assert_equal "dispatch_held", authorize(send, lease).fetch("code")
    assert_equal "needs_review", status(send).fetch("state")
    assert_equal 0, status(send).fetch("attempts")
  end

  def test_cancel_wins_after_claim_waits_on_job_row
    send = approve.fetch("send_id")
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT send_id FROM app_send_private.jobs WHERE send_id=$1 FOR UPDATE", [send])
    lease = SecureRandom.uuid
    thread = Thread.new { claim(send, lease) }
    thread.report_on_exception = false
    wait_for_lock(@worker, blocker: @admin.backend_pid, lock_kind: "transactionid", seconds: 2)
    @admin.exec("SET LOCAL ROLE elevateo_send_owner")
    result = JSON.parse(@admin.exec_params("SELECT app_send_private.cancel_job($1::uuid,$2::uuid,$3::uuid)",
      [send, @epoch, @user]).getvalue(0, 0))
    assert_equal "cancelled", result.fetch("state")
    @admin.exec("COMMIT")
    assert_equal "dispatch_held", thread.value.fetch("code")
    assert_equal "cancelled", status(send).fetch("state")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(3)
  end

  def test_committed_revocation_wins_after_session_lock_wait
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send, lease)
    @admin.exec("BEGIN")
    @admin.exec_params("SELECT cookie_digest FROM app_auth.sessions WHERE cookie_digest=$1 FOR UPDATE", [@digest])
    thread = Thread.new { authorize(send, lease) }
    thread.report_on_exception = false
    wait_for_lock(@worker, blocker: @admin.backend_pid, lock_kind: "transactionid", seconds: 2)
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    @admin.exec("COMMIT")
    assert_equal "dispatch_held", thread.value.fetch("code")
    assert_equal 0, status(send).fetch("attempts")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(3)
  end
end
