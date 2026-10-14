# frozen_string_literal: true

require_relative "approval_database_helper"

class SendCancellationDatabaseTest < SendDatabaseTestCase
  def test_additive_migration_revokes_temporary_app_create
    assert_equal "f", @admin.exec("SELECT has_schema_privilege('elevateo_send_owner','app','CREATE')").getvalue(0, 0)
  end

  def cancel(send_id, mailbox: @box, digest: @digest)
    begin_write
    result = JSON.parse(@api.exec_params(
      "SELECT app.cancel_send($1::text,$2::uuid,$3::uuid,$4::uuid)",
      [digest, mailbox, send_id, @epoch]).getvalue(0, 0))
    @api.exec("COMMIT")
    result
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def test_unattempted_job_cancels_once_and_replays_without_new_audit
    send_id = approve.fetch("send_id")
    first = cancel(send_id)
    assert_equal "cancelled", first.fetch("state")
    assert_equal 0, first.fetch("attempts")
    assert_equal true, first.fetch("cancel_requested")
    assert_equal false, first.fetch("cancellable")
    assert_equal first, cancel(send_id)
    assert_equal "1", @admin.exec_params(
      "SELECT count(*) FROM app_send_private.audit_events WHERE send_id = $1 AND kind = 'cancel_requested'",
      [send_id]).getvalue(0, 0)
  end

  def test_unknown_send_identity_does_not_mutate_a_job
    send_id = approve.fetch("send_id")
    assert_equal({ "code" => "not_available" }, cancel(SecureRandom.uuid))
    assert_equal "queued", status(send_id).fetch("state")
  end

  def test_revoked_approval_capability_cannot_cancel
    send_id = approve.fetch("send_id")
    fixture_change do
      @admin.exec_params("UPDATE app.mailbox_memberships SET approve_send = false WHERE mailbox_id = $1 AND user_id = $2", [@box, @user])
    end
    assert_equal({ "code" => "not_available" }, cancel(send_id))
    assert_equal "queued", status(send_id).fetch("state")
  end

  def test_terminal_send_refuses_cancellation_without_false_success
    send_id = approve.fetch("send_id")
    fixture_change do
      @admin.exec_params("UPDATE app_send_private.jobs SET state = 'rejected', next_action = 'none', next_check_at = NULL WHERE send_id = $1", [send_id])
    end
    assert_equal({ "code" => "send_terminal" }, cancel(send_id))
    assert_equal "rejected", status(send_id).fetch("state")
  end
end
