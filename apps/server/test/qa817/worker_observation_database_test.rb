# frozen_string_literal: true

require_relative "../sends/approval_database_helper"

# AIDEV-NOTE: Only the latest local simulated attempt may become a durable accepted observation.
class QA817WorkerObservationDatabaseTest < SendDatabaseTestCase
  def worker_json(sql, values)
    JSON.parse(@worker.exec_params(sql, values).getvalue(0, 0))
  end

  def claim(send, lease)
    worker_json("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)", [send, lease, @epoch])
  end

  def authorize(send, lease, attempt)
    worker_json(<<~SQL, [send, lease, attempt, @epoch])
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        sha256(convert_to('local:synthetic-v1','UTF8')),'synthetic-v1',10)
    SQL
  end

  def observe(send, lease, attempt, receipt:, generation: 1)
    worker_json(<<~SQL, [send, lease, generation, SecureRandom.uuid, attempt, receipt])
      SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,
        'accepted',$6::text,sha256(convert_to('qa817:' || $4::text,'UTF8')))
    SQL
  end

  def test_valid_simulated_receipt_accepts_only_current_attempt
    send = approve.fetch("send_id")
    lease, attempt = SecureRandom.uuid, SecureRandom.uuid
    assert_equal "submit", claim(send, lease).fetch("action")
    assert_equal attempt, authorize(send, lease, attempt).fetch("attempt_id")
    result = observe(send, lease, attempt, receipt: "local:#{'a' * 64}")
    assert_equal "accepted", result.fetch("state")
    assert_equal 1, status(send).fetch("attempts")
  end

  def test_foreign_receipt_and_wrong_attempt_do_not_mutate_job
    send = approve.fetch("send_id")
    lease, attempt = SecureRandom.uuid, SecureRandom.uuid
    claim(send, lease)
    authorize(send, lease, attempt)
    assert_equal "request_invalid", observe(send, lease, attempt, receipt: "smtp:provider-secret").fetch("code")
    assert_equal "stale_lease", observe(send, lease, SecureRandom.uuid,
      receipt: "local:#{'a' * 64}").fetch("code")
    assert_equal "dispatching", status(send).fetch("state")
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.observations WHERE attempt_id=$1",
      [attempt]).getvalue(0, 0)
  end

  def test_stale_generation_cannot_commit_late_acceptance
    send = approve.fetch("send_id")
    lease, attempt = SecureRandom.uuid, SecureRandom.uuid
    claim(send, lease)
    authorize(send, lease, attempt)
    assert_equal "stale_lease", observe(send, lease, attempt,
      receipt: "local:#{'a' * 64}", generation: 2).fetch("code")
    assert_equal "dispatching", status(send).fetch("state")
  end
end
