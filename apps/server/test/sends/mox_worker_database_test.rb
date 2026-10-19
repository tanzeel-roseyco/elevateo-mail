# frozen_string_literal: true

require "tmpdir"
require_relative "approval_database_helper"
require_relative "../support/smtp_account"
require_relative "../../lib/elevateo/send_worker/database_store"
require_relative "../../lib/elevateo/send_worker/executor"
require_relative "../../lib/elevateo/send_worker/submission_result"

# AIDEV-NOTE: Real database authority/provenance, with a counted driver double; real SMTP runs in a separate fleet gate.
class SendMoxWorkerDatabaseTest < SendDatabaseTestCase
  include SmtpAccountFixture

  def setup
    super
    create_smtp_account
  end

  MODE = "mox-smtp-test-v1"
  SOURCE = "mox_smtp_test_v1"
  RECEIPT = "mox-test-v1:#{'c' * 64}"

  def run_worker(send_id, kind: "accepted", receipt: RECEIPT)
    calls = 0
    expected_binding = smtp_binding.key(protocol: "smtp")
    driver = Object.new
    driver.define_singleton_method(:submit) do |_bytes, deadline:, credential_binding:, **_|
      raise "wrong SQL binding" unless credential_binding.key(protocol: "smtp") == expected_binding
      deadline.check!
      calls += 1
      Elevateo::SendWorker::SubmissionResult.new(kind: kind, receipt_ref: kind == "accepted" ? receipt : nil,
        code: kind == "unknown" ? "smtp_uncertain" : nil)
    end
    driver.define_singleton_method(:observation) { |**_| nil }
    Dir.mktmpdir("mox-worker-control-") do |dir|
      path = File.join(dir, "control.json")
      File.write(path, JSON.generate(epoch: @epoch, outbound_held: false))
      store = Elevateo::SendWorker::DatabaseStore.new(connection: @worker, send_id: send_id, profile: MODE)
      result = Elevateo::SendWorker::Executor.new(store: store, driver: driver,
        control: Elevateo::SendWorker::Control.new(path: path)).run_once
      [result, calls]
    end
  end

  def authorize(send_id)
    lease, attempt = SecureRandom.uuid, SecureRandom.uuid
    @worker.exec_params("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)", [send_id, lease, @epoch])
    result = @worker.exec_params(<<~SQL, [send_id, lease, attempt, @epoch]).getvalue(0, 0)
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        sha256(convert_to('local:mox-smtp-test-v1','UTF8')),'mox-smtp-test-v1',10)
    SQL
    assert_equal attempt, JSON.parse(result).fetch("attempt_id")
    [lease, attempt]
  end

  def observe(send_id, lease, attempt, source:, receipt:, connection: @worker)
    JSON.parse(connection.exec_params(<<~SQL, [send_id, lease, SecureRandom.uuid, attempt, receipt, source]).getvalue(0, 0))
      SELECT app_send_private.record_observation_v2($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        'accepted',$5::text,sha256(convert_to('fixture','UTF8')),$6::text)
    SQL
  end

  def test_worker_records_exact_mox_tuple_and_cannot_submit_twice
    send_id = approve.fetch("send_id")
    assert_equal [:accepted, 1], run_worker(send_id)
    row = @admin.exec_params(<<~SQL, [send_id]).first
      SELECT a.profile,o.source,o.receipt_ref FROM app_send_private.attempts a
        JOIN app_send_private.observations o ON o.attempt_id=a.attempt_id WHERE a.send_id=$1
    SQL
    assert_equal({ "profile" => MODE, "source" => SOURCE, "receipt_ref" => RECEIPT }, row)
    # AIDEV-NOTE: A completed job is no longer claimable; idle proves the replay never reaches transport.
    assert_equal [:idle, 0], run_worker(send_id)
    assert_equal 1, status(send_id).fetch("attempts")
  end

  def test_ambiguous_submission_reconciles_without_second_io
    send_id = approve.fetch("send_id")
    assert_equal [:unknown, 1], run_worker(send_id, kind: "unknown")
    @admin.exec_params("UPDATE app_send_private.jobs SET next_check_at=clock_timestamp() WHERE send_id=$1", [send_id])
    assert_equal [:unknown, 0], run_worker(send_id)
    assert_equal 1, status(send_id).fetch("attempts")
    assert_nil @admin.exec_params("SELECT accepted_receipt_ref FROM app_send_private.jobs WHERE send_id=$1", [send_id]).getvalue(0, 0)
  end

  def test_revocation_blocks_driver_before_attempt
    send_id = approve.fetch("send_id")
    @admin.exec_params("UPDATE app_auth.sessions SET state='revoked',revoked_at=clock_timestamp() WHERE cookie_digest=$1", [@digest])
    assert_equal [:held, 0], run_worker(send_id)
    # AIDEV-NOTE: The revoked session cannot read API status; inspect absence through the fixture administrator.
    assert_equal "0", @admin.exec_params("SELECT count(*) FROM app_send_private.attempts WHERE send_id=$1", [send_id]).getvalue(0, 0)
  end

  def test_wrong_source_prefix_and_api_role_cannot_record_mox_acceptance
    send_id = approve.fetch("send_id")
    lease, attempt = authorize(send_id)
    [[nil, RECEIPT], [SOURCE, nil], [SOURCE, "mailpit-test-v1:#{'a' * 64}"],
     ["mailpit_smtp_test_v1", RECEIPT], ["remote_smtp", RECEIPT]].each do |source, receipt|
      assert_equal "request_invalid", observe(send_id, lease, attempt, source: source, receipt: receipt).fetch("code")
    end
    assert_equal "stale_lease", observe(send_id, lease, attempt, source: "mailpit_smtp_test_v1",
      receipt: "mailpit-test-v1:#{'a' * 64}").fetch("code")
    assert_raises(PG::InsufficientPrivilege) do
      observe(send_id, lease, attempt, source: SOURCE, receipt: RECEIPT, connection: @api)
    end
    assert_equal "dispatching", status(send_id).fetch("state")
  end

  def test_populated_rollback_preserves_unresolved_history
    send_id = approve.fetch("send_id")
    authorize(send_id)
    @admin.exec("BEGIN")
    assert_raises(PG::ObjectNotInPrerequisiteState) do
      @admin.exec(File.read(File.expand_path("../../db/be03_send/mox_test_receipt_down.sql", __dir__)))
    end
    @admin.exec("ROLLBACK")
    assert_equal 1, status(send_id).fetch("attempts")
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end

  def test_empty_mox_rollback_and_reapply_preserve_mailpit_function
    send_id = approve.fetch("send_id")
    @admin.exec("BEGIN")
    root = File.expand_path("../../db/be03_send", __dir__)
    # AIDEV-NOTE: Recreate the historical v3 constraint surface inside this rolled-back fixture before testing its down.
    @admin.exec(File.read(File.join(root, "mox_test_receipt.sql")).split("CREATE OR REPLACE FUNCTION").first
      .gsub("DROP CONSTRAINT send_attempt_profile_v2", "DROP CONSTRAINT send_attempt_profile_v4")
      .gsub("DROP CONSTRAINT send_observation_source_v2", "DROP CONSTRAINT send_observation_source_v4")
      .gsub("DROP CONSTRAINT send_observation_receipt_source_v2", "DROP CONSTRAINT send_observation_receipt_source_v4"))
    @admin.exec(File.read(File.join(root, "mox_test_receipt_down.sql")))
    # AIDEV-NOTE: Execute the old provider after rollback; function-text matching alone cannot prove compatibility.
    @admin.exec("SET LOCAL ROLE elevateo_worker")
    lease, attempt = SecureRandom.uuid, SecureRandom.uuid
    @admin.exec_params("SELECT app_send_private.claim_job($1::uuid,$2::uuid,$3::uuid,30)", [send_id, lease, @epoch])
    authorized = JSON.parse(@admin.exec_params(<<~SQL, [send_id, lease, attempt, @epoch]).getvalue(0, 0))
      SELECT app_send_private.authorize_attempt($1::uuid,$2::uuid,1,$3::uuid,$4::uuid,
        sha256(convert_to('local:mailpit-smtp-test-v1','UTF8')),'mailpit-smtp-test-v1',10)
    SQL
    assert_equal attempt, authorized.fetch("attempt_id")
    assert_equal "accepted", observe(send_id, lease, attempt, source: "mailpit_smtp_test_v1",
      receipt: "mailpit-test-v1:#{'a' * 64}", connection: @admin).fetch("state")
    @admin.exec("RESET ROLE")
    assert_equal "f", @admin.exec(<<~SQL).getvalue(0, 0)
      SELECT pg_get_functiondef('app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer)'::regprocedure)
        LIKE '%mox-smtp-test-v1%'
    SQL
    # AIDEV-NOTE: A real commit checks deferred FKs before later DDL; simulate that boundary without persisting fixtures.
    @admin.exec("SET CONSTRAINTS ALL IMMEDIATE")
    @admin.exec(File.read(File.join(root, "mox_test_receipt.sql")))
    assert_equal "t", @admin.exec(<<~SQL).getvalue(0, 0)
      SELECT pg_get_functiondef('app_send_private.authorize_attempt(uuid,uuid,bigint,uuid,uuid,bytea,text,integer)'::regprocedure)
        LIKE '%mox-smtp-test-v1%'
    SQL
  ensure
    @admin.exec("ROLLBACK") if @admin && @admin.transaction_status != PG::PQTRANS_IDLE
  end
end
