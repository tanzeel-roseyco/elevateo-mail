# frozen_string_literal: true

require "tmpdir"
require_relative "approval_database_helper"
require_relative "../../lib/elevateo/send_worker/database_store"
require_relative "../../lib/elevateo/send_worker/executor"
require_relative "../../lib/elevateo/send_worker/smtp_transport"

# AIDEV-NOTE: Disposable PostgreSQL proves the Ruby worker persists the versioned Mailpit tuple.
class SendMailpitWorkerDatabaseTest < SendDatabaseTestCase
  def test_explicit_mailpit_profile_persists_acceptance_with_distinct_source
    send_id = approve.fetch("send_id")
    assert_equal [:accepted, 1], execute_mailpit(send_id, "accepted")
    row = @admin.exec_params(<<~SQL, [send_id]).first
      SELECT a.profile,o.source,o.receipt_ref FROM app_send_private.attempts a
        JOIN app_send_private.observations o ON o.attempt_id=a.attempt_id WHERE a.send_id=$1
    SQL
    assert_equal "mailpit-smtp-test-v1", row.fetch("profile")
    assert_equal "mailpit_smtp_test_v1", row.fetch("source")
    assert_match(/\Amailpit-test-v1:[0-9a-f]{64}\z/, row.fetch("receipt_ref"))
    assert_equal 1, status(send_id).fetch("attempts")
  end

  def test_ambiguous_mailpit_acceptance_remains_unknown_without_second_attempt
    send_id = approve.fetch("send_id")
    assert_equal [:unknown, 1], execute_mailpit(send_id, "unknown")
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send_id])
    assert_equal [:unknown, 0], execute_mailpit(send_id, "accepted")
    assert_equal 1, status(send_id).fetch("attempts")
    assert_equal "0", @admin.exec_params(<<~SQL, [send_id]).getvalue(0, 0)
      SELECT count(*) FROM app_send_private.observations o JOIN app_send_private.attempts a
        ON a.attempt_id=o.attempt_id WHERE a.send_id=$1
    SQL
  end

  def test_revoked_session_blocks_mailpit_client_before_submission
    send_id = approve.fetch("send_id")
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked', revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    assert_equal [:held, 0], execute_mailpit(send_id, "accepted")
    assert_equal 0, status(send_id).fetch("attempts")
  end

  private

  def execute_mailpit(send_id, result_kind)
    calls = 0
    client = Object.new
    client.define_singleton_method(:deliver) do |_rendered, deadline:|
      calls += 1
      deadline.check!
      if result_kind == "accepted"
        Elevateo::SendWorker::SubmissionResult.new(kind: "accepted", receipt_ref: "mailpit-test-v1:#{'a' * 64}")
      else
        Elevateo::SendWorker::SubmissionResult.new(kind: "unknown", code: "smtp_uncertain")
      end
    end
    profile = Elevateo::SendWorker::SmtpProfile.local_mailpit(verified_sender: "#{@box}@example.invalid")
    transport = Elevateo::SendWorker::SmtpTransport.new(profile: profile, client: client)
    Dir.mktmpdir("mailpit-worker-control-") do |dir|
      control_path = File.join(dir, "control.json")
      File.write(control_path, JSON.generate(epoch: @epoch, outbound_held: false))
      control = Elevateo::SendWorker::Control.new(path: control_path)
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id,
        profile: "mailpit-smtp-test-v1")
      outcome = Elevateo::SendWorker::Executor.new(store: store, driver: transport, control: control).run_once
      [outcome, calls]
    end
  end
end
