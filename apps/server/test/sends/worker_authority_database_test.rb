# frozen_string_literal: true

require_relative "approval_database_helper"

# AIDEV-NOTE: Docker database tests exercise the same locked functions the worker will call.
class SendWorkerAuthorityDatabaseTest < SendDatabaseTestCase
  def claim(send, lease = SecureRandom.uuid, epoch: @epoch)
    JSON.parse(@admin.exec_params(<<~SQL, [send, lease, epoch]).getvalue(0, 0))
      SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)
    SQL
  end

  def test_claim_is_fenced_and_cancel_before_possible_submission_is_durable
    send = approve.fetch("send_id")
    first = claim(send)
    assert_equal "submit", first.fetch("action")
    assert_equal "lease_busy", claim(send).fetch("code")
    cancelled = JSON.parse(@admin.exec_params(<<~SQL, [send, @epoch, @user]).getvalue(0, 0))
      SELECT app_send_private.cancel_job($1::uuid,$2::uuid,$3::uuid)
    SQL
    assert_equal "cancelled", cancelled.fetch("state")
    assert_equal "dispatch_held", claim(send).fetch("code")
    assert_equal "cancelled", status(send).fetch("state")
  end

  def test_wrong_epoch_cannot_claim_or_cancel
    send = approve.fetch("send_id")
    wrong = SecureRandom.uuid
    assert_equal "dispatch_held", claim(send, SecureRandom.uuid, epoch: wrong).fetch("code")
    result = JSON.parse(@admin.exec_params(<<~SQL, [send, wrong, @user]).getvalue(0, 0))
      SELECT app_send_private.cancel_job($1::uuid,$2::uuid,$3::uuid)
    SQL
    assert_equal "not_available", result.fetch("code")
    assert_equal "queued", status(send).fetch("state")
  end

  def test_stale_lease_cannot_authorize_attempt
    send = approve.fetch("send_id")
    claim(send)
    result = JSON.parse(@admin.exec_params(<<~SQL, [send, SecureRandom.uuid, SecureRandom.uuid, @epoch]).getvalue(0, 0))
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        decode(repeat('00',32),'hex'),'none',10)
    SQL
    assert_equal "dispatch_held", result.fetch("code")
    assert_equal 0, status(send).fetch("attempts")
  end
end
