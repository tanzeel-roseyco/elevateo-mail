# frozen_string_literal: true

require "tmpdir"
require_relative "approval_database_helper"
require_relative "../../lib/elevateo/send_worker/database_store"
require_relative "../../lib/elevateo/send_worker/durable_local_driver"
require_relative "../../lib/elevateo/send_worker/executor"
require_relative "../../lib/elevateo/send_worker/drain"

# AIDEV-NOTE: Fleet Docker supplies a disposable PostgreSQL database and actual elevateo_worker login.
class SendWorkerDatabaseTest < SendDatabaseTestCase
  def test_queued_intent_accepts_with_fenced_worker_role
    send_id = approve.fetch("send_id")
    with_worker(send_id, "accept") do |executor, _store|
      assert_equal :accepted, executor.run_once
    end
    assert_equal "accepted", status(send_id).fetch("state")
    assert_equal 1, status(send_id).fetch("attempts")
  end

  def test_bounded_drain_discovers_queued_intent_without_private_table_read
    send_id = approve.fetch("send_id")
    Dir.mktmpdir("send-drain-") do |dir|
      control_path = File.join(dir, "control.json")
      File.write(control_path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: control_path)
      driver = Elevateo::SendWorker::DurableLocalDriver.new(path: File.join(dir, "acceptance.jsonl"), outcome: "accept")
      drain = Elevateo::SendWorker::Drain.new(connection: @worker, control: control, driver: driver,
        max_steps: 3, max_seconds: 5, idle_delay: 0.05)
      assert_equal 1, drain.run
      assert_equal "accepted", status(send_id).fetch("state")
    end
  end

  def test_due_exclusion_advances_past_oldest_queued_send
    first = approve.fetch("send_id")
    @draft = SecureRandom.uuid
    @operation = SecureRandom.uuid
    @saved = payload(subject: "second", body_text: "second",
      to: [{ "display_name" => nil, "address" => "second@example.invalid" }])
    assert_equal 1, save(@saved).fetch("version")
    @bytes = snapshot(subject: "second", recipients: [[nil, "second@example.invalid"]])
    @review_digest = Digest::SHA256.hexdigest(@bytes)
    second = approve.fetch("send_id")
    assert_equal first, Elevateo::SendWorker::DatabaseStore.next_due_send(connection: @worker,
      epoch: @epoch, excluded: [])
    assert_equal second, Elevateo::SendWorker::DatabaseStore.next_due_send(connection: @worker,
      epoch: @epoch, excluded: [first])
  end

  def test_lost_response_reconciles_after_restart_without_second_attempt
    send_id = approve.fetch("send_id")
    Dir.mktmpdir("send-ledger-") do |dir|
      ledger = File.join(dir, "acceptance.jsonl")
      assert_equal :unknown, execute(send_id, ledger, "accept_then_timeout")
      assert_equal "unknown", status(send_id).fetch("state")
      # Fixture time advance only: production uses the scheduled due timestamp.
      @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send_id])
      assert_equal :accepted, execute(send_id, ledger, "reject")
      assert_equal "accepted", status(send_id).fetch("state")
      assert_equal 1, status(send_id).fetch("attempts")
      assert_equal 1, @admin.exec_params("SELECT count(*) FROM app_send_private.attempts WHERE send_id=$1", [send_id]).getvalue(0, 0).to_i
    end
  end

  def test_revoked_session_blocks_attempt
    send_id = approve.fetch("send_id")
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked', revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    with_worker(send_id, "accept") do |executor, _store|
      assert_equal :held, executor.run_once
    end
    assert_equal "0", @admin.exec_params("SELECT attempt_count FROM app_send_private.jobs WHERE send_id=$1", [send_id]).getvalue(0, 0)
  end

  private

  def with_worker(send_id, outcome)
    Dir.mktmpdir("send-ledger-") do |dir|
      path = File.join(dir, "acceptance.jsonl")
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id)
      control_path = File.join(dir, "control.json")
      File.write(control_path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: control_path)
      driver = Elevateo::SendWorker::DurableLocalDriver.new(path: path, outcome: outcome)
      yield Elevateo::SendWorker::Executor.new(store: store, driver: driver, control: control), store
    end
  end

  def execute(send_id, ledger, outcome)
    store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id)
    control_path = File.join(File.dirname(ledger), "control.json")
    File.write(control_path, JSON.generate(epoch: @epoch, outbound_held: false))
    control = Elevateo::SendWorker::Control.new(path: control_path)
    driver = Elevateo::SendWorker::DurableLocalDriver.new(path: ledger, outcome: outcome)
    Elevateo::SendWorker::Executor.new(store: store, driver: driver, control: control).run_once
  end
end
