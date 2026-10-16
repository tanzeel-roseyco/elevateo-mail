# frozen_string_literal: true

require "active_record"
require_relative "imap_rejection_database_helper"
require_relative "../../db/migrate/20261016000026_record_imap_rejections"

class ImapRejectionMigrationTest < ImapRejectionDatabaseTestCase
  def migration(connection: @admin)
    object = RecordImapRejections.new
    # AIDEV-NOTE: Exercise actual migration SQL under its production owner role, including the table lock.
    object.define_singleton_method(:execute) do |sql|
      connection.exec("SET ROLE elevateo_owner")
      begin
        connection.exec(sql)
      ensure
        connection.exec("RESET ROLE")
      end
    end
    object
  end

  def test_empty_roundtrip_and_existing_evidence_refusal
    object = migration
    object.down
    dropped = true
    assert_nil @admin.exec("SELECT to_regclass('app.inbound_imap_rejections')").getvalue(0, 0)
    object.up
    dropped = false
    token = lease.fetch("lease_token")
    assert_equal "rejected", reject_mail(token).fetch("result")
    before = rejections
    assert_raises(PG::ObjectNotInPrerequisiteState) { object.down }
    assert_equal before, rejections
    assert_equal "duplicate_rejection", reject_mail(token).fetch("result")
  ensure
    object.up if dropped
  end

  def test_rollback_waits_for_uncommitted_receipt_and_preserves_it
    token = lease.fetch("lease_token")
    @worker.exec("BEGIN")
    reject_mail(token)
    contender = PG.connect(ENV.fetch("BE02_ADMIN_DATABASE_URL"))
    contender.exec("SET lock_timeout='4s'; SET statement_timeout='6s'")
    task = Thread.new do
      migration(connection: contender).down
    rescue PG::Error => error
      error
    end
    task.report_on_exception = false
    wait_for_lock(contender, blocker: @worker.backend_pid, lock_kind: "relation", seconds: 3)
    assert_equal "t", @worker.exec_params("SELECT $2::integer=ANY(pg_blocking_pids($1::integer))", [contender.backend_pid, @worker.backend_pid]).getvalue(0, 0)
    @worker.exec("COMMIT")
    assert task.join(8), "migration did not finish"
    assert_instance_of PG::ObjectNotInPrerequisiteState, task.value
    assert_equal 1, rejections.length
    assert_equal "1", account_row.fetch("last_uid")
  ensure
    @worker.exec("ROLLBACK") unless @worker.transaction_status == PG::PQTRANS_IDLE
    if task && !task.join(8)
      contender.cancel
      raise "migration cleanup timed out" unless task.join(2)
    end
    contender&.close
  end
end
