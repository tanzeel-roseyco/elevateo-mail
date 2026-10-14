# frozen_string_literal: true

require_relative "approval_database_helper"

class SendApprovalRacesDatabaseTest < SendDatabaseTestCase
  def test_save_commits_before_approval_then_stale_version_conflicts_without_partial_intent
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    changed = payload(expected_version: 1, operation_id: SecureRandom.uuid, subject: "changed")
    with_api_connections(1) do |connections|
      contender = connections.fetch(0)
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      assert_equal 2, save_sql(changed).fetch("version")
      waiting = Thread.new { approve(connection: contender, digest: second_digest) }
      waiting.report_on_exception = false
      begin
        wait_for_lock(contender, blocker: @api.backend_pid)
        @api.exec("COMMIT")
        assert_equal "draft_conflict", guard_result(waiting).fetch("code")
        assert_equal [0, 0, 0, 1], counts
        assert_equal "editable", draft_row.fetch("state")
        assert_equal "2", draft_row.fetch("version")
      ensure
        @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
        waiting.join(12) || raise("save-first contender did not drain")
      end
    end
  end

  def test_approval_commits_before_save_then_save_conflicts_without_version_increment
    second_digest = SecureRandom.hex(32)
    assert_equal "ok", create(digest: second_digest).fetch("status")
    changed = payload(expected_version: 1, operation_id: SecureRandom.uuid, subject: "changed")
    with_api_connections(1) do |connections|
      contender = connections.fetch(0)
      begin_write
      assert_equal "ok", write_guard.fetch("status")
      refute approve_sql.key?("code")
      waiting = Thread.new { save(changed, connection: contender, digest: second_digest) }
      waiting.report_on_exception = false
      begin
        wait_for_lock(contender, blocker: @api.backend_pid)
        @api.exec("COMMIT")
        assert_equal "draft_consumed", guard_result(waiting).fetch("code")
        assert_equal [1, 1, 1, 1], counts
        assert_equal "consumed", draft_row.fetch("state")
        assert_equal "1", draft_row.fetch("version")
        assert_equal @saved.subject, draft_row.fetch("subject")
      ensure
        @api.exec("ROLLBACK") if @api.transaction_status != PG::PQTRANS_IDLE
        waiting.join(12) || raise("approval-first contender did not drain")
      end
    end
  end
end
