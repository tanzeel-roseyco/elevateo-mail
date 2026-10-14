# frozen_string_literal: true

require_relative "approval_database_helper"

# AIDEV-NOTE: Only an internally simulated Mailpit attempt may persist Mailpit test provenance.
class SendMailpitTestReceiptDatabaseTest < SendDatabaseTestCase
  MODE = "mailpit-smtp-test-v1"
  SOURCE = "mailpit_smtp_test_v1"
  RECEIPT = "mailpit-test-v1:#{'a' * 64}"

  def worker_result(sql, values)
    JSON.parse(@worker.exec_params(sql, values).getvalue(0, 0))
  end

  def claim(send_id, lease)
    worker_result("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)", [send_id, lease, @epoch])
  end

  def authorize(send_id, lease, mode: MODE, hash_basis: "local:mailpit-smtp-test-v1")
    worker_result(<<~SQL, [send_id, lease, SecureRandom.uuid, @epoch, hash_basis, mode])
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        sha256(convert_to($5::text,'UTF8')),$6::text,10)
    SQL
  end

  def observe(send_id, lease, attempt, kind:, source: SOURCE, receipt: nil)
    worker_result(<<~SQL, [send_id, lease, SecureRandom.uuid, attempt, kind, receipt, source])
      SELECT app_send_private.record_observation_v2($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        $5::text,$6::text,sha256(convert_to('fixture:' || $3::text,'UTF8')),$7::text)
    SQL
  end

  def assert_expired_waiting_observation_is_rejected(mode:, hash_basis:)
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send_id, lease)
    attempt = authorize(send_id, lease, mode: mode, hash_basis: hash_basis).fetch("attempt_id")
    @admin.exec("BEGIN")
    @admin.exec_params(<<~SQL, [send_id])
      UPDATE app_send_private.jobs SET lease_expires_at=clock_timestamp()+interval '2 seconds'
        WHERE send_id=$1
    SQL
    thread = Thread.new do
      if mode == MODE
        observe(send_id, lease, attempt, kind: "accepted", receipt: RECEIPT)
      else
        worker_result(<<~SQL, [send_id, lease, SecureRandom.uuid, attempt])
          SELECT app_send_private.record_observation($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
            'accepted','local:#{'b' * 64}',sha256(convert_to('fixture','UTF8')))
        SQL
      end
    end
    thread.report_on_exception = false
    wait_for_lock(@worker, blocker: @admin.backend_pid, lock_kind: "transactionid", seconds: 2)
    assert_equal "t", @admin.exec_params(<<~SQL, [send_id]).getvalue(0, 0)
      SELECT clock_timestamp() < lease_expires_at FROM app_send_private.jobs WHERE send_id=$1
    SQL
    @admin.exec("SELECT pg_sleep(2.1)")
    @admin.exec("COMMIT")
    assert_equal "stale_lease", thread.value.fetch("code")
    row = @admin.exec_params(<<~SQL, [send_id]).first
      SELECT state,accepted_receipt_ref,lease_id::text FROM app_send_private.jobs WHERE send_id=$1
    SQL
    assert_equal "dispatching", row.fetch("state")
    assert_nil row.fetch("accepted_receipt_ref")
    assert_equal lease, row.fetch("lease_id")
    assert_equal "0", @admin.exec_params(<<~SQL, [attempt]).getvalue(0, 0)
      SELECT count(*) FROM app_send_private.observations WHERE attempt_id=$1
    SQL
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
    thread&.join(3)
  end

  def test_mailpit_observation_waiting_past_lease_expiry_is_rejected
    assert_expired_waiting_observation_is_rejected(mode: MODE, hash_basis: "local:mailpit-smtp-test-v1")
  end

  def test_legacy_observation_waiting_past_lease_expiry_is_rejected
    assert_expired_waiting_observation_is_rejected(mode: "synthetic-v1", hash_basis: "local:synthetic-v1")
  end

  def test_synthetic_profile_still_authorizes_with_its_exact_capability_hash
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    assert_equal "submit", claim(send_id, lease).fetch("action")
    attempt = authorize(send_id, lease, mode: "synthetic-v1", hash_basis: "local:synthetic-v1").fetch("attempt_id")
    assert_equal true, worker_result(<<~SQL, [send_id, lease, attempt, @epoch]).fetch("allowed")
      SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,1,$3::uuid,$4::uuid)
    SQL
  end

  def test_mailpit_test_receipt_is_persisted_only_after_fresh_authority
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    assert_equal "submit", claim(send_id, lease).fetch("action")
    attempt = authorize(send_id, lease).fetch("attempt_id")
    assert_equal true, worker_result(<<~SQL, [send_id, lease, attempt, @epoch]).fetch("allowed")
      SELECT app_send_private.final_attempt_check($1::uuid,$2::uuid,1,$3::uuid,$4::uuid)
    SQL
    assert_equal "accepted", observe(send_id, lease, attempt, kind: "accepted", receipt: RECEIPT).fetch("state")
    row = @admin.exec_params(<<~SQL, [attempt]).first
      SELECT o.source,o.receipt_ref,a.profile FROM app_send_private.observations o
        JOIN app_send_private.attempts a ON a.attempt_id=o.attempt_id WHERE a.attempt_id=$1
    SQL
    assert_equal({ "source" => SOURCE, "receipt_ref" => RECEIPT, "profile" => MODE }, row)
    assert_equal "accepted", status(send_id).fetch("state")
    assert_equal "dispatch_held", claim(send_id, SecureRandom.uuid).fetch("code")
  end

  def test_wrong_mode_source_and_receipt_are_denied_without_acceptance
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send_id, lease)
    assert_equal "request_invalid", authorize(send_id, lease, mode: "remote-smtp-v1").fetch("code")
    assert_equal "request_invalid", authorize(send_id, lease, mode: nil).fetch("code")
    attempt = authorize(send_id, lease).fetch("attempt_id")
    assert_equal "request_invalid", observe(send_id, lease, attempt, kind: "accepted",
      source: "remote_smtp", receipt: RECEIPT).fetch("code")
    assert_equal "request_invalid", observe(send_id, lease, attempt, kind: "accepted",
      receipt: "local:#{'a' * 64}").fetch("code")
    assert_equal "request_invalid", observe(send_id, lease, attempt, kind: "accepted").fetch("code")
    assert_equal "stale_lease", worker_result(<<~SQL, [send_id, lease, SecureRandom.uuid, attempt]).fetch("code")
      SELECT app_send_private.record_observation($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,'accepted',
        'local:#{'a' * 64}',sha256(convert_to('fixture','UTF8')))
    SQL
    assert_raises(PG::InsufficientPrivilege) do
      @api.exec_params(<<~SQL, [send_id, lease, SecureRandom.uuid, attempt, RECEIPT])
        SELECT app_send_private.record_observation_v2($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
          'accepted',$5::text,sha256(convert_to('fixture','UTF8')),'mailpit_smtp_test_v1')
      SQL
    end
    assert_equal "dispatching", status(send_id).fetch("state")
  end

  def test_populated_down_refuses_immutable_mailpit_attempt_history
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send_id, lease)
    authorize(send_id, lease)
    down = File.read(File.expand_path("../../db/be03_send/mailpit_test_receipt_down.sql", __dir__))
    @admin.exec("BEGIN")
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec(down) }
    @admin.exec("ROLLBACK")
    assert_equal 1, status(send_id).fetch("attempts")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_stale_capability_is_held_before_possible_submission
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send_id, lease)
    assert_equal "dispatch_held", authorize(send_id, lease, hash_basis: "remote:smtp").fetch("code")
    assert_equal "needs_review", status(send_id).fetch("state")
    assert_equal 0, status(send_id).fetch("attempts")
  end

  def test_ambiguous_mailpit_evidence_never_resubmits
    send_id = approve.fetch("send_id")
    lease = SecureRandom.uuid
    claim(send_id, lease)
    attempt = authorize(send_id, lease).fetch("attempt_id")
    assert_equal "unknown", observe(send_id, lease, attempt, kind: "unknown").fetch("state")
    assert_equal 0, @admin.exec_params("SELECT count(*) FROM app_send_private.observations WHERE attempt_id=$1", [attempt]).getvalue(0, 0).to_i
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send_id])
    next_lease = SecureRandom.uuid
    assert_equal "reconcile", claim(send_id, next_lease).fetch("action")
    assert_equal "dispatch_held", authorize(send_id, next_lease).fetch("code")
    assert_equal 1, status(send_id).fetch("attempts")
  end
end
