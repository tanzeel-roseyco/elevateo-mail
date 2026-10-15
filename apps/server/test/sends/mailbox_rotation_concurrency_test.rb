# frozen_string_literal: true

require_relative "mailbox_rotation_helper"

class MailboxRotationConcurrencyTest < MailboxRotationTestCase
  def test_concurrent_selectors_rotate_without_lost_turns
    first_box = @box
    second_box = add_box
    first, second = enqueue(first_box), enqueue(second_box)
    make_older(first)
    other = connect("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    before = @admin.exec("SELECT turn FROM app_send_private.scheduler_cursor").getvalue(0, 0).to_i
    @worker.exec("BEGIN")
    assert_equal first, due
    thread = Thread.new { due(connection: other) }
    thread.report_on_exception = false
    wait_for_lock(other, blocker: @worker.backend_pid, seconds: 0.7)
    @worker.exec("COMMIT")
    assert thread.join(3), "second selector failed to finish"
    assert_equal second, thread.value
    assert_equal before + 2, @admin.exec("SELECT turn FROM app_send_private.scheduler_cursor").getvalue(0, 0).to_i
    assert_equal 2, rotation_rows.map { |row| row.fetch("last_turn") }.uniq.length
  ensure
    @worker.exec("ROLLBACK") if @worker && @worker.transaction_status != PG::PQTRANS_IDLE
    thread&.join(4)
    other&.close
  end

  def test_committed_turn_survives_disconnection
    first_box = @box
    second_box = add_box
    first, second = enqueue(first_box), enqueue(second_box)
    make_older(first)
    assert_equal first, due
    @worker.close
    @worker = connect("BE02_WORKER_DATABASE_URL", "elevateo_worker")
    assert_equal second, due
  end

  def test_empty_roundtrip_preserves_function_oid_grants_and_dispatch
    identity = @admin.exec("SELECT oid,proacl::text FROM pg_proc WHERE oid='app_send_private.next_due_send(uuid,uuid[])'::regprocedure").first
    @admin.exec("BEGIN")
    @admin.exec(File.read(File.join(rotation_root, "mailbox_rotation_down.sql")))
    assert_nil @admin.exec("SELECT to_regclass('app_send_private.mailbox_schedule')").getvalue(0, 0)
    @admin.exec(File.read(File.join(rotation_root, "mailbox_rotation.sql")))
    assert_equal identity, @admin.exec("SELECT oid,proacl::text FROM pg_proc WHERE oid='app_send_private.next_due_send(uuid,uuid[])'::regprocedure").first
    @admin.exec("COMMIT")
    assert_equal enqueue, due
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_rollback_refuses_to_discard_existing_rotation_state
    assert_equal enqueue, due
    rows = rotation_rows
    @admin.exec("BEGIN")
    assert_raises(PG::ObjectNotInPrerequisiteState) { @admin.exec(File.read(File.join(rotation_root, "mailbox_rotation_down.sql"))) }
    @admin.exec("ROLLBACK")
    assert_equal rows, rotation_rows
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
