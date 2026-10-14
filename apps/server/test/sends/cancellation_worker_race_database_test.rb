# frozen_string_literal: true

require_relative "approval_database_helper"
require "tmpdir"
require_relative "../../lib/elevateo/send_worker/database_store"
require_relative "../../lib/elevateo/send_worker/durable_local_driver"
require_relative "../../lib/elevateo/send_worker/executor"

# AIDEV-NOTE: These races use Rowan's durable worker functions and the public cancellation API facade.
class SendCancellationWorkerRaceDatabaseTest < SendDatabaseTestCase
  def claim(send, lease)
    JSON.parse(@worker.exec_params("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)",
      [send, lease, @epoch]).getvalue(0, 0))
  end

  def authorize(send, lease, generation, attempt)
    JSON.parse(@worker.exec_params(<<~SQL, [send, lease, generation, attempt, @epoch]).getvalue(0, 0))
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,
        sha256(convert_to('local:synthetic-v1','UTF8')),'synthetic-v1',10)
    SQL
  end

  def cancel(send)
    begin_write
    assert_equal "ok", write_guard.fetch("status")
    result = JSON.parse(@api.exec_params("SELECT app.cancel_send($1::text,$2::uuid,$3::uuid,$4::uuid)",
      [@digest, @box, send, @epoch]).getvalue(0, 0))
    @api.exec("COMMIT")
    result
  ensure
    @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
  end

  def test_cancel_after_claim_before_attempt_revokes_lease_without_possible_call
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    generation = claim(send, lease).fetch("generation")
    result = cancel(send)
    assert_equal "cancelled", result.fetch("state")
    assert_equal 0, result.fetch("attempts")
    assert_equal "dispatch_held", authorize(send, lease, generation, SecureRandom.uuid).fetch("code")
  end

  def test_cancel_after_attempt_does_not_erase_late_accepted_evidence
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    generation = claim(send, lease).fetch("generation")
    attempt = SecureRandom.uuid
    assert_equal attempt, authorize(send, lease, generation, attempt).fetch("attempt_id")
    result = cancel(send)
    assert_equal "dispatching", result.fetch("state")
    assert_equal true, result.fetch("cancel_requested")
    accepted = JSON.parse(@worker.exec_params(<<~SQL, [send, lease, generation, SecureRandom.uuid, attempt]).getvalue(0, 0))
      SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,
        'accepted','local:#{'a' * 64}',decode(repeat('11',32),'hex'))
    SQL
    assert_equal "accepted", accepted.fetch("state")
    assert_equal "accepted", status(send).fetch("state")
    assert_equal({ "code" => "send_terminal" }, cancel(send))
  end

  def test_stop_requested_unknown_still_claims_reconciliation_without_resubmit
    send = approve.fetch("send_id")
    lease = SecureRandom.uuid
    generation = claim(send, lease).fetch("generation")
    attempt = SecureRandom.uuid
    assert_equal attempt, authorize(send, lease, generation, attempt).fetch("attempt_id")
    unknown = JSON.parse(@worker.exec_params(<<~SQL, [send, lease, generation, SecureRandom.uuid, attempt]).getvalue(0, 0))
      SELECT app_send_private.record_observation($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::uuid,
        'unknown',NULL,decode(repeat('22',32),'hex'))
    SQL
    assert_equal "unknown", unknown.fetch("state")
    assert_equal "unknown", cancel(send).fetch("state")
    fixture_change do
      @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp()-interval '1 second' WHERE send_id=$1", [send])
    end
    renewed = claim(send, SecureRandom.uuid)
    assert_equal "reconcile", renewed.fetch("action")
    assert_equal 1, status(send).fetch("attempts")
  end

  def test_local_lost_acceptance_then_cancel_reconciles_same_attempt
    send = approve.fetch("send_id")
    Dir.mktmpdir("send-cancel-ledger-") do |directory|
      control_path = File.join(directory, "control.json")
      ledger_path = File.join(directory, "ledger.jsonl")
      File.write(control_path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: control_path)
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send)
      driver = Elevateo::SendWorker::DurableLocalDriver.new(path: ledger_path, outcome: "accept_then_timeout")
      assert_equal :unknown, Elevateo::SendWorker::Executor.new(store: store, driver: driver, control: control).run_once
      assert_equal "unknown", cancel(send).fetch("state")
      fixture_change do
        @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp()-interval '1 second' WHERE send_id=$1", [send])
      end
      restarted = Elevateo::SendWorker::DurableLocalDriver.new(path: ledger_path, outcome: "reject")
      assert_equal :accepted, Elevateo::SendWorker::Executor.new(store: store, driver: restarted, control: control).run_once
      assert_equal "accepted", status(send).fetch("state")
      assert_equal 1, status(send).fetch("attempts")
    end
  end
end
