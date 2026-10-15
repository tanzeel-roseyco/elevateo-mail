# frozen_string_literal: true

require_relative "mailbox_rotation_helper"

class MailboxRotationDatabaseTest < MailboxRotationTestCase
  def test_old_backlog_does_not_take_a_second_turn_before_other_mailboxes
    first_box = @box
    second_box, third_box = add_box, add_box
    backlog = Array.new(8) { enqueue(first_box) }
    backlog.each { |id| make_older(id) }
    second, third = enqueue(second_box), enqueue(third_box)
    selected = []
    3.times { selected << due(excluded: selected) }
    assert_includes backlog, selected.first
    assert_equal [second, third].sort, selected.drop(1).sort
    assert_includes backlog, due(excluded: selected)
  end

  def test_newcomers_cannot_jump_ahead_of_mailboxes_already_waiting
    first_box = @box
    second_box = add_box
    first, second = enqueue(first_box), enqueue(second_box)
    make_older(first)
    assert_equal first, due
    newcomer = enqueue(add_box)
    assert_equal second, due
    assert_equal first, due
    assert_equal newcomer, due
  end

  def test_selection_changes_neither_policy_revision_nor_job_authority
    send_id = enqueue
    before = @admin.exec_params("SELECT revision FROM app_send_private.organization_policy WHERE organization_id=$1", [@org]).getvalue(0, 0)
    assert_equal send_id, due
    assert_equal before, @admin.exec_params("SELECT revision FROM app_send_private.organization_policy WHERE organization_id=$1", [@org]).getvalue(0, 0)
    row = @admin.exec_params("SELECT state,lease_id,attempt_count FROM app_send_private.jobs WHERE send_id=$1", [send_id]).first
    assert_equal({ "state" => "queued", "lease_id" => nil, "attempt_count" => "0" }, row)
    assert_equal send_id, due
  end

  def test_future_active_lease_cancel_and_wrong_epoch_are_not_selected
    send_id = enqueue
    assert_nil due(epoch: SecureRandom.uuid)
    assert_empty rotation_rows
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp()+interval '1 hour' WHERE send_id=$1", [send_id])
    assert_nil due
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp(),lease_id=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '1 hour' WHERE send_id=$1", [send_id])
    assert_nil due
    @admin.exec_params("UPDATE app_send_private.jobs SET lease_expires_at=clock_timestamp()-interval '1 second',cancel_requested_at=clock_timestamp() WHERE send_id=$1", [send_id])
    assert_nil due
    @admin.exec_params("UPDATE app_send_private.jobs SET state='unknown',next_action='reconcile' WHERE send_id=$1", [send_id])
    assert_equal send_id, due
    assert_nil due(excluded: [send_id])
  end

  def test_rollback_restores_selection_order_and_cursor
    send_id = enqueue
    before = @admin.exec("SELECT turn FROM app_send_private.scheduler_cursor").getvalue(0, 0)
    @worker.exec("BEGIN")
    assert_equal send_id, due
    @worker.exec("ROLLBACK")
    assert_equal before, @admin.exec("SELECT turn FROM app_send_private.scheduler_cursor").getvalue(0, 0)
    assert_empty rotation_rows
    assert_equal send_id, due
  ensure
    @worker.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
  end

  def test_runtime_cannot_read_or_mutate_private_rotation_state
    [@api, @worker].each do |connection|
      %w[scheduler_cursor mailbox_schedule].each do |name|
        assert_raises(PG::InsufficientPrivilege) { connection.exec("SELECT * FROM app_send_private.#{name}") }
        assert_raises(PG::InsufficientPrivilege) { connection.exec("DELETE FROM app_send_private.#{name}") }
      end
    end
  end
end
